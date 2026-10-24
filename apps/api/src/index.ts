import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { getRedis } from './lib/redis.js';
import { startMatcherLoop } from './modules/matching/run-cycle.js';
import { initOtel } from './lib/metrics.js';
import { createLiveKitProvider } from './providers/livekit.js';

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

const config = loadConfig();
await initOtel('talkdrop-api');
const { app } = await buildApp(config);

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
app.log.info(`Talkdrop API listening on ${config.API_PORT}`);

const livekit = await createLiveKitProvider({
  mock: config.LIVEKIT_MOCK,
  url: config.LIVEKIT_URL,
  apiKey: config.LIVEKIT_API_KEY,
  apiSecret: config.LIVEKIT_API_SECRET,
});

// In-process matcher so matching works even if the worker process is down (Lua claim stays atomic).
const stopMatcher = startMatcherLoop(
  {
    redis: getRedis(),
    prisma,
    livekitUrl: config.LIVEKIT_URL,
    livekit,
    widenAfterMs: config.MATCH_WIDEN_AFTER_MS,
  },
  config.MATCH_INTERVAL_MS,
  (msg) => app.log.warn(msg),
);
app.log.info('In-process matcher started');

process.on('SIGINT', () => {
  stopMatcher();
});
