import { describe, expect, it } from 'vitest';
import { MockSmsProvider, createSmsProvider } from './sms.js';

describe('SMS providers', () => {
  it('returns mock when SMS_PROVIDER=mock', () => {
    const p = createSmsProvider('mock');
    expect(p).toBeInstanceOf(MockSmsProvider);
  });

  it('throws for twilio without keys', () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM;
    expect(() => createSmsProvider('twilio')).toThrow(/TWILIO_/);
  });

  it('throws for unknown provider', () => {
    expect(() => createSmsProvider('pigeon')).toThrow(/Unknown SMS_PROVIDER/);
  });
});
