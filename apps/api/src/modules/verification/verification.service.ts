import type { AgeVerificationInput } from '@talkdrop/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

/**
 * 18+ gate is a single Yes/No self-attestation.
 * No camera age estimate, document check, or phone OTP fallback.
 */
export class VerificationService {
  async submitConsent(userId: string, input: AgeVerificationInput) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('not_found', 'User not found', 404);
    if (user.status === 'banned' || user.status === 'suspended') {
      throw new AppError('forbidden', `Account is ${user.status}`, 403);
    }

    const now = new Date();
    const accepted = input.confirmed18Plus === true;

    await prisma.verification.create({
      data: {
        userId,
        method: 'self_attestation',
        result: accepted ? 'passed' : 'failed',
        estimatedAgeRange: accepted ? '18+' : 'declined',
        provider: 'self_attestation',
      },
    });

    if (accepted) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ageVerified: true,
          ageConsentAt: now,
          birthYearRange: user.birthYearRange ?? '18+',
          status: user.status === 'restricted' ? 'active' : user.status,
        },
      });
      return {
        result: 'passed' as const,
        ageVerified: true,
        ageConsent: 'accepted' as const,
      };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        ageVerified: false,
        ageConsentAt: now,
      },
    });

    return {
      result: 'failed' as const,
      ageVerified: false,
      ageConsent: 'declined' as const,
      message:
        'Talkdrop is only for people 18 or older. Matching and hangouts stay locked until you confirm you are 18+.',
    };
  }
}
