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

  it('enforces country filters when set (empty = any)', () => {
    const a = ticket({
      userId: '1',
      country: 'IN',
      filters: { countries: ['JP'] },
    });
    const b = ticket({ userId: '2', country: 'IN', gender: 'man' });
    expect(hardConstraintsOk(a, b)).toBe(false);
    expect(
      hardConstraintsOk(a, ticket({ userId: '3', country: 'JP', gender: 'man', languages: ['en'] })),
    ).toBe(true);
    expect(
      hardConstraintsOk(
        ticket({ userId: '4', filters: { countries: [] } }),
        ticket({ userId: '5', country: 'US' }),
      ),
    ).toBe(true);
  });

  it('enforces gender filters both ways', () => {
    const a = ticket({
      userId: '1',
      gender: 'woman',
      filters: { genders: ['man'] },
    });
    const b = ticket({
      userId: '2',
      gender: 'woman',
      filters: { genders: ['woman'] },
    });
    expect(hardConstraintsOk(a, b)).toBe(false);
    const c = ticket({
      userId: '3',
      gender: 'man',
      filters: { genders: ['woman'] },
      languages: ['en'],
    });
    expect(hardConstraintsOk(a, c)).toBe(true);
  });

  it('enforces language preference filters', () => {
    const a = ticket({
      userId: '1',
      languages: ['en', 'hi'],
      filters: { languages: ['ja'] },
    });
    const b = ticket({ userId: '2', languages: ['en', 'hi'] });
    expect(hardConstraintsOk(a, b)).toBe(false);
    expect(
      hardConstraintsOk(a, ticket({ userId: '3', languages: ['en', 'ja'], gender: 'man' })),
    ).toBe(true);
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
