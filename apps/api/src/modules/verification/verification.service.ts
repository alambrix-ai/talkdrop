import type { AgeVerificationInput } from '@talkdrop/shared';
import type { AppConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { safeEqual, sha256 } from '../../lib/crypto.js';
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
    const pendingRef = sha256(`${userId}:phone:${Date.now()}`);
    await prisma.verification.create({
      data: {
        userId,
        method: 'phone',
        result: 'uncertain',
        estimatedAgeRange: null,
        provider: this.config.AGE_PROVIDER,
        providerRef: pendingRef,
      },
    });
    return {
      redirectUrl: null,
      message: 'Confirm with the pending reference from start',
      pendingRef,
    };
  }

  /**
   * Complete age fallback.
   * - `AGE_PROVIDER=mock` + non-production: allow client mock pass (local/CI).
   * - Production: never mock; phone requires prior `startFallback` pendingRef;
   *   document requires HMAC(providerRef) from signed vendor callback.
   */
  async completeFallback(userId: string, method: 'phone' | 'document', providerRef: string) {
    const isMock = this.config.AGE_PROVIDER === 'mock';
    const isProd = this.config.NODE_ENV === 'production';

    if (isMock && isProd) {
      throw new AppError('misconfigured', 'AGE_PROVIDER=mock is not allowed in production', 503);
    }

    if (isMock) {
      // Local / CI only
      if (!providerRef) {
        throw new AppError('invalid_provider_ref', 'Missing provider reference', 400);
      }
    } else if (method === 'document') {
      const expected = this.signedDocumentRef(userId);
      if (!providerRef || !safeEqual(providerRef, expected)) {
        throw new AppError(
          'invalid_provider_ref',
          'Document verification must complete via signed vendor callback',
          400,
        );
      }
    } else if (method === 'phone') {
      const pending = await prisma.verification.findFirst({
        where: { userId, method: 'phone', result: 'uncertain' },
        orderBy: { createdAt: 'desc' },
      });
      if (!pending?.providerRef || !providerRef || !safeEqual(providerRef, pending.providerRef)) {
        throw new AppError(
          'invalid_provider_ref',
          'Start phone fallback first, then complete with pendingRef',
          400,
        );
      }
    } else {
      throw new AppError('forbidden', 'Age fallback not available', 403);
    }

    await prisma.verification.create({
      data: {
        userId,
        method,
        result: 'passed',
        estimatedAgeRange: '18-24',
        provider: this.config.AGE_PROVIDER,
        providerRef: providerRef || 'mock',
      },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { ageVerified: true, birthYearRange: '18-24', status: 'active' },
    });
    return { result: 'passed' as const };
  }

  /** Vendor webhook should present this HMAC as providerRef (shared secret). */
  signedDocumentRef(userId: string): string {
    const secret = this.config.INTERNAL_WEBHOOK_SECRET ?? this.config.TRUST_TOKEN_SECRET;
    return sha256(`age-document:${userId}:${secret}`);
  }
}
