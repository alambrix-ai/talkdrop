import { describe, expect, it } from 'vitest';
import { sha256, maskPhone, safeEqual } from '../../lib/crypto.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';

describe('auth helpers', () => {
  it('hashes consistently', () => {
    expect(sha256('123456')).toBe(sha256('123456'));
    expect(sha256('123456')).not.toBe(sha256('654321'));
  });

  it('compares OTP hashes timing-safely', () => {
    const a = sha256('123456');
    expect(safeEqual(a, sha256('123456'))).toBe(true);
    expect(safeEqual(a, sha256('654321'))).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('masks phone numbers', () => {
    expect(maskPhone('+919876543210')).toMatch(/^\+91/);
    expect(maskPhone('+919876543210')).toContain('••');
  });

  it('argon2id hashes passwords for future admin accounts', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash.startsWith('$argon2')).toBe(true);
    expect(await verifyPassword(hash, 'correct-horse-battery')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});
