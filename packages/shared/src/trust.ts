import type { TrustTier } from './enums.js';
import { TRUST_TIER_THRESHOLDS } from './constants.js';

export function tierFromScore(score: number, flagged = false): TrustTier {
  if (flagged) return 'flagged';
  if (score >= TRUST_TIER_THRESHOLDS.platinum) return 'platinum';
  if (score >= TRUST_TIER_THRESHOLDS.gold) return 'gold';
  if (score >= TRUST_TIER_THRESHOLDS.silver) return 'silver';
  if (score >= TRUST_TIER_THRESHOLDS.bronze) return 'bronze';
  return 'new';
}

export function applyTrustDelta(
  current: number,
  delta: number,
  flagged = false,
): { score: number; tier: TrustTier } {
  const score = Math.max(0, Math.min(2000, current + delta));
  return { score, tier: tierFromScore(score, flagged) };
}

/** Positive outcomes raise trust; reports and cuts lower it. */
export function trustDeltaForOutcome(input: {
  vibe?: 'great' | 'okay' | 'not_for_me';
  durationSec: number;
  reported: boolean;
  cut: boolean;
  mutualKeep: boolean;
}): number {
  let delta = 0;
  if (input.reported) delta -= 80;
  if (input.cut) delta -= 120;
  if (input.mutualKeep) delta += 25;
  if (input.durationSec >= 180) delta += 15;
  else if (input.durationSec >= 60) delta += 8;
  if (input.vibe === 'great') delta += 12;
  if (input.vibe === 'okay') delta += 4;
  if (input.vibe === 'not_for_me') delta -= 2;
  return delta;
}

export function pointsToNextTier(score: number): { next: TrustTier | null; points: number } {
  const order: Array<[TrustTier, number]> = [
    ['bronze', TRUST_TIER_THRESHOLDS.bronze],
    ['silver', TRUST_TIER_THRESHOLDS.silver],
    ['gold', TRUST_TIER_THRESHOLDS.gold],
    ['platinum', TRUST_TIER_THRESHOLDS.platinum],
  ];
  for (const [tier, threshold] of order) {
    if (score < threshold) return { next: tier, points: threshold - score };
  }
  return { next: null, points: 0 };
}
