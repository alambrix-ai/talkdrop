import argon2 from 'argon2';

/**
 * Argon2id helpers for email+password secondary auth (and future admin accounts).
 * Primary end-user path is Sign in with Google (OIDC).
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
