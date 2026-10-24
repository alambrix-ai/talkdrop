import type { AgeVerificationProvider, VerificationResult } from '@talkdrop/shared';

export class MockAgeVerificationProvider implements AgeVerificationProvider {
  async verifyFromEstimate(input: {
    estimatedAge: number;
    confidence: number;
    liveness: boolean;
  }): Promise<VerificationResult> {
    // Pass requires estimate >= 21 with confidence >= 0.8 and liveness
    if (!input.liveness) return 'uncertain';
    if (input.estimatedAge >= 21 && input.confidence >= 0.8) return 'passed';
    if (input.estimatedAge >= 18 && input.confidence >= 0.6) return 'uncertain';
    return 'failed';
  }

  async startDocumentCheck(userId: string): Promise<{ redirectUrl: string }> {
    return { redirectUrl: `https://example.com/age-check?user=${userId}` };
  }
}

export function createAgeProvider(kind: string): AgeVerificationProvider {
  return new MockAgeVerificationProvider();
  void kind;
}
