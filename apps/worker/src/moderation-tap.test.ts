import { describe, expect, it, vi } from 'vitest';
import { sampleSession, type ModerationTapDeps } from './moderation-tap.js';

function mockDeps(overrides: Partial<ModerationTapDeps> = {}): ModerationTapDeps {
  const events: unknown[] = [];
  const publishes: Array<{ channel: string; payload: string }> = [];
  return {
    nudityCut: 0.85,
    forceFlagSessionIds: new Set(['sess-flag']),
    livekit: {
      mock: true,
      url: 'ws://localhost:7880',
      apiKey: 'devkey',
      apiSecret: 'secret',
      createRoom: async () => undefined,
      createToken: async () => ({ url: 'ws://localhost:7880', token: 't' }),
      listParticipants: async () => [],
    },
    sampler: {
      sampleRoom: async (room, sessionId) => ({
        buffer: Buffer.from(`server-tap:${sessionId}:${Date.now()}`),
        source: 'synthetic' as const,
      }),
      disconnectAll: async () => undefined,
    },
    moderation: {
      scanImage: async (buf) => {
        const text = buf.toString('utf8');
        if (text.includes('FLAG')) {
          return { labels: [{ name: 'nudity', score: 0.95 }], flagged: true };
        }
        return { labels: [{ name: 'safe', score: 0.99 }], flagged: false };
      },
      transcribeAndScore: async () => ({ text: '', toxicity: 0, labels: [] }),
      scoreText: async () => ({ toxicity: 0, labels: [] }),
    },
    redis: {
      publish: async (channel: string, payload: string) => {
        publishes.push({ channel, payload });
        return 1;
      },
      set: async () => 'OK',
    } as never,
    prisma: {
      moderationEvent: {
        create: async (args: { data: unknown }) => {
          events.push(args.data);
          return args.data;
        },
      },
      session: {
        findUnique: async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          status: 'live',
          startedAt: new Date(Date.now() - 5000),
        }),
        update: vi.fn(async () => ({})),
      },
      user: {
        update: vi.fn(async () => ({})),
      },
    } as never,
    ...overrides,
  };
}

describe('server-side moderation tap', () => {
  it('cuts when frame is flagged', async () => {
    const deps = mockDeps();
    const result = await sampleSession(deps, 'sess-flag', 'user-1');
    expect(result.cut).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.85);
  });

  it('does not cut safe frames', async () => {
    const deps = mockDeps({ forceFlagSessionIds: new Set() });
    const result = await sampleSession(deps, 'sess-safe', 'user-1');
    expect(result.cut).toBe(false);
  });
});
