import Redis from 'ioredis';
import { loadConfig } from '../config.js';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const { REDIS_URL } = loadConfig();
    client = new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  }
  return client;
}

export async function ensureRedis(): Promise<Redis> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    await redis.connect();
  }
  return redis;
}
