import { describe, expect, it } from 'vitest';
import { sha256, maskPhone } from '../../lib/crypto.js';

describe('auth helpers', () => {
  it('hashes consistently', () => {
    expect(sha256('123456')).toBe(sha256('123456'));
    expect(sha256('123456')).not.toBe(sha256('654321'));
  });

  it('masks phone numbers', () => {
    expect(maskPhone('+919876543210')).toMatch(/^\+91/);
    expect(maskPhone('+919876543210')).toContain('••');
  });
});
