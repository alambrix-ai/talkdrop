import { describe, expect, it } from 'vitest';
import { applyTrustDelta, tierFromScore, trustDeltaForOutcome } from './trust.js';

describe('trust', () => {
  it('maps scores to tiers', () => {
    expect(tierFromScore(0)).toBe('new');
    expect(tierFromScore(60)).toBe('bronze');
    expect(tierFromScore(400)).toBe('gold');
    expect(tierFromScore(100, true)).toBe('flagged');
  });

  it('applies deltas', () => {
    const next = applyTrustDelta(40, 20);
    expect(next.score).toBe(60);
    expect(next.tier).toBe('bronze');
  });

  it('penalises reports and cuts', () => {
    expect(
      trustDeltaForOutcome({
        durationSec: 30,
        reported: true,
        cut: false,
        mutualKeep: false,
      }),
    ).toBeLessThan(0);
  });
});
