import { z } from 'zod';
import { EndReason, Mood, TrustTier } from './enums.js';

export const queueJoinSchema = z.object({
  interests: z.array(z.string()).min(1),
  mood: Mood,
  languages: z.array(z.string()).min(1),
  region: z.string().optional(),
  filters: z
    .object({
      regions: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
    })
    .optional(),
});

export const matchFoundSchema = z.object({
  sessionId: z.string().uuid(),
  partner: z.object({
    displayName: z.string(),
    age: z.number().optional(),
    city: z.string().nullable().optional(),
    trustTier: TrustTier,
    verified: z.boolean(),
  }),
  sharedInterests: z.array(z.string()),
  icebreaker: z.string(),
  livekit: z.object({
    url: z.string(),
    token: z.string(),
  }),
});

export const sessionStartedSchema = z.object({
  sessionId: z.string().uuid(),
  startedAt: z.string(),
  blurUntilMs: z.number(),
});

export const sessionEndedSchema = z.object({
  reason: EndReason,
  sessionId: z.string().uuid().optional(),
});

export const sessionCutSchema = z.object({
  reason: z.string(),
  userMessage: z.string(),
});

export const chatSendSchema = z.object({
  connectionId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export const chatMessageSchema = z.object({
  id: z.number(),
  connectionId: z.string().uuid(),
  senderId: z.string().uuid(),
  body: z.string(),
  createdAt: z.string(),
});

export const presenceUpdateSchema = z.object({
  userId: z.string().uuid(),
  online: z.boolean(),
});

export const callIncomingSchema = z.object({
  connectionId: z.string().uuid(),
  sessionId: z.string().uuid(),
  from: z.object({
    displayName: z.string(),
    userId: z.string().uuid(),
  }),
  livekit: z.object({
    url: z.string(),
    token: z.string(),
  }),
});

export const icebreakerNewSchema = z.object({
  text: z.string(),
});

export const activityStartSchema = z.object({
  sessionId: z.string().uuid(),
  activity: z.enum(['would-you-rather', 'trivia', 'co-draw', 'co-watch']),
  prompt: z.string(),
  options: z.tuple([z.string(), z.string()]),
});

export const activityUpdateSchema = z.object({
  sessionId: z.string().uuid(),
  choice: z.enum(['a', 'b']),
  userId: z.string().uuid(),
});

/** Client → server event names */
export const captionLineSchema = z.object({
  sessionId: z.string().uuid(),
  speakerLocale: z.string(),
  text: z.string(),
  original: z.string().optional(),
  translatedTo: z.string().nullable().optional(),
});

export const effectIdSchema = z.enum(['none', 'warm', 'mono', 'soft']);
export type EffectId = z.infer<typeof effectIdSchema>;

export const effectSetSchema = z.object({
  sessionId: z.string().uuid(),
  effect: effectIdSchema,
  userId: z.string().uuid().optional(),
});

export const ClientEvents = {
  QUEUE_JOIN: 'queue:join',
  QUEUE_LEAVE: 'queue:leave',
  MATCH_ACCEPT: 'match:accept',
  MATCH_DECLINE: 'match:decline',
  SESSION_NEXT: 'session:next',
  SESSION_END: 'session:end',
  SESSION_KEEP: 'session:keep',
  ACTIVITY_START: 'activity:start',
  ACTIVITY_UPDATE: 'activity:update',
  CHAT_SEND: 'chat:send',
  CHAT_READ: 'chat:read',
  CHAT_TYPING: 'chat:typing',
  CAPTIONS_TOGGLE: 'captions:toggle',
  AVATAR_CONSENT: 'avatar:consent',
  EFFECT_SET: 'effect:set',
} as const;

/** Server → client event names */
export const ServerEvents = {
  MATCH_FOUND: 'match:found',
  SESSION_STARTED: 'session:started',
  SESSION_ENDED: 'session:ended',
  SESSION_CUT: 'session:cut',
  SESSION_PARTNER_KEPT: 'session:partnerKept',
  ICEBREAKER_NEW: 'icebreaker:new',
  ACTIVITY_START: 'activity:start',
  ACTIVITY_UPDATE: 'activity:update',
  CHAT_MESSAGE: 'chat:message',
  CHAT_READ: 'chat:read',
  CHAT_TYPING: 'chat:typing',
  PRESENCE_UPDATE: 'presence:update',
  CALL_INCOMING: 'call:incoming',
  TRUST_UPDATED: 'trust:updated',
  ACCOUNT_RESTRICTED: 'account:restricted',
  CAPTION_LINE: 'caption:line',
  AVATAR_MODE: 'avatar:mode',
  EFFECT_SET: 'effect:set',
} as const;

export type QueueJoin = z.infer<typeof queueJoinSchema>;
export type MatchFound = z.infer<typeof matchFoundSchema>;
export type SessionStarted = z.infer<typeof sessionStartedSchema>;
export type SessionEnded = z.infer<typeof sessionEndedSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
