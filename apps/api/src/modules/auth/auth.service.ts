import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../../config.js';
import { decryptField, encryptField, maskPhone, safeEqual, sha256 } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';
import { prisma } from '../../lib/prisma.js';
import { issueRefreshToken, signAccessToken, signTrustToken } from '../../lib/tokens.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

function isLikelyCiphertext(value: string): boolean {
  return !value.startsWith('+') && value.length > 24;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}•••@${domain}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type AuthSessionResult = {
  accessToken: string;
  trustToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: {
    id: string;
    displayName: string;
    ageVerified: boolean;
    email: string | null;
    phoneE164Masked: string | null;
  };
};

export class AuthService {
  constructor(private config: AppConfig) {}

  private encryptPhone(phoneE164: string): string {
    return encryptField(phoneE164, this.config.FIELD_ENCRYPTION_KEY);
  }

  revealPhone(stored: string | null | undefined): string | null {
    if (!stored) return null;
    if (!isLikelyCiphertext(stored)) return stored;
    try {
      return decryptField(stored, this.config.FIELD_ENCRYPTION_KEY);
    } catch {
      return null;
    }
  }

  googleConfigured(): boolean {
    return Boolean(this.config.GOOGLE_CLIENT_ID && this.config.GOOGLE_CLIENT_SECRET);
  }

  googleMockEnabled(): boolean {
    if (this.config.NODE_ENV === 'production') return false;
    return this.config.GOOGLE_OAUTH_MOCK || this.config.NODE_ENV === 'test';
  }

  googleCallbackUrl(): string {
    return `${this.config.API_ORIGIN}/api/v1/auth/google/callback`;
  }

  /** Build Google OAuth authorization URL + opaque state for CSRF. */
  beginGoogleOAuth(): { url: string; state: string } {
    if (!this.googleConfigured()) {
      throw new AppError(
        'google_not_configured',
        'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        503,
      );
    }
    const state = randomBytes(24).toString('base64url');
    const params = new URLSearchParams({
      client_id: this.config.GOOGLE_CLIENT_ID!,
      redirect_uri: this.googleCallbackUrl(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return { url: `${GOOGLE_AUTH_URL}?${params.toString()}`, state };
  }

  async handleGoogleCallback(input: {
    code: string;
    state: string;
    expectedState: string | undefined;
    userAgent?: string;
    ipHash?: string;
    deviceFingerprint?: string;
  }): Promise<AuthSessionResult> {
    if (!this.googleConfigured()) {
      throw new AppError('google_not_configured', 'Google sign-in is not configured', 503);
    }
    if (!input.expectedState || !safeEqual(input.state, input.expectedState)) {
      throw new AppError('oauth_state_invalid', 'Invalid OAuth state. Try again.', 400);
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: this.config.GOOGLE_CLIENT_ID!,
        client_secret: this.config.GOOGLE_CLIENT_SECRET!,
        redirect_uri: this.googleCallbackUrl(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      throw new AppError('google_token_exchange_failed', 'Could not complete Google sign-in', 502);
    }
    const tokenJson = (await tokenRes.json()) as { id_token?: string };
    if (!tokenJson.id_token) {
      throw new AppError('google_token_missing', 'Google did not return an ID token', 502);
    }
    return this.loginWithGoogleIdToken({
      idToken: tokenJson.id_token,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
      deviceFingerprint: input.deviceFingerprint,
    });
  }

  async loginWithGoogleIdToken(input: {
    idToken: string;
    displayName?: string;
    deviceFingerprint?: string;
    userAgent?: string;
    ipHash?: string;
  }): Promise<AuthSessionResult> {
    if (!this.config.GOOGLE_CLIENT_ID) {
      throw new AppError('google_not_configured', 'Google sign-in is not configured', 503);
    }
    let payload: { sub?: string; email?: string; email_verified?: boolean; name?: string };
    try {
      const verified = await jwtVerify(input.idToken, GOOGLE_JWKS, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: this.config.GOOGLE_CLIENT_ID,
      });
      payload = verified.payload as typeof payload;
    } catch {
      throw new AppError('google_token_invalid', 'Invalid Google credential', 401);
    }

    const googleSub = payload.sub;
    const email = payload.email ? normalizeEmail(payload.email) : null;
    if (!googleSub || !email) {
      throw new AppError('google_profile_incomplete', 'Google account must share email', 400);
    }
    if (payload.email_verified === false) {
      throw new AppError('google_email_unverified', 'Verify your Google email first', 400);
    }

    return this.upsertGoogleUserAndSession({
      googleSub,
      email,
      displayName: input.displayName?.trim() || payload.name?.trim() || email.split('@')[0] || 'New friend',
      deviceFingerprint: input.deviceFingerprint,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
    });
  }

  /** Dev/CI mock of Google identity — never in production. */
  async loginWithGoogleMock(input: {
    email: string;
    googleSub?: string;
    displayName?: string;
    deviceFingerprint?: string;
    userAgent?: string;
    ipHash?: string;
  }): Promise<AuthSessionResult> {
    if (!this.googleMockEnabled()) {
      throw new AppError('forbidden', 'Google mock login is disabled', 403);
    }
    const email = normalizeEmail(input.email);
    const googleSub = input.googleSub?.trim() || `mock-google:${sha256(email).slice(0, 24)}`;
    return this.upsertGoogleUserAndSession({
      googleSub,
      email,
      displayName: input.displayName?.trim() || email.split('@')[0] || 'New friend',
      deviceFingerprint: input.deviceFingerprint,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
    });
  }

  async signupWithEmail(input: {
    email: string;
    password: string;
    displayName?: string;
    deviceFingerprint?: string;
    userAgent?: string;
    ipHash?: string;
  }): Promise<AuthSessionResult> {
    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('email_taken', 'An account with this email already exists', 409);
    }
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: input.displayName?.trim() || email.split('@')[0] || 'New friend',
        profile: { create: {} },
      },
    });
    return this.issueSession(user, {
      deviceFingerprint: input.deviceFingerprint,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
    });
  }

  async loginWithEmail(input: {
    email: string;
    password: string;
    deviceFingerprint?: string;
    userAgent?: string;
    ipHash?: string;
  }): Promise<AuthSessionResult> {
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new AppError('invalid_credentials', 'Invalid email or password', 401);
    }
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) {
      throw new AppError('invalid_credentials', 'Invalid email or password', 401);
    }
    if (user.status === 'banned') {
      throw new AppError('banned', 'Account banned', 403);
    }
    return this.issueSession(user, {
      deviceFingerprint: input.deviceFingerprint,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
    });
  }

  private async upsertGoogleUserAndSession(input: {
    googleSub: string;
    email: string;
    displayName: string;
    deviceFingerprint?: string;
    userAgent?: string;
    ipHash?: string;
  }): Promise<AuthSessionResult> {
    let user =
      (await prisma.user.findUnique({ where: { googleSub: input.googleSub } })) ??
      (await prisma.user.findUnique({ where: { email: input.email } }));

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleSub: user.googleSub ?? input.googleSub,
          email: user.email ?? input.email,
          displayName: user.displayName || input.displayName,
          lastSeenAt: new Date(),
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          googleSub: input.googleSub,
          email: input.email,
          displayName: input.displayName,
          profile: { create: {} },
        },
      });
    }

    if (user.status === 'banned') {
      throw new AppError('banned', 'Account banned', 403);
    }

    return this.issueSession(user, {
      deviceFingerprint: input.deviceFingerprint,
      userAgent: input.userAgent,
      ipHash: input.ipHash,
    });
  }

  private async issueSession(
    user: {
      id: string;
      displayName: string;
      ageVerified: boolean;
      trustTier: string;
      email: string | null;
      phoneE164: string | null;
    },
    meta: { deviceFingerprint?: string; userAgent?: string; ipHash?: string },
  ): Promise<AuthSessionResult> {
    if (meta.deviceFingerprint) {
      await prisma.device.upsert({
        where: {
          userId_fingerprintHash: {
            userId: user.id,
            fingerprintHash: sha256(meta.deviceFingerprint),
          },
        },
        create: {
          userId: user.id,
          fingerprintHash: sha256(meta.deviceFingerprint),
          userAgent: meta.userAgent,
          ipHash: meta.ipHash,
        },
        update: {
          lastSeen: new Date(),
          userAgent: meta.userAgent,
          ipHash: meta.ipHash,
        },
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    const accessToken = await signAccessToken(this.config, {
      sub: user.id,
      ageVerified: user.ageVerified,
      trustTier: user.trustTier,
    });
    const trustToken = await signTrustToken(this.config, {
      sub: user.id,
      ageVerified: user.ageVerified,
      trustTier: user.trustTier,
    });
    const refresh = issueRefreshToken();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refresh.hash,
        expiresAt: refresh.expiresAt,
      },
    });

    const clearPhone = this.revealPhone(user.phoneE164);

    return {
      accessToken,
      trustToken,
      refreshToken: refresh.raw,
      refreshExpiresAt: refresh.expiresAt,
      user: {
        id: user.id,
        displayName: user.displayName,
        ageVerified: user.ageVerified,
        email: user.email,
        phoneE164Masked: clearPhone ? maskPhone(clearPhone) : null,
      },
    };
  }

  async refresh(rawToken: string) {
    const hash = sha256(rawToken);
    const row = await prisma.refreshToken.findFirst({
      where: { tokenHash: hash, revokedAt: null },
      include: { user: true },
    });
    if (!row || row.expiresAt < new Date()) {
      throw new AppError('refresh_invalid', 'Session expired. Sign in again.', 401);
    }
    if (row.user.status === 'banned') {
      throw new AppError('banned', 'Account banned', 403);
    }
    await prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    const next = issueRefreshToken();
    await prisma.refreshToken.create({
      data: {
        userId: row.userId,
        tokenHash: next.hash,
        expiresAt: next.expiresAt,
      },
    });
    const accessToken = await signAccessToken(this.config, {
      sub: row.user.id,
      ageVerified: row.user.ageVerified,
      trustTier: row.user.trustTier,
    });
    return { accessToken, refreshToken: next.raw, refreshExpiresAt: next.expiresAt };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const hash = sha256(rawToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export { maskEmail };
