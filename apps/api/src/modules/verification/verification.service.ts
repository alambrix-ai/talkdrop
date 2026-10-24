import type { AgeVerificationInput } from '@talkdrop/shared';
import type { AppConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { Providers } from '../../providers/index.js';

export class VerificationService {
  constructor(
    private config: AppConfig,
    private providers: Providers,
  ) {}

  async submitAge(userId: string, input: AgeVerificationInput) {
    const result = await this.providers.age.verifyFromEstimate(input);
    const range =
      input.estimatedAge >= 18
        ? input.estimatedAge >= 25
          ? '25-34'
          : '18-24'
        : 'under-18';

    await prisma.verification.create({
      data: {
        userId,
        method: 'face_estimate',
        result,
        estimatedAgeRange: range,
        provider: this.config.AGE_PROVIDER,
      },
    });

    if (result === 'passed') {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ageVerified: true,
          birthYearRange: range,
        },
      });
    } else if (result === 'failed') {
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'restricted' },
      });
    }

    return { result, estimatedAgeRange: range };
  }

  async startFallback(userId: string, method: 'phone' | 'document') {
    if (method === 'document') {
      return this.providers.age.startDocumentCheck(userId);
    }
    return { redirectUrl: null, message: 'Use phone OTP on the verify screen' };
  }

  async completeFallback(userId: string, method: 'phone' | 'document', providerRef: string) {
    // Mock always passes in development
    if (this.config.AGE_PROVIDER !== 'mock' && !providerRef) {
      throw new AppError('invalid_provider_ref', 'Missing provider reference', 400);
    }
    await prisma.verification.create({
      data: {
        userId,
        method,
        result: 'passed',
        estimatedAgeRange: '18-24',
        provider: this.config.AGE_PROVIDER,
        providerRef,
      },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { ageVerified: true, birthYearRange: '18-24', status: 'active' },
    });
    return { result: 'passed' as const };
  }
}
