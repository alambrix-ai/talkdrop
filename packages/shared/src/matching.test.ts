import { describe, expect, it } from 'vitest';
import {
  hardConstraintsOk,
  jaccard,
  pickBestPairs,
  scorePair,
  type MatchTicket,
  widenLevelForWait,
} from './matching.js';

function ticket(partial: Partial<MatchTicket> & { userId: string }): MatchTicket {
  return {
    interests: ['jazz', 'film'],
    mood: 'chill',
    languages: ['en'],
    region: 'global',
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

describe('jaccard', () => {
  it('scores shared interests', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
  });
});

describe('hardConstraintsOk', () => {
  it('rejects blocked users', () => {
    const a = ticket({ userId: '1', blockedIds: ['2'] });
    const b = ticket({ userId: '2' });
    expect(hardConstraintsOk(a, b)).toBe(false);
  });

  it('requires language overlap', () => {
    const a = ticket({ userId: '1', languages: ['en'] });
    const b = ticket({ userId: '2', languages: ['ja'] });
    expect(hardConstraintsOk(a, b)).toBe(false);
  });

  it('allows compatible tickets', () => {
    const a = ticket({ userId: '1' });
    const b = ticket({ userId: '2', interests: ['jazz', 'travel'] });
    expect(hardConstraintsOk(a, b)).toBe(true);
  });
});

describe('scorePair / pickBestPairs', () => {
  it('prefers shared interests and mood', () => {
    const a = ticket({ userId: '1', interests: ['jazz', 'film', 'travel'] });
    const b = ticket({ userId: '2', interests: ['jazz', 'film', 'cooking'] });
    const c = ticket({
      userId: '3',
      interests: ['gaming'],
      mood: 'debate',
    });
    const scoreAb = scorePair(a, b);
    const scoreAc = scorePair(a, c);
    expect(scoreAb).not.toBeNull();
    expect(scoreAc).toBeNull(); // mood mismatch at widen 0
    const pairs = pickBestPairs([a, b, c]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.a.userId).toBe('1');
    expect(pairs[0]?.b.userId).toBe('2');
  });

  it('never double-matches a user', () => {
    const tickets = [
      ticket({ userId: '1' }),
      ticket({ userId: '2' }),
      ticket({ userId: '3' }),
      ticket({ userId: '4' }),
    ];
    const pairs = pickBestPairs(tickets);
    const ids = pairs.flatMap((p) => [p.a.userId, p.b.userId]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('widenLevelForWait', () => {
  it('widens over time', () => {
    expect(widenLevelForWait(0, 8000)).toBe(0);
    expect(widenLevelForWait(9000, 8000)).toBe(1);
    expect(widenLevelForWait(13000, 8000)).toBe(2);
    expect(widenLevelForWait(20000, 8000)).toBe(3);
  });
});
