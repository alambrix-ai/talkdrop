import type { MatchTicket, QueueJoin } from '@talkdrop/shared';
import { prisma } from '../../lib/prisma.js';
import { getRedis } from '../../lib/redis.js';

const TICKET_PREFIX = 'ticket:';
const POOL_KEY = 'pool:global:all';
const HEARTBEAT_PREFIX = 'hb:';

export class MatchingGateway {
  async join(userId: string, prefs: QueueJoin): Promise<{ estimatedWaitMs: number }> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user.ageVerified) {
      throw new Error('age_not_verified');
    }
    if (user.status === 'banned' || user.status === 'suspended') {
      throw new Error('account_blocked');
    }

    const blocks = await prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    });
    const blockedIds = blocks.map((b) =>
      b.blockerId === userId ? b.blockedId : b.blockerId,
    );

    const recent = await prisma.matchEvent.findMany({
      where: { OR: [{ userA: userId }, { userB: userId }] },
      orderBy: { id: 'desc' },
      take: 20,
    });
    const recentPartners = recent
      .map((m) => (m.userA === userId ? m.userB : m.userA))
      .filter((x): x is string => Boolean(x));

    const ticket: MatchTicket = {
      userId,
      interests: prefs.interests,
      mood: prefs.mood,
      languages: prefs.languages,
      region: prefs.region ?? user.region ?? 'global',
      trustTier: user.trustTier,
      tenantId: user.tenantId,
      blockedIds: blockedIds.slice(0, 500),
      recentPartners,
      joinedAt: Date.now(),
      ageVerified: user.ageVerified,
      lastHeartbeat: Date.now(),
      filters: prefs.filters,
    };

    const redis = getRedis();
    await redis.set(`${TICKET_PREFIX}${userId}`, JSON.stringify(ticket), 'EX', 600);
    await redis.zadd(POOL_KEY, ticket.joinedAt, userId);
    await redis.set(`${HEARTBEAT_PREFIX}${userId}`, String(Date.now()), 'EX', 30);

    const waiting = await redis.zcard(POOL_KEY);
    return { estimatedWaitMs: waiting > 10 ? 1500 : 4000 };
  }

  async leave(userId: string): Promise<void> {
    const redis = getRedis();
    await redis.zrem(POOL_KEY, userId);
    await redis.del(`${TICKET_PREFIX}${userId}`);
  }

  async heartbeat(userId: string): Promise<void> {
    const redis = getRedis();
    await redis.set(`${HEARTBEAT_PREFIX}${userId}`, String(Date.now()), 'EX', 30);
    const raw = await redis.get(`${TICKET_PREFIX}${userId}`);
    if (raw) {
      const ticket = JSON.parse(raw) as MatchTicket;
      ticket.lastHeartbeat = Date.now();
      await redis.set(`${TICKET_PREFIX}${userId}`, JSON.stringify(ticket), 'EX', 600);
    }
  }
}

export const matchingKeys = { TICKET_PREFIX, POOL_KEY, HEARTBEAT_PREFIX };
