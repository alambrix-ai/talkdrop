import { z } from 'zod';
import {
  EndReason,
  EnforcementAction,
  Gender,
  Mood,
  ReportCategory,
  ReportStatus,
  TrustTier,
  Vibe,
  VerificationResult,
} from './enums.js';
import { MAX_INTERESTS, MIN_INTERESTS } from './constants.js';

export const matchFiltersSchema = z.object({
  countries: z.array(z.string().min(2).max(8)).max(20).optional(),
  genders: z.array(Gender).max(4).optional(),
  languages: z.array(z.string().min(2).max(8)).max(10).optional(),
  /** Legacy region filter (Plus). */
  regions: z.array(z.string().min(1).max(40)).max(20).optional(),
});
export type MatchFiltersInput = z.infer<typeof matchFiltersSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

/** @deprecated Phone OTP sign-in removed — use Google OAuth or email+password. */
export const otpRequestSchema = z.object({
  phoneE164: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be E.164 format'),
});

/** @deprecated Phone OTP sign-in removed — use Google OAuth or email+password. */
export const otpVerifySchema = z.object({
  phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/),
  code: z.string().min(4).max(8),
  displayName: z.string().min(1).max(80).optional(),
  deviceFingerprint: z.string().min(8).max(128).optional(),
});

const emailField = z
  .string()
  .trim()
  .email('Valid email required')
  .max(254)
  .transform((v) => v.toLowerCase());

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long');

/** Secondary path: create account with email + password. */
export const emailSignupSchema = z.object({
  email: emailField,
  password: passwordField,
  displayName: z.string().min(1).max(80).optional(),
  deviceFingerprint: z.string().min(8).max(128).optional(),
});

/** Secondary path: sign in with email + password. */
export const emailLoginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(128),
  deviceFingerprint: z.string().min(8).max(128).optional(),
});

/** Google Identity Services / One Tap: verify ID token server-side. */
export const googleIdTokenSchema = z.object({
  idToken: z.string().min(20).max(8192),
  displayName: z.string().min(1).max(80).optional(),
  deviceFingerprint: z.string().min(8).max(128).optional(),
});

/**
 * Dev/test only: mock Google login when GOOGLE_OAUTH_MOCK is enabled.
 * Never available in production.
 */
export const googleMockLoginSchema = z.object({
  email: emailField,
  googleSub: z.string().min(3).max(128).optional(),
  displayName: z.string().min(1).max(80).optional(),
  deviceFingerprint: z.string().min(8).max(128).optional(),
});

/** Yes/No 18+ self-attestation — the only age gate. */
export const ageVerificationSchema = z.object({
  confirmed18Plus: z.boolean(),
});

export const patchMeSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  city: z.string().max(80).optional(),
  languages: z.array(z.string().min(2).max(8)).min(1).max(10).optional(),
  gender: Gender.optional(),
  defaultMood: Mood.optional(),
  blurFirst: z.boolean().optional(),
  avatarFirst: z.boolean().optional(),
  captions: z.boolean().optional(),
  translateTo: z.string().max(8).nullable().optional(),
  locale: z.string().max(8).optional(),
  region: z.string().max(40).optional(),
  country: z.string().max(40).optional(),
  timezone: z.string().max(64).optional(),
});

export const putInterestsSchema = z.object({
  interestSlugs: z.array(z.string()).min(MIN_INTERESTS).max(MAX_INTERESTS),
});

export const endSessionSchema = z.object({
  reason: z.enum(['hangup', 'next']),
});

export const vibeCheckSchema = z.object({
  vibe: Vibe,
  compliments: z.array(z.string()).max(4).default([]),
});

export const createReportSchema = z.object({
  sessionId: z.string().uuid(),
  category: ReportCategory,
  details: z.string().max(2000).optional(),
  alsoBlock: z.boolean().default(true),
});

export const createBlockSchema = z.object({
  userId: z.string().uuid(),
});

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const createAppealSchema = z.object({
  enforcementId: z.coerce.number().int().positive(),
  message: z.string().min(1).max(2000),
});

export const adminDecisionSchema = z.object({
  decision: z.enum(['dismiss', 'warn', 'suspend', 'ban', 'escalate']),
  reason: z.string().max(500).optional(),
  suspendDays: z.number().int().min(1).max(365).optional(),
});

export const adminPolicySchema = z.object({
  ageBandMin: z.number().int().min(18).max(100).optional(),
  ageBandMax: z.number().int().min(18).max(100).optional(),
  regions: z.array(z.string()).optional(),
  moderation: z.enum(['lenient', 'standard', 'strict']).optional(),
  blurFirstDefault: z.boolean().optional(),
  samlEnabled: z.boolean().optional(),
});

export const publicPartnerSchema = z.object({
  displayName: z.string(),
  age: z.number().optional(),
  city: z.string().nullable().optional(),
  trustTier: TrustTier,
  verified: z.boolean(),
  languages: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
});

export const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  durationSec: z.number().nullable(),
  endReason: EndReason.nullable().optional(),
  blurUntilMs: z.number(),
  icebreaker: z.string(),
  sharedInterests: z.array(z.string()),
  partner: publicPartnerSchema,
  partnerKept: z.boolean().optional(),
  kept: z.boolean().optional(),
  livekit: z
    .object({
      url: z.string(),
      token: z.string(),
    })
    .optional(),
});

export const meSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email().nullable().optional(),
  phoneE164Masked: z.string().nullable(),
  ageVerified: z.boolean(),
  /** pending | accepted | declined — declined means they answered No (do not re-prompt as primary). */
  ageConsent: z.enum(['pending', 'accepted', 'declined']),
  trustScore: z.number(),
  trustTier: TrustTier,
  status: z.string(),
  streakDays: z.number(),
  plan: z.string(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  profile: z.object({
    bio: z.string().nullable(),
    city: z.string().nullable(),
    languages: z.array(z.string()),
    gender: Gender.nullable(),
    defaultMood: z.string().nullable(),
    blurFirst: z.boolean(),
    avatarFirst: z.boolean(),
    captions: z.boolean(),
    translateTo: z.string().nullable(),
    locale: z.string().nullable(),
  }),
  /** Plus match preference filters (empty = any). */
  matchFilters: matchFiltersSchema.optional(),
  interests: z.array(z.object({ slug: z.string(), label: z.string() })),
  onboardingComplete: z.boolean(),
  isAdmin: z.boolean().optional(),
  adminRole: z.string().nullable().optional(),
});

export type OtpRequest = z.infer<typeof otpRequestSchema>;
export type OtpVerify = z.infer<typeof otpVerifySchema>;
export type EmailSignup = z.infer<typeof emailSignupSchema>;
export type EmailLogin = z.infer<typeof emailLoginSchema>;
export type GoogleIdTokenLogin = z.infer<typeof googleIdTokenSchema>;
export type GoogleMockLogin = z.infer<typeof googleMockLoginSchema>;
export type AgeVerificationInput = z.infer<typeof ageVerificationSchema>;
export type PatchMe = z.infer<typeof patchMeSchema>;
export type PutInterests = z.infer<typeof putInterestsSchema>;
export type CreateReport = z.infer<typeof createReportSchema>;
export type VibeCheckInput = z.infer<typeof vibeCheckSchema>;
export type AdminDecision = z.infer<typeof adminDecisionSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type Me = z.infer<typeof meSchema>;
export type VerificationResultValue = z.infer<typeof VerificationResult>;
export type EnforcementActionValue = z.infer<typeof EnforcementAction>;
export type ReportStatusValue = z.infer<typeof ReportStatus>;
