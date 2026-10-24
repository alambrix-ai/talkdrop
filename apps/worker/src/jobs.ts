import { PrismaClient } from '@prisma/client';
import { applyTrustDelta, tierFromScore } from '@talkdrop/shared';
import type { StorageLike } from './types.js';

export async function expireEvidence(prisma: PrismaClient, storage: StorageLike): Promise<number> {
  const due = await prisma.evidence.findMany({
    where: { deletedAt: null, expiresAt: { lt: new Date() } },
    take: 100,
  });
  for (const row of due) {
    await storage.deleteObject(row.storageKey);
    await prisma.evidence.update({
      where: { id: row.id },
      data: { deletedAt: new Date() },
    });
  }
  return due.length;
}

export async function recomputeTrust(prisma: PrismaClient): Promise<number> {
  const users = await prisma.user.findMany({
    where: { status: { not: 'banned' } },
    take: 500,
    orderBy: { lastSeenAt: 'desc' },
  });
  let updated = 0;
  for (const u of users) {
    const tier = tierFromScore(u.trustScore, u.trustTier === 'flagged');
    if (tier !== u.trustTier) {
      await prisma.user.update({ where: { id: u.id }, data: { trustTier: tier } });
      updated += 1;
    }
  }
  return updated;
}

export async function updateStreaks(prisma: PrismaClient): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const active = await prisma.user.findMany({
    where: { lastSeenAt: { gte: new Date(Date.now() - 36 * 3600 * 1000) } },
    take: 500,
  });
  let n = 0;
  for (const u of active) {
    const last = u.lastActiveDate;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    let streak = u.streakDays;
    if (!last) streak = 1;
    else if (last.getTime() === today.getTime()) continue;
    else if (last.getTime() === yesterday.getTime()) streak += 1;
    else streak = 1;
    await prisma.user.update({
      where: { id: u.id },
      data: { streakDays: streak, lastActiveDate: today },
    });
    // small trust bump for streaks
    if (streak > 0 && streak % 7 === 0) {
      const next = applyTrustDelta(u.trustScore, 10, u.trustTier === 'flagged');
      await prisma.user.update({
        where: { id: u.id },
        data: { trustScore: next.score, trustTier: next.tier },
      });
    }
    n += 1;
  }
  return n;
}
