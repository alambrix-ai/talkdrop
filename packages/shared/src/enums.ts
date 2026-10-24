import { z } from 'zod';

export const AccountStatus = z.enum(['active', 'restricted', 'suspended', 'banned']);
export type AccountStatus = z.infer<typeof AccountStatus>;

export const TrustTier = z.enum(['new', 'bronze', 'silver', 'gold', 'platinum', 'flagged']);
export type TrustTier = z.infer<typeof TrustTier>;

export const VerificationMethod = z.enum(['face_estimate', 'phone', 'document']);
export type VerificationMethod = z.infer<typeof VerificationMethod>;

export const VerificationResult = z.enum(['passed', 'uncertain', 'failed']);
export type VerificationResult = z.infer<typeof VerificationResult>;

export const SessionStatus = z.enum(['matching', 'connecting', 'live', 'ended', 'cut']);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const EndReason = z.enum([
  'hangup',
  'next',
  'partner_left',
  'report',
  'moderation_cut',
  'network',
  'timeout',
]);
export type EndReason = z.infer<typeof EndReason>;

export const ReportCategory = z.enum(['nudity', 'harassment', 'underage', 'spam', 'other']);
export type ReportCategory = z.infer<typeof ReportCategory>;

export const ReportStatus = z.enum(['open', 'in_review', 'actioned', 'dismissed', 'escalated']);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const EnforcementAction = z.enum([
  'warn',
  'video_block',
  'shadow_pool',
  'suspend',
  'ban',
]);
export type EnforcementAction = z.infer<typeof EnforcementAction>;

export const Vibe = z.enum(['great', 'okay', 'not_for_me']);
export type Vibe = z.infer<typeof Vibe>;

export const AdminRole = z.enum(['owner', 'admin', 'reviewer', 'viewer']);
export type AdminRole = z.infer<typeof AdminRole>;

export const Mood = z.enum(['chill', 'curious', 'debate', 'play']);
export type Mood = z.infer<typeof Mood>;

/** Self-described gender for matching (optional; prefer_not is allowed). */
export const Gender = z.enum(['woman', 'man', 'nonbinary', 'prefer_not']);
export type Gender = z.infer<typeof Gender>;
