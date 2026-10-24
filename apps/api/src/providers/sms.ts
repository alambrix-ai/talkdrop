import type { SmsProvider } from '@talkdrop/shared';
import { maskPhone } from '../lib/crypto.js';

export class MockSmsProvider implements SmsProvider {
  public lastSent: Array<{ phone: string; code: string }> = [];

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    this.lastSent.push({ phone: phoneE164, code });
    if (process.env.NODE_ENV !== 'test') {
      // Never log OTP codes or full phone numbers
      console.info(`[mock-sms] OTP queued for ${maskPhone(phoneE164)}`);
    }
  }
}

/** Twilio Programmable Messaging — requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM. */
export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private accountSid: string,
    private authToken: string,
    private from: string,
  ) {}

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    const body = new URLSearchParams({
      To: phoneE164,
      From: this.from,
      Body: `Your Talkdrop code is ${code}. It expires in 10 minutes.`,
    });
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Twilio SMS failed (${res.status}): ${text}`);
    }
  }
}

/** MessageBird — requires MESSAGEBIRD_API_KEY, MESSAGEBIRD_ORIGINATOR. */
export class MessageBirdSmsProvider implements SmsProvider {
  constructor(
    private apiKey: string,
    private originator: string,
  ) {}

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    const res = await fetch('https://rest.messagebird.com/messages', {
      method: 'POST',
      headers: {
        Authorization: `AccessKey ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originator: this.originator,
        recipients: [phoneE164],
        body: `Your Talkdrop code is ${code}. It expires in 10 minutes.`,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MessageBird SMS failed (${res.status}): ${text}`);
    }
  }
}

export function createSmsProvider(kind: string): SmsProvider {
  const provider = (kind || 'mock').toLowerCase();
  if (provider === 'mock') return new MockSmsProvider();

  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !token || !from) {
      throw new Error(
        'SMS_PROVIDER=twilio requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM',
      );
    }
    console.info('[sms] using TwilioSmsProvider');
    return new TwilioSmsProvider(sid, token, from);
  }

  if (provider === 'messagebird') {
    const key = process.env.MESSAGEBIRD_API_KEY;
    const originator = process.env.MESSAGEBIRD_ORIGINATOR ?? 'Talkdrop';
    if (!key) {
      throw new Error('SMS_PROVIDER=messagebird requires MESSAGEBIRD_API_KEY');
    }
    console.info('[sms] using MessageBirdSmsProvider');
    return new MessageBirdSmsProvider(key, originator);
  }

  throw new Error(`Unknown SMS_PROVIDER=${kind} (use mock | twilio | messagebird)`);
}
