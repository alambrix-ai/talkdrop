import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, INTERESTS } from '@talkdrop/shared';
import type { FastifyInstance } from 'fastify';
import { loadConfig, resetConfigCache } from './config.js';
import { buildApp } from './app.js';
import { prisma } from './lib/prisma.js';
import { getRedis } from './lib/redis.js';
import { runMatchCycle } from './modules/matching/run-cycle.js';
import { MockLiveKitProvider } from './providers/livekit.js';

async function signup(app: FastifyInstance, email: string, name: string) {
  const verify = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/google/mock',
    payload: { email, displayName: name, deviceFingerprint: 'e2e-match-fp' },
  });
  if (verify.statusCode !== 200) {
    throw new Error(`google mock signup failed: ${verify.statusCode} ${verify.body}`);
  }
  const { accessToken } = verify.json() as { accessToken: string };
  if (!accessToken) throw new Error('missing accessToken from google mock signup');

  await app.inject({
    method: 'POST',
    url: '/api/v1/verification/age',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { estimatedAge: 24, confidence: 0.95, liveness: true },
  });

  await app.inject({
    method: 'PATCH',
    url: '/api/v1/me',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      languages: ['en'],
      defaultMood: 'chill',
      city: 'Test City',
    },
  });

  const slugs = INTERESTS.slice(0, 4).map((i) => i.slug);
  await app.inject({
    method: 'PUT',
    url: '/api/v1/me/interests',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: { interestSlugs: slugs },
  });

  return accessToken;
}

function connectRt(port: number, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}/rt`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('socket timeout')), 10_000);
  });
}

describe('E2E matching', () => {
  let app: FastifyInstance;
  let port: number;

  beforeAll(async () => {
    resetConfigCache();
    process.env.NODE_ENV = 'test';
    const config = loadConfig();
    const built = await buildApp(config);
    app = built.app;
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('pairs two queued users and ends a session', async () => {
    const stamp = String(Date.now()).slice(-8);
    const tokenA = await signup(app, `user-a.${stamp}@gmail.com`, 'User A');
    const tokenB = await signup(app, `user-b.${stamp}@gmail.com`, 'User B');

    const socketA = await connectRt(port, tokenA);
    const socketB = await connectRt(port, tokenB);

    const matchPromise = Promise.all([
      new Promise<Record<string, unknown>>((resolve) => {
        socketA.once(ServerEvents.MATCH_FOUND, resolve);
      }),
      new Promise<Record<string, unknown>>((resolve) => {
        socketB.once(ServerEvents.MATCH_FOUND, resolve);
      }),
    ]);

    const prefs = {
      interests: INTERESTS.slice(0, 4).map((i) => i.slug),
      mood: 'chill' as const,
      languages: ['en'],
      region: 'global',
    };

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        socketA.emit(ClientEvents.QUEUE_JOIN, prefs, (ack: { ok?: boolean; error?: string }) => {
          if (ack?.ok) resolve();
          else reject(new Error(ack?.error ?? 'join A failed'));
        });
      }),
      new Promise<void>((resolve, reject) => {
        socketB.emit(ClientEvents.QUEUE_JOIN, prefs, (ack: { ok?: boolean; error?: string }) => {
          if (ack?.ok) resolve();
          else reject(new Error(ack?.error ?? 'join B failed'));
        });
      }),
    ]);

    // Drive matcher once (in-process)
    await runMatchCycle({
      redis: getRedis(),
      prisma,
      livekitUrl: 'ws://localhost:7880',
      livekit: new MockLiveKitProvider('ws://localhost:7880'),
      widenAfterMs: 8000,
    });

    const [matchA, matchB] = await Promise.race([
      matchPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('match timeout')), 8000),
      ),
    ]);

    expect(matchA.sessionId).toBe(matchB.sessionId);
    expect(matchA.livekit).toBeTruthy();
    expect(matchB.partner).toBeTruthy();

    const sessionId = matchA.sessionId as string;

    const end = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/end`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { reason: 'hangup' },
    });
    expect(end.statusCode).toBe(200);

    const vibe = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/vibe`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { vibe: 'great', compliments: ['Kind'] },
    });
    expect(vibe.statusCode).toBe(200);

    const keepA = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/keep`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const keepB = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/keep`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(keepA.statusCode).toBe(200);
    expect(keepB.json().mutual || keepA.json().mutual).toBe(true);

    const connections = await app.inject({
      method: 'GET',
      url: '/api/v1/connections',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(connections.statusCode).toBe(200);
    expect((connections.json() as unknown[]).length).toBeGreaterThan(0);

    socketA.close();
    socketB.close();
  }, 30_000);
});
