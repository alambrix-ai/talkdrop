import { getRedis } from './redis.js';

export const MATCH_CHANNEL = 'talkdrop:match';
export const CUT_CHANNEL = 'talkdrop:cut';
export const SESSION_CHANNEL = 'talkdrop:session';

export async function publish(channel: string, payload: unknown): Promise<void> {
  const redis = getRedis();
  await redis.publish(channel, JSON.stringify(payload));
}
