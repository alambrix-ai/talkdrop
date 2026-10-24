import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { runMatchCycle } from './matcher.js';
import { expireEvidence, recomputeTrust, updateStreaks } from './jobs.js';
import { startModerationTap } from './moderation-tap.js';
import { MockModerationProvider } from './mock-moderation.js';
import { createWorkerLiveKit } from './livekit.js';
import { createFrameSampler } from './frame-sampler.js';

function loadEnvFile() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadEnvFile();

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const matchInterval = Number(process.env.MATCH_INTERVAL_MS ?? 300);
const widenAfterMs = Number(process.env.MATCH_WIDEN_AFTER_MS ?? 8000);
const blurFirstSeconds = Number(process.env.BLUR_FIRST_SECONDS ?? 15);
const livekit = createWorkerLiveKit();
const sampler = createFrameSampler(livekit);

const mockStorage = {
  async deleteObject(key: string) {
    console.info(`[worker] expired evidence object ${key}`);
  },
};

console.info('Talkdrop worker starting (matcher + jobs + server-side mod tap)');

setInterval(() => {
  void runMatchCycle({
    redis,
    prisma,
    livekit,
    widenAfterMs,
    blurFirstSeconds,
  }).catch((err) => console.error('[matcher]', err));
}, matchInterval);

const stopModTap = startModerationTap(
  {
    prisma,
    redis,
    moderation: new MockModerationProvider(),
    nudityCut: Number(process.env.MOD_NUDITY_CUT ?? 0.85),
    livekit,
    sampler,
  },
  2000,
  (msg) => console.info(msg),
);

setInterval(() => {
  void expireEvidence(prisma, mockStorage)
    .then((n) => n && console.info(`[jobs] expired ${n} evidence objects`))
    .catch((err) => console.error('[evidence]', err));
}, 10 * 60 * 1000);

setInterval(() => {
  void recomputeTrust(prisma)
    .then((n) => n && console.info(`[jobs] trust tiers updated: ${n}`))
    .catch((err) => console.error('[trust]', err));
}, 60 * 60 * 1000);

setInterval(() => {
  void updateStreaks(prisma)
    .then((n) => n && console.info(`[jobs] streaks updated: ${n}`))
    .catch((err) => console.error('[streak]', err));
}, 6 * 60 * 60 * 1000);

process.on('SIGINT', async () => {
  stopModTap();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
});
