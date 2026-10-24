import argon2 from 'argon2';

/**
 * Argon2id helpers for password-based accounts (admin SSO/email+password per SPEC).
 * End users authenticate with phone OTP — OTP codes use sha256 + timing-safe compare.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
