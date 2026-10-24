import { MIN_INTERESTS, MAX_INTERESTS, type PatchMe, type PutInterests } from '@talkdrop/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { maskPhone } from '../../lib/crypto.js';

export class UsersService {
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        interests: { include: { interest: true } },
        tenantMembers: true,
      },
    });
    if (!user) throw new AppError('not_found', 'User not found', 404);

    const admin = user.tenantMembers[0];
    const interests = user.interests.map((ui) => ({
      slug: ui.interest.slug,
      label: ui.interest.label,
    }));

    return {
      id: user.id,
      displayName: user.displayName,
      phoneE164Masked: user.phoneE164 ? maskPhone(user.phoneE164) : null,
      ageVerified: user.ageVerified,
      trustScore: user.trustScore,
      trustTier: user.trustTier,
      status: user.status,
      streakDays: user.streakDays,
      plan: user.plan,
      region: user.region,
      country: user.country,
      profile: {
        bio: user.profile?.bio ?? null,
        city: user.profile?.city ?? null,
        languages: user.profile?.languages ?? [],
        defaultMood: user.profile?.defaultMood ?? null,
        blurFirst: user.profile?.blurFirst ?? true,
        avatarFirst: user.profile?.avatarFirst ?? false,
        captions: user.profile?.captions ?? true,
        translateTo: user.profile?.translateTo ?? null,
        locale: user.profile?.locale ?? 'en',
      },
      interests,
      onboardingComplete:
        user.ageVerified &&
        interests.length >= MIN_INTERESTS &&
        (user.profile?.languages.length ?? 0) >= 1 &&
        Boolean(user.profile?.defaultMood),
      isAdmin: Boolean(admin),
      adminRole: admin?.role ?? null,
    };
  }

  async patchMe(userId: string, input: PatchMe) {
    const { displayName, region, country, timezone, ...profileFields } = input;
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          ...(displayName ? { displayName } : {}),
          ...(region !== undefined ? { region } : {}),
          ...(country !== undefined ? { country } : {}),
          ...(timezone !== undefined ? { timezone } : {}),
        },
      }),
      prisma.userProfile.upsert({
        where: { userId },
        create: {
          userId,
          bio: profileFields.bio,
          city: profileFields.city,
          languages: profileFields.languages ?? [],
          defaultMood: profileFields.defaultMood,
          blurFirst: profileFields.blurFirst ?? true,
          avatarFirst: profileFields.avatarFirst ?? false,
          captions: profileFields.captions ?? true,
          translateTo: profileFields.translateTo ?? null,
          locale: profileFields.locale ?? 'en',
        },
        update: {
          ...(profileFields.bio !== undefined ? { bio: profileFields.bio } : {}),
          ...(profileFields.city !== undefined ? { city: profileFields.city } : {}),
          ...(profileFields.languages !== undefined
            ? { languages: profileFields.languages }
            : {}),
          ...(profileFields.defaultMood !== undefined
            ? { defaultMood: profileFields.defaultMood }
            : {}),
          ...(profileFields.blurFirst !== undefined
            ? { blurFirst: profileFields.blurFirst }
            : {}),
          ...(profileFields.avatarFirst !== undefined
            ? { avatarFirst: profileFields.avatarFirst }
            : {}),
          ...(profileFields.captions !== undefined ? { captions: profileFields.captions } : {}),
          ...(profileFields.translateTo !== undefined
            ? { translateTo: profileFields.translateTo }
            : {}),
          ...(profileFields.locale !== undefined ? { locale: profileFields.locale } : {}),
        },
      }),
    ]);
    return this.getMe(userId);
  }

  async putInterests(userId: string, input: PutInterests) {
    if (input.interestSlugs.length < MIN_INTERESTS || input.interestSlugs.length > MAX_INTERESTS) {
      throw new AppError(
        'invalid_interests',
        `Select between ${MIN_INTERESTS} and ${MAX_INTERESTS} interests`,
        400,
      );
    }
    const interests = await prisma.interest.findMany({
      where: { slug: { in: input.interestSlugs } },
    });
    if (interests.length !== input.interestSlugs.length) {
      throw new AppError('invalid_interests', 'One or more interests are unknown', 400);
    }
    await prisma.$transaction([
      prisma.userInterest.deleteMany({ where: { userId } }),
      prisma.userInterest.createMany({
        data: interests.map((i) => ({ userId, interestId: i.id })),
      }),
    ]);
    return this.getMe(userId);
  }

  async listInterests() {
    return prisma.interest.findMany({ orderBy: { label: 'asc' } });
  }
}
