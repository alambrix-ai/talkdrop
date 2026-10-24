import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';

/** GDPR/DPDP data export and deletion (SPEC §14). */
export class PrivacyService {
  async exportData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        interests: { include: { interest: true } },
        verifications: true,
        vibeChecksFrom: true,
        messages: { take: 500, orderBy: { id: 'desc' } },
        reportsMade: true,
        enforcements: true,
      },
    });
    if (!user) throw new AppError('not_found', 'User not found', 404);

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        displayName: user.displayName,
        ageVerified: user.ageVerified,
        trustTier: user.trustTier,
        plan: user.plan,
        createdAt: user.createdAt.toISOString(),
      },
      profile: user.profile,
      interests: user.interests.map((i) => i.interest.slug),
      verifications: user.verifications.map((v) => ({
        method: v.method,
        result: v.result,
        estimatedAgeRange: v.estimatedAgeRange,
        createdAt: v.createdAt.toISOString(),
      })),
      messages: user.messages.map((m) => ({
        id: Number(m.id),
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
      note: 'Phone numbers are not exported in cleartext. Face/media are never stored.',
    };
  }

  async deleteData(userId: string) {
    // Soft-delete style: anonymise PII, revoke tokens, keep enforcement audit integrity
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.userInterest.deleteMany({ where: { userId } });
    await prisma.userProfile.deleteMany({ where: { userId } });
    await prisma.message.deleteMany({ where: { senderId: userId } });
    await prisma.user.update({
      where: { id: userId },
      data: {
        displayName: 'Deleted user',
        phoneE164: null,
        email: null,
        avatarUrl: null,
        status: 'banned',
        ageVerified: false,
      },
    });
    return { deleted: true };
  }
}
