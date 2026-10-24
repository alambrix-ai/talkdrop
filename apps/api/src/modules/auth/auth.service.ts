import { OTP_TTL_SEC } from '@talkdrop/shared';
import type { AppConfig } from '../../config.js';
import { maskPhone, randomCode, sha256 } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { issueRefreshToken, signAccessToken, signTrustToken } from '../../lib/tokens.js';
import type { Providers } from '../../providers/index.js';

const DISPOSABLE_PREFIXES = ['+1555555', '+1000000'];

export class AuthService {
  constructor(
    private config: AppConfig,
    private providers: Providers,
  ) {}

  async requestOtp(phoneE164: string): Promise<{ sent: true; devCode?: string }> {
    if (DISPOSABLE_PREFIXES.some((p) => phoneE164.startsWith(p))) {
      throw new AppError('disposable_phone', 'Disposable numbers are not allowed', 400);
    }

    const code = process.env.NODE_ENV === 'test' ? '123456' : randomCode(6);
    const expiresAt = new Date(Date.now() + OTP_TTL_SEC * 1000);
    await prisma.authOtp.create({
      data: {
        phoneE164,
        codeHash: sha256(code),
        expiresAt,
      },
    });
    await this.providers.sms.sendOtp(phoneE164, code);
    return {
      sent: true,
      ...(this.config.NODE_ENV !== 'production' ? { devCode: code } : {}),
    };
  }

  async verifyOtp(input: {
    phoneE164: string;
    code: string;
    displayName?: string;
    deviceFingerprint?: string;
    userAgent?: string;
    ipHash?: string;
  }) {
    const otp = await prisma.authOtp.findFirst({
      where: { phoneE164: input.phoneE164, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date()) {
      throw new AppError('otp_expired', 'Code expired. Request a new one.', 400);
    }
    if (otp.attempts >= 5) {
      throw new AppError('otp_locked', 'Too many attempts. Request a new code.', 429);
    }
    if (otp.codeHash !== sha256(input.code)) {
      await prisma.authOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppError('otp_invalid', 'Invalid code', 400);
    }

    await prisma.authOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    let user = await prisma.user.findUnique({ where: { phoneE164: input.phoneE164 } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phoneE164: input.phoneE164,
          displayName: input.displayName?.trim() || 'New friend',
          profile: { create: {} },
        },
      });
    }

    if (input.deviceFingerprint) {
      await prisma.device.upsert({
        where: {
          userId_fingerprintHash: {
            userId: user.id,
            fingerprintHash: sha256(input.deviceFingerprint),
          },
        },
        create: {
          userId: user.id,
          fingerprintHash: sha256(input.deviceFingerprint),
          userAgent: input.userAgent,
          ipHash: input.ipHash,
        },
        update: {
          lastSeen: new Date(),
          userAgent: input.userAgent,
          ipHash: input.ipHash,
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

    return {
      accessToken,
      trustToken,
      refreshToken: refresh.raw,
      refreshExpiresAt: refresh.expiresAt,
      user: {
        id: user.id,
        displayName: user.displayName,
        ageVerified: user.ageVerified,
        phoneE164Masked: user.phoneE164 ? maskPhone(user.phoneE164) : null,
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
