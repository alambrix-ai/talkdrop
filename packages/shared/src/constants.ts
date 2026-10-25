export const INTERESTS = [
  { slug: 'jazz', label: 'Jazz', category: 'music' },
  { slug: 'night-walks', label: 'Night walks', category: 'lifestyle' },
  { slug: 'street-food', label: 'Street food', category: 'food' },
  { slug: 'startups', label: 'Startups', category: 'work' },
  { slug: 'football', label: 'Football', category: 'sport' },
  { slug: 'film', label: 'Film', category: 'media' },
  { slug: 'travel', label: 'Travel', category: 'lifestyle' },
  { slug: 'anime', label: 'Anime', category: 'media' },
  { slug: 'cooking', label: 'Cooking', category: 'food' },
  { slug: 'gaming', label: 'Gaming', category: 'media' },
  { slug: 'fitness', label: 'Fitness', category: 'sport' },
  { slug: 'books', label: 'Books', category: 'media' },
  { slug: 'photography', label: 'Photography', category: 'art' },
  { slug: 'stand-up', label: 'Stand-up comedy', category: 'media' },
  { slug: 'language', label: 'Language practice', category: 'learning' },
  { slug: 'design', label: 'Design', category: 'art' },
  { slug: 'hiking', label: 'Hiking', category: 'lifestyle' },
  { slug: 'coffee', label: 'Coffee', category: 'food' },
  { slug: 'podcasts', label: 'Podcasts', category: 'media' },
  { slug: 'yoga', label: 'Yoga', category: 'sport' },
  { slug: 'tech', label: 'Tech', category: 'work' },
  { slug: 'fashion', label: 'Fashion', category: 'lifestyle' },
  { slug: 'pets', label: 'Pets', category: 'lifestyle' },
  { slug: 'science', label: 'Science', category: 'learning' },
  { slug: 'theatre', label: 'Theatre', category: 'art' },
  { slug: 'board-games', label: 'Board games', category: 'media' },
  { slug: 'cycling', label: 'Cycling', category: 'sport' },
  { slug: 'writing', label: 'Writing', category: 'art' },
  { slug: 'gardening', label: 'Gardening', category: 'lifestyle' },
  { slug: 'astronomy', label: 'Astronomy', category: 'learning' },
] as const;

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'ja', label: 'Japanese' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
] as const;

/** ISO-ish country codes used for profile + Plus match filters. */
export const COUNTRIES = [
  { code: 'IN', label: 'India' },
  { code: 'JP', label: 'Japan' },
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'BR', label: 'Brazil' },
  { code: 'KR', label: 'South Korea' },
  { code: 'AU', label: 'Australia' },
  { code: 'CA', label: 'Canada' },
  { code: 'SG', label: 'Singapore' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'MX', label: 'Mexico' },
  { code: 'NG', label: 'Nigeria' },
] as const;

export const GENDERS = [
  { id: 'woman', label: 'Woman' },
  { id: 'man', label: 'Man' },
  { id: 'nonbinary', label: 'Non-binary' },
  { id: 'prefer_not', label: 'Prefer not to say' },
] as const;

export const MOODS = [
  { id: 'chill', label: 'Chill', description: 'Easy conversation, no pressure' },
  { id: 'curious', label: 'Curious', description: 'Ask questions, learn something' },
  { id: 'debate', label: 'Debate', description: 'Friendly sparring on ideas' },
  { id: 'play', label: 'Play a game', description: 'Icebreakers and light activities' },
] as const;

export const COMPLIMENTS = ['Kind', 'Funny', 'Great listener', 'Thoughtful'] as const;

export const REPORT_CATEGORY_LABELS: Record<string, string> = {
  nudity: 'Nudity or sexual content',
  harassment: 'Harassment or hate',
  underage: 'Seems under 18',
  spam: 'Spam or scam',
  other: 'Something else',
};

export const BLUR_FIRST_SECONDS_DEFAULT = 15;
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
export const OTP_TTL_SEC = 10 * 60;
export const MATCH_ACCEPT_TIMEOUT_MS = 5_000;
export const EVIDENCE_TTL_HOURS_DEFAULT = 24;
export const MIN_INTERESTS = 3;
export const MAX_INTERESTS = 12;

export const TRUST_TIER_THRESHOLDS = {
  new: 0,
  bronze: 50,
  silver: 150,
  gold: 350,
  platinum: 700,
} as const;
