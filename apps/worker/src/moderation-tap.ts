/**
 * Server-side LiveKit moderation tap.
 *
 * Joins each LiveKit room as a hidden subscriber (when LIVEKIT_MOCK=false) and
 * samples remote video frames via `@livekit/rtc-node` when available. Falls back
 * to room-meta / synthetic buffers otherwise. MOD_FORCE_FLAG still forces a cut.
 */
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { ModerationProvider } from '@talkdrop/shared';
import type { FrameSampler } from './frame-sampler.js';
import type { WorkerLiveKit } from './livekit.js';

const CUT_CHANNEL = 'talkdrop:cut';
const ACTIVE_TAPS = new Set<string>();

export interface ModerationTapDeps {
  prisma: PrismaClient;
  redis: Redis;
  moderation: ModerationProvider;
  nudityCut: number;
  livekit: WorkerLiveKit;
  sampler: FrameSampler;
  /** Inject a forced FLAG frame for a session (tests). */
  forceFlagSessionIds?: Set<string>;
}

export async function sampleSession(
  deps: ModerationTapDeps,
  sessionId: string,
  userId: string,
  roomName?: string | null,
): Promise<{ cut: boolean; score: number; label: string; source: string }> {
  let buffer: Buffer;
  let source = 'synthetic';

  if (deps.forceFlagSessionIds?.has(sessionId) || process.env.MOD_FORCE_FLAG === '1') {
    buffer = Buffer.from('FLAG-server-tap');
    source = 'forced-flag';
  } else {
    const sample = await deps.sampler.sampleRoom(roomName ?? sessionId, sessionId);
    buffer = sample.buffer;
    source = sample.source;
  }

  // Mark hidden-subscriber join intent for observability
  await deps.redis.set(
    `modtap:${sessionId}`,
    JSON.stringify({
      joinedAt: Date.now(),
      mode: deps.livekit.mock ? 'mock-hidden-subscriber' : 'hidden-subscriber',
      source,
    }),
    'EX',
    120,
  );

  const result = await deps.moderation.scanImage(buffer);
  const top = result.labels[0];
  const score = top?.score ?? 0;
  const label = top?.name ?? 'unknown';

  let actionTaken = 'none';
  let cut = false;

  const nudityScore =
    result.labels.find((l) => /nudity|sexual|csam|minor/i.test(l.name))?.score ?? 0;
  if (result.flagged || nudityScore >= deps.nudityCut) {
    actionTaken = 'server_cut';
    cut = true;
  } else if (nudityScore >= 0.6) {
    actionTaken = 'review';
  }

  await deps.prisma.moderationEvent.create({
    data: {
      sessionId,
      userId,
      kind: 'frame',
      label: `server:${source}:${label}`,
      score,
      actionTaken,
    },
  });

  if (cut) {
    const session = await deps.prisma.session.findUnique({ where: { id: sessionId } });
    if (session && session.status !== 'ended' && session.status !== 'cut') {
      await deps.prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'cut',
          endedAt: new Date(),
          endReason: 'moderation_cut',
          durationSec: session.startedAt
            ? Math.round((Date.now() - session.startedAt.getTime()) / 1000)
            : 0,
        },
      });
      await deps.prisma.user.update({
        where: { id: userId },
        data: { trustTier: 'flagged', status: 'restricted' },
      });
      await deps.redis.publish(
        CUT_CHANNEL,
        JSON.stringify({
          sessionId,
          reason: 'moderation_cut',
          userMessage:
            'This call was ended by server-side safety systems. A short clip may be reviewed.',
        }),
      );
    }
  }

  return { cut, score, label, source };
}

/** Discover live/connecting sessions and sample one participant each. */
export async function runModerationTapCycle(deps: ModerationTapDeps): Promise<number> {
  const sessions = await deps.prisma.session.findMany({
    where: { status: { in: ['live', 'connecting'] } },
    include: { participants: true },
    take: 50,
  });

  let sampled = 0;
  for (const session of sessions) {
    if (ACTIVE_TAPS.has(session.id)) continue;
    const participant = session.participants[0];
    if (!participant) continue;

    ACTIVE_TAPS.add(session.id);
    try {
      await sampleSession(deps, session.id, participant.userId, session.livekitRoom);
      sampled += 1;
    } finally {
      ACTIVE_TAPS.delete(session.id);
    }
  }
  return sampled;
}

export function startModerationTap(
  deps: ModerationTapDeps,
  intervalMs = 2000,
  log: (msg: string) => void = console.info,
): () => void {
  log(
    `[mod-tap] starting server-side moderation tap (mock=${deps.livekit.mock})`,
  );
  const timer = setInterval(() => {
    void runModerationTapCycle(deps).catch((err) =>
      log(`[mod-tap] error: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, intervalMs);
  return () => {
    clearInterval(timer);
    void deps.sampler.disconnectAll();
  };
}
