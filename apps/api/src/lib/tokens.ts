import { SignJWT, jwtVerify } from 'jose';
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC } from '@talkdrop/shared';
import type { AppConfig } from '../config.js';
import { randomBytes } from 'node:crypto';
import { sha256 } from './crypto.js';

export interface AccessClaims {
  sub: string;
  ageVerified: boolean;
  trustTier: string;
  typ: 'access';
}

export interface TrustClaims {
  sub: string;
  ageVerified: boolean;
  trustTier: string;
  typ: 'trust';
}

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  config: AppConfig,
  claims: Omit<AccessClaims, 'typ'>,
): Promise<string> {
  return new SignJWT({ ...claims, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .sign(key(config.JWT_ACCESS_SECRET));
}

export async function verifyAccessToken(config: AppConfig, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, key(config.JWT_ACCESS_SECRET));
  if (payload.typ !== 'access' || typeof payload.sub !== 'string') {
    throw new Error('invalid_token');
  }
  return {
    sub: payload.sub,
    ageVerified: Boolean(payload.ageVerified),
    trustTier: String(payload.trustTier ?? 'new'),
    typ: 'access',
  };
}

export async function signTrustToken(
  config: AppConfig,
  claims: Omit<TrustClaims, 'typ'>,
): Promise<string> {
  return new SignJWT({ ...claims, typ: 'trust' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key(config.TRUST_TOKEN_SECRET));
}

export function issueRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString('base64url');
  return {
    raw,
    hash: sha256(raw),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
  };
}
