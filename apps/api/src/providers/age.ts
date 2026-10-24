import type { AgeVerificationProvider, VerificationResult } from '@talkdrop/shared';

/**
 * On-device estimate path (SPEC §7.2 / §13.4).
 *
 * The browser estimates age locally (never uploads the face). Only the estimate
 * result reaches the server. Thresholds: pass ≥21 @ confidence ≥0.8 with
 * liveness; uncertain otherwise for fallback; fail under 18.
 *
 * Document-check is a vendor redirect stub — pick a market vendor (Persona,
 * Veriff, Yoti, etc.) and set AGE_DOCUMENT_REDIRECT_URL before production.
 * We do not invent paid vendor accounts here.
 */
export class MockAgeVerificationProvider implements AgeVerificationProvider {
  async verifyFromEstimate(input: {
    estimatedAge: number;
    confidence: number;
    liveness: boolean;
  }): Promise<VerificationResult> {
    if (!input.liveness) return 'uncertain';
    if (input.estimatedAge >= 21 && input.confidence >= 0.8) return 'passed';
    if (input.estimatedAge >= 18 && input.confidence >= 0.6) return 'uncertain';
    return 'failed';
  }

  async startDocumentCheck(userId: string): Promise<{ redirectUrl: string }> {
    const base =
      process.env.AGE_DOCUMENT_REDIRECT_URL ??
      'https://example.com/age-document-check';
    const url = new URL(base);
    url.searchParams.set('user', userId);
    url.searchParams.set('return', process.env.WEB_ORIGIN ?? 'http://localhost:5173');
    return { redirectUrl: url.toString() };
  }
}

/** Same thresholds as mock; intended for production until a vendor is wired. */
export class OnDeviceAgeProvider extends MockAgeVerificationProvider {}

export function createAgeProvider(kind: string): AgeVerificationProvider {
  const provider = (kind || 'mock').toLowerCase();
  if (provider === 'mock' || provider === 'ondevice' || provider === 'on-device') {
    return provider === 'mock'
      ? new MockAgeVerificationProvider()
      : new OnDeviceAgeProvider();
  }
  // Unknown vendors fall back to on-device estimate + document stub
  console.warn(`[age] Unknown AGE_PROVIDER=${kind}; using on-device thresholds`);
  return new OnDeviceAgeProvider();
}
