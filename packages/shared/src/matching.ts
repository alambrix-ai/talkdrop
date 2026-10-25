import type { Gender, Mood, TrustTier } from './enums.js';

/** Plus match preference filters. Empty arrays / undefined = no constraint ("any"). */
export interface MatchFilters {
  /** Preferred partner countries (ISO codes). */
  countries?: string[];
  /** Preferred partner genders. */
  genders?: Gender[];
  /** Preferred languages the partner must speak (at least one). */
  languages?: string[];
  /** Legacy region pool filter (kept for older clients). */
  regions?: string[];
}

export interface MatchTicket {
  userId: string;
  interests: string[];
  mood: Mood;
  languages: string[];
  region: string;
  /** ISO country code for this user (may be empty). */
  country: string;
  /** Self gender for this user (may be empty / prefer_not). */
  gender: Gender | '';
  trustTier: TrustTier;
  tenantId: string | null;
  blockedIds: string[];
  recentPartners: string[];
  joinedAt: number;
  ageVerified: boolean;
  lastHeartbeat: number;
  /** Plus preference filters — empty means any. */
  filters?: MatchFilters;
}

export interface ScoreBreakdown {
  interests: number;
  mood: number;
  language: number;
  wait: number;
  vibe: number;
  diversity: number;
  total: number;
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const x of setA) {
    if (setB.has(x)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeList(values?: string[]): string[] {
  return (values ?? []).map((v) => v.trim()).filter(Boolean);
}

/** True when `candidate` satisfies `filters` (empty filter = any). */
export function satisfiesMatchFilters(
  filters: MatchFilters | undefined,
  candidate: { country: string; gender: string; languages: string[]; region: string },
): boolean {
  if (!filters) return true;

  const countries = normalizeList(filters.countries);
  if (countries.length) {
    const code = (candidate.country || '').toUpperCase();
    if (!code || !countries.map((c) => c.toUpperCase()).includes(code)) return false;
  }

  const genders = normalizeList(filters.genders as string[] | undefined);
  if (genders.length) {
    const g = candidate.gender || '';
    if (!g || !genders.includes(g)) return false;
  }

  const langs = normalizeList(filters.languages);
  if (langs.length && !langs.some((l) => candidate.languages.includes(l))) return false;

  const regions = normalizeList(filters.regions);
  if (regions.length && !regions.includes(candidate.region)) return false;

  return true;
}

export function hardConstraintsOk(
  a: MatchTicket,
  b: MatchTicket,
  now = Date.now(),
  widenLevel = 0,
): boolean {
  if (a.userId === b.userId) return false;
  if (!a.ageVerified || !b.ageVerified) return false;
  if (now - a.lastHeartbeat > 10_000 || now - b.lastHeartbeat > 10_000) return false;
  if (a.blockedIds.includes(b.userId) || b.blockedIds.includes(a.userId)) return false;
  if (a.recentPartners.includes(b.userId) || b.recentPartners.includes(a.userId)) return false;
  if ((a.trustTier === 'flagged') !== (b.trustTier === 'flagged')) return false;
  if ((a.tenantId ?? null) !== (b.tenantId ?? null)) return false;

  if (widenLevel < 3) {
    if (a.region && b.region && a.region !== b.region && widenLevel < 2) {
      // region soft until widen level 2+
    }
  }

  const langOverlap = a.languages.some((l) => b.languages.includes(l));
  if (!langOverlap) return false;

  // Plus filters: both sides must satisfy the other's preferences when set.
  if (
    !satisfiesMatchFilters(a.filters, {
      country: b.country,
      gender: b.gender,
      languages: b.languages,
      region: b.region,
    })
  ) {
    return false;
  }
  if (
    !satisfiesMatchFilters(b.filters, {
      country: a.country,
      gender: a.gender,
      languages: a.languages,
      region: a.region,
    })
  ) {
    return false;
  }

  return true;
}

export function scorePair(
  a: MatchTicket,
  b: MatchTicket,
  now = Date.now(),
  widenLevel = 0,
): ScoreBreakdown | null {
  if (!hardConstraintsOk(a, b, now, widenLevel)) return null;

  const shared = jaccard(a.interests, b.interests);
  const interestScore = shared * 40;

  if (widenLevel === 0 && a.mood !== b.mood) return null;
  if (widenLevel >= 1 && a.mood !== b.mood) {
    // mood relaxed
  }
  if (widenLevel < 2 && shared < 1 / Math.max(a.interests.length, b.interests.length, 1)) {
    const overlapCount = a.interests.filter((i) => b.interests.includes(i)).length;
    if (overlapCount < 1 && widenLevel < 2) return null;
  }

  const moodScore = a.mood === b.mood ? 15 : widenLevel >= 1 ? 5 : 0;
  const langOverlap = a.languages.filter((l) => b.languages.includes(l)).length;
  const languageScore = Math.min(15, langOverlap * 7.5);
  const waitMs = Math.min(now - a.joinedAt, now - b.joinedAt);
  const waitScore = Math.min(15, (waitMs / 20_000) * 15);
  const vibeScore = 5;
  const diversity = a.recentPartners.length > 10 || b.recentPartners.length > 10 ? -5 : 0;

  const total = interestScore + moodScore + languageScore + waitScore + vibeScore + diversity;
  return {
    interests: interestScore,
    mood: moodScore,
    language: languageScore,
    wait: waitScore,
    vibe: vibeScore,
    diversity,
    total: Math.max(0, Math.min(100, total)),
  };
}

export function pickBestPairs(
  tickets: MatchTicket[],
  now = Date.now(),
  widenLevel = 0,
): Array<{ a: MatchTicket; b: MatchTicket; score: ScoreBreakdown }> {
  const pairs: Array<{ a: MatchTicket; b: MatchTicket; score: ScoreBreakdown }> = [];
  for (let i = 0; i < tickets.length; i++) {
    for (let j = i + 1; j < tickets.length; j++) {
      const a = tickets[i]!;
      const b = tickets[j]!;
      const score = scorePair(a, b, now, widenLevel);
      if (score) pairs.push({ a, b, score });
    }
  }
  pairs.sort((x, y) => y.score.total - x.score.total);

  const used = new Set<string>();
  const chosen: typeof pairs = [];
  for (const p of pairs) {
    if (used.has(p.a.userId) || used.has(p.b.userId)) continue;
    used.add(p.a.userId);
    used.add(p.b.userId);
    chosen.push(p);
  }
  return chosen;
}

export function widenLevelForWait(waitMs: number, widenAfterMs: number): number {
  if (waitMs < widenAfterMs) return 0;
  if (waitMs < widenAfterMs * 1.5) return 1;
  if (waitMs < widenAfterMs * 2) return 2;
  return 3;
}
