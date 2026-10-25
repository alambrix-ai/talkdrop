import { PrismaClient } from '@prisma/client';
import { INTERESTS } from '@talkdrop/shared';
import { createHash } from 'node:crypto';
import { encryptField } from '../src/lib/crypto.js';
import { hashPassword } from '../src/lib/passwords.js';

const prisma = new PrismaClient();

/** Dev seed password for email+password secondary auth (not for production). */
const SEED_PASSWORD = 'TalkdropDev1!';

function phoneHash(phone: string): string {
  return createHash('sha256').update(phone.trim()).digest('hex');
}

function encPhone(phone: string): string {
  const key =
    process.env.FIELD_ENCRYPTION_KEY ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  return encryptField(phone, key);
}

const ICEBREAKERS = [
  'What song have you replayed all week?',
  'What is the first song you ever bought?',
  'Would you rather travel to the past or the future?',
  'What is your comfort food after a long day?',
  'Which city should everyone visit once?',
  'What hobby would you pick up with unlimited free time?',
  'Coffee, tea, or neither?',
  'What is a book or film that changed how you see things?',
  'If you could master one language overnight, which?',
  'What is the kindest thing a stranger has done for you?',
  'Beach sunrise or mountain sunset?',
  'What are you curious about this week?',
  'Best street food you have ever tried?',
  'What would your personal museum exhibit be about?',
  'Early bird or night owl?',
  'What skill are you quietly proud of?',
  'If today had a soundtrack, what genre?',
  'What is a small joy you never skip?',
  'Would you rather explore space or the deep ocean?',
  'What conversation topic never gets old for you?',
];

async function main() {
  for (const i of INTERESTS) {
    await prisma.interest.upsert({
      where: { slug: i.slug },
      create: { slug: i.slug, label: i.label, category: i.category },
      update: { label: i.label, category: i.category },
    });
  }

  const interestRows = await prisma.interest.findMany();
  const bySlug = new Map(interestRows.map((i) => [i.slug, i.id]));

  const existingIce = await prisma.icebreaker.count();
  if (existingIce < 50) {
    const texts: string[] = [];
    for (let n = 0; n < 100; n++) {
      const base = ICEBREAKERS[n % ICEBREAKERS.length]!;
      texts.push(n < ICEBREAKERS.length ? base : `${base} (${n + 1})`);
    }
    await prisma.icebreaker.createMany({
      data: texts.map((text, idx) => ({
        text,
        interestId: interestRows[idx % interestRows.length]?.id,
        mood: ['chill', 'curious', 'debate', 'play'][idx % 4],
        locale: 'en',
        active: true,
      })),
      skipDuplicates: true,
    });
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'northfield' },
    create: {
      name: 'Northfield University · Language Exchange',
      slug: 'northfield',
      policy: {
        ageBandMin: 18,
        ageBandMax: 25,
        regions: ['global'],
        moderation: 'strict',
        blurFirstDefault: true,
        samlEnabled: true,
      },
    },
    update: {},
  });

  async function upsertUser(input: {
    phone: string;
    email: string;
    name: string;
    city: string;
    languages: string[];
    interests: string[];
    trustTier: 'new' | 'bronze' | 'silver' | 'gold' | 'platinum';
    trustScore: number;
    streak: number;
    mood: string;
    adminRole?: 'owner' | 'admin' | 'reviewer' | 'viewer';
  }) {
    const hash = phoneHash(input.phone);
    const encrypted = encPhone(input.phone);
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(SEED_PASSWORD);
    const existing =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.findUnique({ where: { phoneHash: hash } })) ??
      (await prisma.user.findUnique({ where: { phoneE164: input.phone } }));
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            phoneE164: encrypted,
            phoneHash: hash,
            email,
            passwordHash,
            displayName: input.name,
            ageVerified: true,
            ageConsentAt: new Date(),
            trustTier: input.trustTier,
            trustScore: input.trustScore,
            streakDays: input.streak,
            tenantId: tenant.id,
          },
        })
      : await prisma.user.create({
          data: {
            phoneE164: encrypted,
            phoneHash: hash,
            email,
            passwordHash,
            displayName: input.name,
            ageVerified: true,
            ageConsentAt: new Date(),
            birthYearRange: '18-24',
            trustTier: input.trustTier,
            trustScore: input.trustScore,
            streakDays: input.streak,
            region: 'global',
            country: input.city.split(' ').pop() ?? 'World',
            tenantId: tenant.id,
            profile: {
              create: {
                city: input.city,
                languages: input.languages,
                defaultMood: input.mood,
                blurFirst: true,
                captions: true,
              },
            },
          },
        });

    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        city: input.city,
        languages: input.languages,
        defaultMood: input.mood,
      },
      update: {
        city: input.city,
        languages: input.languages,
        defaultMood: input.mood,
      },
    });

    await prisma.userInterest.deleteMany({ where: { userId: user.id } });
    await prisma.userInterest.createMany({
      data: input.interests
        .map((slug) => bySlug.get(slug))
        .filter((id): id is number => Boolean(id))
        .map((interestId) => ({ userId: user.id, interestId })),
    });

    if (input.adminRole) {
      await prisma.tenantMember.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        create: { tenantId: tenant.id, userId: user.id, role: input.adminRole },
        update: { role: input.adminRole },
      });
    }

    return user;
  }

  const arjun = await upsertUser({
    phone: '+919876543210',
    email: 'arjun@gmail.com',
    name: 'Arjun K.',
    city: 'Delhi',
    languages: ['en', 'hi'],
    interests: ['jazz', 'night-walks', 'street-food', 'startups', 'football', 'film'],
    trustTier: 'gold',
    trustScore: 380,
    streak: 12,
    mood: 'curious',
    adminRole: 'owner',
  });

  const mei = await upsertUser({
    phone: '+819012345678',
    email: 'mei@gmail.com',
    name: 'Mei',
    city: 'Tokyo',
    languages: ['ja', 'en'],
    interests: ['jazz', 'night-walks', 'street-food', 'anime', 'film'],
    trustTier: 'gold',
    trustScore: 360,
    streak: 8,
    mood: 'chill',
  });

  const lucia = await upsertUser({
    phone: '+34600111222',
    email: 'lucia@gmail.com',
    name: 'Lucia',
    city: 'Madrid',
    languages: ['es', 'en'],
    interests: ['language', 'travel', 'film', 'cooking'],
    trustTier: 'silver',
    trustScore: 200,
    streak: 4,
    mood: 'curious',
  });

  const kofi = await upsertUser({
    phone: '+233201112233',
    email: 'kofi@gmail.com',
    name: 'Kofi',
    city: 'Accra',
    languages: ['en'],
    interests: ['football', 'gaming', 'startups', 'tech'],
    trustTier: 'bronze',
    trustScore: 80,
    streak: 2,
    mood: 'play',
  });

  const priya = await upsertUser({
    phone: '+919811122233',
    email: 'priya@gmail.com',
    name: 'Priya S.',
    city: 'Bengaluru',
    languages: ['en', 'hi'],
    interests: ['film', 'books', 'design', 'startups'],
    trustTier: 'gold',
    trustScore: 400,
    streak: 15,
    mood: 'debate',
    adminRole: 'admin',
  });

  const tomas = await upsertUser({
    phone: '+351910000001',
    email: 'tomas@gmail.com',
    name: 'Tomás',
    city: 'Lisbon',
    languages: ['pt', 'en', 'es'],
    interests: ['travel', 'street-food', 'jazz', 'photography'],
    trustTier: 'silver',
    trustScore: 220,
    streak: 5,
    mood: 'chill',
  });

  // Connections + chat with Mei
  const [a, b] = arjun.id < mei.id ? [arjun.id, mei.id] : [mei.id, arjun.id];
  const conn = await prisma.connection.upsert({
    where: { userA_userB: { userA: a, userB: b } },
    create: { userA: a, userB: b, status: 'active' },
    update: {},
  });

  const existingMsgs = await prisma.message.count({ where: { connectionId: conn.id } });
  if (existingMsgs === 0) {
    const chat = [
      { senderId: mei.id, body: 'Great talking to you earlier! Still thinking about that jazz bar.' },
      { senderId: arjun.id, body: 'Same here. Which album should I start with?' },
      {
        senderId: mei.id,
        body: 'Kind of Blue is the classic. For something newer, try Kamasi Washington.',
      },
      { senderId: arjun.id, body: 'Perfect, adding both to my night walk playlist.' },
      { senderId: mei.id, body: 'I will share my favourite spots in Tokyo too.' },
    ];
    for (const m of chat) {
      await prisma.message.create({ data: { connectionId: conn.id, ...m } });
    }
  }

  // More connections
  for (const peer of [lucia, kofi, priya, tomas]) {
    const [x, y] = arjun.id < peer.id ? [arjun.id, peer.id] : [peer.id, arjun.id];
    const c = await prisma.connection.upsert({
      where: { userA_userB: { userA: x, userB: y } },
      create: { userA: x, userB: y },
      update: {},
    });
    const count = await prisma.message.count({ where: { connectionId: c.id } });
    if (count === 0) {
      const previews: Record<string, string> = {
        [lucia.id]: 'See you at Spanish night!',
        [kofi.id]: 'That match was wild',
        [priya.id]: 'Send me the film list',
        [tomas.id]: 'Lisbon in March?',
      };
      await prisma.message.create({
        data: {
          connectionId: c.id,
          senderId: peer.id,
          body: previews[peer.id] ?? 'Hey!',
          readAt: peer.id === lucia.id ? null : new Date(),
        },
      });
      if (peer.id === lucia.id) {
        await prisma.message.create({
          data: {
            connectionId: c.id,
            senderId: peer.id,
            body: 'Are you joining the language room?',
          },
        });
      }
    }
  }

  // Rooms
  const roomCount = await prisma.room.count();
  if (roomCount === 0) {
    const tonight = new Date();
    tonight.setHours(20, 30, 0, 0);
    await prisma.room.createMany({
      data: [
        {
          title: 'Speak Spanish night',
          startsAt: tonight,
          language: 'es',
          joinedCount: 126,
          tenantId: tenant.id,
        },
        {
          title: 'Startup pitch roulette',
          startsAt: new Date(tonight.getTime() + 30 * 60000),
          language: 'en',
          joinedCount: 84,
          tenantId: tenant.id,
        },
        {
          title: 'Lo-fi listening room',
          startsAt: null,
          language: 'en',
          joinedCount: 312,
          tenantId: tenant.id,
        },
      ],
    });
  }

  // Sample moderation queue + audit
  const reportCount = await prisma.report.count();
  if (reportCount === 0) {
    const session = await prisma.session.create({
      data: {
        status: 'ended',
        endReason: 'report',
        startedAt: new Date(Date.now() - 600000),
        endedAt: new Date(Date.now() - 500000),
        durationSec: 100,
        icebreaker: 'What song have you replayed all week?',
        participants: {
          create: [{ userId: arjun.id }, { userId: kofi.id }],
        },
      },
    });
    await prisma.report.createMany({
      data: [
        {
          sessionId: session.id,
          reporterId: arjun.id,
          reportedId: kofi.id,
          category: 'harassment',
          status: 'in_review',
          severity: 'high',
          details: 'Seed case #48213',
        },
        {
          sessionId: session.id,
          reporterId: mei.id,
          reportedId: kofi.id,
          category: 'nudity',
          status: 'open',
          severity: 'high',
          details: 'Seed auto-cut case',
        },
        {
          sessionId: session.id,
          reporterId: lucia.id,
          reportedId: tomas.id,
          category: 'spam',
          status: 'open',
          severity: 'low',
        },
        {
          sessionId: session.id,
          reporterId: priya.id,
          reportedId: kofi.id,
          category: 'underage',
          status: 'escalated',
          severity: 'high',
        },
      ],
    });
  }

  const auditCount = await prisma.auditLog.count();
  if (auditCount === 0) {
    await prisma.auditLog.createMany({
      data: [
        {
          tenantId: tenant.id,
          actorId: priya.id,
          action: 'Policy updated: moderation set to Strict',
          targetType: 'policy',
          targetId: tenant.id,
        },
        {
          tenantId: tenant.id,
          actorId: arjun.id,
          action: 'User banned: case #48170',
          targetType: 'user',
          targetId: kofi.id,
        },
        {
          tenantId: tenant.id,
          actorId: arjun.id,
          action: 'SSO certificate rotated',
          targetType: 'tenant',
          targetId: tenant.id,
        },
      ],
    });
  }

  console.log('Seeded Talkdrop demo data.');
  console.log(
    'Demo auth: Sign in with Google (mock) or email+password — arjun@gmail.com / TalkdropDev1!',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
