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
      note: 'Phone numbers are not exported in cleartext. Face/media are never stored. Enforcement/report rows may be retained under legal hold.',
    };
  }

  async deleteData(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('not_found', 'User not found', 404);

    const otpOr = [
      ...(user.phoneHash ? [{ phoneHash: user.phoneHash }] : []),
      ...(user.phoneE164 ? [{ phoneE164: user.phoneE164 }] : []),
    ];

    await prisma.$transaction([
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.device.deleteMany({ where: { userId } }),
      ...(otpOr.length ? [prisma.authOtp.deleteMany({ where: { OR: otpOr } })] : []),
      prisma.verification.deleteMany({ where: { userId } }),
      prisma.vibeCheck.deleteMany({ where: { OR: [{ fromUser: userId }, { aboutUser: userId }] } }),
      prisma.subscription.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'cancelled' },
      }),
      prisma.userInterest.deleteMany({ where: { userId } }),
      prisma.userProfile.deleteMany({ where: { userId } }),
      prisma.message.deleteMany({ where: { senderId: userId } }),
      prisma.user.update({
        where: { id: userId },
        data: {
          displayName: 'Deleted user',
          phoneE164: null,
          phoneHash: null,
          email: null,
          avatarUrl: null,
          birthYearRange: null,
          region: null,
          country: null,
          timezone: null,
          plan: 'free',
          status: 'banned',
          ageVerified: false,
        },
      }),
    ]);
    // Reports/enforcements/appeals retained for safety/legal hold (anonymized actor already)
    return { deleted: true, retained: ['reports', 'enforcements', 'appeals', 'session_participations'] };
  }
}
