import type { SmsProvider } from '@talkdrop/shared';

export class MockSmsProvider implements SmsProvider {
  public lastSent: Array<{ phone: string; code: string }> = [];

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    this.lastSent.push({ phone: phoneE164, code });
    if (process.env.NODE_ENV !== 'test') {
      console.info(`[mock-sms] OTP for ${phoneE164}: ${code}`);
    }
  }
}

export function createSmsProvider(kind: string): SmsProvider {
  if (kind === 'mock') return new MockSmsProvider();
  return new MockSmsProvider();
}
