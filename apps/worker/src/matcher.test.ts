import { describe, expect, it } from 'vitest';
import { pickBestPairs, type MatchTicket } from '@talkdrop/shared';

function ticket(partial: Partial<MatchTicket> & { userId: string }): MatchTicket {
  return {
    interests: ['jazz', 'film'],
    mood: 'chill',
    languages: ['en'],
    region: 'global',
    country: 'IN',
    gender: 'woman',
    trustTier: 'bronze',
    tenantId: null,
    blockedIds: [],
    recentPartners: [],
    joinedAt: Date.now() - 1000,
    ageVerified: true,
    lastHeartbeat: Date.now(),
    ...partial,
  };
}

describe('matcher concurrency invariant', () => {
  it('pairs 1000 tickets without double matching', () => {
    const tickets = Array.from({ length: 1000 }, (_, i) =>
      ticket({
        userId: `u${i}`,
        interests: i % 2 === 0 ? ['jazz', 'film'] : ['jazz', 'travel'],
        joinedAt: Date.now() - i,
      }),
    );
    const pairs = pickBestPairs(tickets);
    const ids = pairs.flatMap((p) => [p.a.userId, p.b.userId]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pairs.length).toBe(500);
  });
});
