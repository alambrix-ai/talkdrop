import type { EndReason, VibeCheckInput } from '@talkdrop/shared';
import { applyTrustDelta, trustDeltaForOutcome } from '@talkdrop/shared';
import type { AppConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { Providers } from '../../providers/index.js';
import { ConnectionsService } from '../connections/connections.service.js';

export class SessionsService {
  private connections = new ConnectionsService();

  constructor(
    private config: AppConfig,
    private providers: Providers,
  ) {}

  async getSummary(sessionId: string, userId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        participants: {
          include: {
            user: {
              include: {
                profile: true,
                interests: { include: { interest: true } },
              },
            },
          },
        },
      },
    });
    if (!session) throw new AppError('not_found', 'Session not found', 404);
    const me = session.participants.find((p) => p.userId === userId);
    if (!me) throw new AppError('forbidden', 'Not a participant', 403);
    const partner = session.participants.find((p) => p.userId !== userId);
    if (!partner) throw new AppError('not_found', 'Partner missing', 404);

    const myInterests = new Set(me.user.interests.map((i) => i.interest.label));
    const shared = partner.user.interests
      .map((i) => i.interest.label)
      .filter((l) => myInterests.has(l));

    let livekit: { url: string; token: string } | undefined;
    if (session.livekitRoom && session.status !== 'ended' && session.status !== 'cut') {
      livekit = await this.providers.livekit.createToken({
        roomName: session.livekitRoom,
        identity: userId,
        name: me.user.displayName,
      });
    }

    const blurUntilMs =
      session.startedAt && me.user.profile?.blurFirst !== false
        ? new Date(session.startedAt).getTime() + this.config.BLUR_FIRST_SECONDS * 1000
        : Date.now() + this.config.BLUR_FIRST_SECONDS * 1000;

    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      durationSec: session.durationSec,
      endReason: session.endReason,
      blurUntilMs,
      icebreaker: session.icebreaker ?? 'What song have you replayed all week?',
      sharedInterests: shared,
      partner: {
        displayName: partner.user.displayName,
        city: partner.user.profile?.city ?? null,
        trustTier: partner.user.trustTier,
        verified: partner.user.ageVerified,
        languages: partner.user.profile?.languages ?? [],
        interests: partner.user.interests.map((i) => i.interest.label),
      },
      partnerKept: partner.kept,
      kept: me.kept,
      livekit,
    };
  }

  async endSession(sessionId: string, userId: string, reason: 'hangup' | 'next') {
    return this.finish(sessionId, userId, reason);
  }

  async finish(sessionId: string, actorId: string, reason: EndReason) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session) throw new AppError('not_found', 'Session not found', 404);
    if (!session.participants.some((p) => p.userId === actorId)) {
      throw new AppError('forbidden', 'Not a participant', 403);
    }
    if (session.status === 'ended' || session.status === 'cut') {
      return { sessionId, status: session.status, endReason: session.endReason };
    }

    const endedAt = new Date();
    const durationSec = session.startedAt
      ? Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000))
      : 0;

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: reason === 'moderation_cut' ? 'cut' : 'ended',
        endedAt,
        durationSec,
        endReason: reason,
      },
    });
    await prisma.sessionParticipant.updateMany({
      where: { sessionId, leftAt: null },
      data: { leftAt: endedAt },
    });

    if (session.livekitRoom) {
      await this.providers.livekit.deleteRoom(session.livekitRoom);
    }

    return { sessionId, status: reason === 'moderation_cut' ? 'cut' : 'ended', endReason: reason, durationSec };
  }

  async vibe(sessionId: string, fromUserId: string, input: VibeCheckInput) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session) throw new AppError('not_found', 'Session not found', 404);
    const about = session.participants.find((p) => p.userId !== fromUserId);
    if (!about || !session.participants.some((p) => p.userId === fromUserId)) {
      throw new AppError('forbidden', 'Not a participant', 403);
    }

    await prisma.vibeCheck.upsert({
      where: { sessionId_fromUser: { sessionId, fromUser: fromUserId } },
      create: {
        sessionId,
        fromUser: fromUserId,
        aboutUser: about.userId,
        vibe: input.vibe,
        compliments: input.compliments,
      },
      update: { vibe: input.vibe, compliments: input.compliments },
    });

    const aboutUser = await prisma.user.findUniqueOrThrow({ where: { id: about.userId } });
    const delta = trustDeltaForOutcome({
      vibe: input.vibe,
      durationSec: session.durationSec ?? 0,
      reported: false,
      cut: session.endReason === 'moderation_cut',
      mutualKeep: false,
    });
    const next = applyTrustDelta(aboutUser.trustScore, delta, aboutUser.trustTier === 'flagged');
    await prisma.user.update({
      where: { id: about.userId },
      data: { trustScore: next.score, trustTier: next.tier },
    });

    return { ok: true };
  }

  async keep(sessionId: string, userId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session) throw new AppError('not_found', 'Session not found', 404);
    const me = session.participants.find((p) => p.userId === userId);
    const partner = session.participants.find((p) => p.userId !== userId);
    if (!me || !partner) throw new AppError('forbidden', 'Not a participant', 403);

    await prisma.sessionParticipant.update({
      where: { sessionId_userId: { sessionId, userId } },
      data: { kept: true },
    });

    let connectionId: string | null = null;
    if (partner.kept) {
      const conn = await this.connections.createMutual(userId, partner.userId, sessionId);
      connectionId = conn.id;
    }

    return { kept: true, mutual: partner.kept, partnerId: partner.userId, connectionId };
  }

  async nextIcebreaker(sessionId: string, userId: string) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session?.participants.some((p) => p.userId === userId)) {
      throw new AppError('forbidden', 'Not a participant', 403);
    }
    const count = await prisma.icebreaker.count({ where: { active: true } });
    const skip = count > 0 ? Math.floor(Math.random() * count) : 0;
    const ice = await prisma.icebreaker.findFirst({
      where: { active: true },
      skip,
    });
    const text = ice?.text ?? 'Would you rather travel to the past or the future?';
    await prisma.session.update({ where: { id: sessionId }, data: { icebreaker: text } });
    return { text };
  }

  async estimate(userId: string) {
    void userId;
    // Rough estimate from Redis pool size when available; seed-friendly fallback.
    const waiting = await prisma.user.count({ where: { ageVerified: true, status: 'active' } });
    return {
      onlineMatching: Math.max(12, Math.min(waiting * 3, 5000)),
      estimatedWaitMs: waiting > 20 ? 2000 : 4000,
    };
  }
}
