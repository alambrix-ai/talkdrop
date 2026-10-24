import { z } from 'zod';

const WEAK_SECRETS = new Set([
  'change-me-access-secret-min-32-chars',
  'change-me-refresh-secret-min-32-chars',
  'change-me-trust-secret-min-32-chars',
  'secret',
  'devkey',
  'minio123',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  TRUST_TOKEN_SECRET: z.string().min(32),
  /** Base64-encoded ≥32-byte key for evidence + phone field encryption */
  FIELD_ENCRYPTION_KEY: z.string().min(32),
  /** Shared secret for LiveKit + billing internal webhooks (header x-talkdrop-webhook-secret) */
  INTERNAL_WEBHOOK_SECRET: z.string().min(16).optional(),
  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().default('secret'),
  // Default false → real SFU when Compose LiveKit is up. Set LIVEKIT_MOCK=true to force mock.
  LIVEKIT_MOCK: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_BUCKET: z.string().default('talkdrop-evidence'),
  S3_ACCESS_KEY: z.string().default('minio'),
  S3_SECRET_KEY: z.string().default('minio123'),
  S3_REGION: z.string().default('us-east-1'),
  S3_MOCK: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  SMS_PROVIDER: z.string().default('mock'),
  AGE_PROVIDER: z.string().default('ondevice'),
  MODERATION_PROVIDER: z.string().default('mock'),
  STT_PROVIDER: z.string().default('local'),
  MT_PROVIDER: z.string().default('mymemory'),
  MOD_NUDITY_CUT: z.coerce.number().default(0.85),
  MOD_NUDITY_REVIEW: z.coerce.number().default(0.6),
  MOD_TOXICITY_CUT: z.coerce.number().default(0.9),
  EVIDENCE_TTL_HOURS: z.coerce.number().default(24),
  BLUR_FIRST_SECONDS: z.coerce.number().default(15),
  MATCH_WIDEN_AFTER_MS: z.coerce.number().default(8000),
  MATCH_INTERVAL_MS: z.coerce.number().default(300),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  API_ORIGIN: z.string().default('http://localhost:4000'),
  API_PORT: z.coerce.number().default(4000),
  /** Talkdrop Plus billing stays mock until payments launch (intentionally deferred). */
  BILLING_PROVIDER: z.string().default('mock'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

function assertProductionSecrets(config: AppConfig): void {
  if (config.NODE_ENV !== 'production') return;

  const checks: Array<[string, string | undefined]> = [
    ['JWT_ACCESS_SECRET', config.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', config.JWT_REFRESH_SECRET],
    ['TRUST_TOKEN_SECRET', config.TRUST_TOKEN_SECRET],
    ['FIELD_ENCRYPTION_KEY', config.FIELD_ENCRYPTION_KEY],
    ['LIVEKIT_API_SECRET', config.LIVEKIT_API_SECRET],
    ['INTERNAL_WEBHOOK_SECRET', config.INTERNAL_WEBHOOK_SECRET],
  ];

  for (const [name, value] of checks) {
    if (!value || value.length < 16 || WEAK_SECRETS.has(value) || value.startsWith('change-me')) {
      throw new Error(
        `Production refuses weak or missing secret: ${name}. Use a secret manager; see README Security.`,
      );
    }
  }

  // FIELD_ENCRYPTION_KEY must decode to ≥32 bytes
  try {
    const key = Buffer.from(config.FIELD_ENCRYPTION_KEY, 'base64');
    if (key.length < 32) {
      throw new Error('FIELD_ENCRYPTION_KEY must be base64 for ≥32 bytes');
    }
  } catch (err) {
    throw new Error(
      `Invalid FIELD_ENCRYPTION_KEY: ${err instanceof Error ? err.message : 'decode failed'}`,
    );
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached && env === process.env) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${msg}`);
  }
  assertProductionSecrets(parsed.data);
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}

export function resetConfigCache(): void {
  cached = null;
}
