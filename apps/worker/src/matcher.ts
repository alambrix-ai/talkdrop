import {
  pickBestPairs,
  widenLevelForWait,
  type MatchTicket,
  type ScoreBreakdown,
} from '@talkdrop/shared';
import { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { SignJWT } from 'jose';

const POOL_KEY = 'pool:global:all';
const TICKET_PREFIX = 'ticket:';
const MATCH_CHANNEL = 'talkdrop:match';

const CLAIM_LUA = `
local a = ARGV[1]
local b = ARGV[2]
local scoreA = redis.call('ZSCORE', KEYS[1], a)
local scoreB = redis.call('ZSCORE', KEYS[1], b)
if not scoreA or not scoreB then return 0 end
redis.call('ZREM', KEYS[1], a)
redis.call('ZREM', KEYS[1], b)
redis.call('DEL', KEYS[2] .. a)
redis.call('DEL', KEYS[2] .. b)
return 1
`;

export interface MatcherDeps {
  redis: Redis;
  prisma: PrismaClient;
  livekitUrl: string;
  livekitMock: boolean;
  widenAfterMs: number;
  blurFirstSeconds: number;
}

async function mockToken(room: string, identity: string, name: string): Promise<string> {
  const secret = new TextEncoder().encode('mock-livekit-secret');
  return new SignJWT({
    video: { roomJoin: true, room, canPublish: true, canSubscribe: true },
    name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
}

export async function runMatchCycle(deps: MatcherDeps): Promise<number> {
  const ids = await deps.redis.zrange(POOL_KEY, 0, 199);
  if (ids.length < 2) return 0;

  const tickets: MatchTicket[] = [];
  for (const id of ids) {
    const raw = await deps.redis.get(`${TICKET_PREFIX}${id}`);
    if (!raw) {
      await deps.redis.zrem(POOL_KEY, id);
      continue;
    }
    tickets.push(JSON.parse(raw) as MatchTicket);
  }

  const now = Date.now();
  const oldestWait = tickets.length
    ? Math.max(...tickets.map((t) => now - t.joinedAt))
    : 0;
  const widen = widenLevelForWait(oldestWait, deps.widenAfterMs);
  const pairs = pickBestPairs(tickets, now, widen);

  let matched = 0;
  for (const pair of pairs) {
    const claimed = await deps.redis.eval(
      CLAIM_LUA,
      2,
      POOL_KEY,
      TICKET_PREFIX,
      pair.a.userId,
      pair.b.userId,
    );
    if (claimed !== 1) continue;

    const iceCount = await deps.prisma.icebreaker.count({ where: { active: true } });
    const ice = await deps.prisma.icebreaker.findFirst({
      where: { active: true },
      skip: iceCount ? Math.floor(Math.random() * iceCount) : 0,
    });

    const session = await deps.prisma.session.create({
      data: {
        status: 'connecting',
        region: pair.a.region,
        icebreaker: ice?.text ?? 'What song have you replayed all week?',
        participants: {
          create: [{ userId: pair.a.userId }, { userId: pair.b.userId }],
        },
      },
    });

    const room = session.id;
    await deps.prisma.session.update({
      where: { id: session.id },
      data: { livekitRoom: room },
    });

    await deps.prisma.matchEvent.create({
      data: {
        sessionId: session.id,
        userA: pair.a.userId,
        userB: pair.b.userId,
        score: pair.score.total,
        scoreBreakdown: pair.score as unknown as object,
        waitMsA: now - pair.a.joinedAt,
        waitMsB: now - pair.b.joinedAt,
        outcome: 'matched',
      },
    });

    const users = await deps.prisma.user.findMany({
      where: { id: { in: [pair.a.userId, pair.b.userId] } },
      include: { profile: true, interests: { include: { interest: true } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    for (const [self, other] of [
      [pair.a, pair.b],
      [pair.b, pair.a],
    ] as const) {
      const selfUser = byId.get(self.userId)!;
      const otherUser = byId.get(other.userId)!;
      const shared = selfUser.interests
        .map((i) => i.interest.label)
        .filter((l) => otherUser.interests.some((oi) => oi.interest.label === l));
      const token = await mockToken(room, self.userId, selfUser.displayName);
      const payload = {
        userId: self.userId,
        sessionId: session.id,
        partner: {
          displayName: otherUser.displayName,
          city: otherUser.profile?.city ?? null,
          trustTier: otherUser.trustTier,
          verified: otherUser.ageVerified,
        },
        sharedInterests: shared,
        icebreaker: session.icebreaker,
        livekit: { url: deps.livekitUrl, token },
      };
      await deps.redis.publish(MATCH_CHANNEL, JSON.stringify(payload));
    }

    matched += 1;
    void (pair.score satisfies ScoreBreakdown);
  }

  return matched;
}
