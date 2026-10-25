import type { CreateReport, EnforcementAction } from '@talkdrop/shared';
import type { AppConfig } from '../../config.js';
import { encryptBuffer } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { Providers } from '../../providers/index.js';
import { SessionsService } from '../sessions/sessions.service.js';

export class ReportsService {
  constructor(
    private config: AppConfig,
    private providers: Providers,
    private sessions: SessionsService,
  ) {}

  async create(reporterId: string, input: CreateReport) {
    const session = await prisma.session.findUnique({
      where: { id: input.sessionId },
      include: { participants: true },
    });
    if (!session) throw new AppError('not_found', 'Session not found', 404);
    if (!session.participants.some((p) => p.userId === reporterId)) {
      throw new AppError('forbidden', 'Not a participant', 403);
    }
    const reported = session.participants.find((p) => p.userId !== reporterId);
    if (!reported) throw new AppError('not_found', 'Partner missing', 404);

    const severity =
      input.category === 'underage' || input.category === 'nudity' ? 'high' : 'medium';
    const status =
      input.category === 'underage' || input.category === 'nudity' ? 'escalated' : 'open';

    const expiresAt = new Date(Date.now() + this.config.EVIDENCE_TTL_HOURS * 3600 * 1000);

    // Snapshot recent moderation events as encrypted evidence (never raw video)
    const events = await prisma.moderationEvent.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { id: 'desc' },
      take: 30,
    });
    const payload = Buffer.from(
      JSON.stringify({
        sessionId: input.sessionId,
        category: input.category,
        events: events.map((e) => ({
          kind: e.kind,
          label: e.label,
          score: e.score?.toString(),
          createdAt: e.createdAt.toISOString(),
        })),
        note: 'Evidence buffer snapshot — frames/transcripts only, not full media',
      }),
      'utf8',
    );
    const encrypted = encryptBuffer(payload, this.config.FIELD_ENCRYPTION_KEY);
    const storageKey = `evidence/${input.sessionId}/${Date.now()}.bin`;
    await this.providers.storage.putObject(storageKey, encrypted, 'application/octet-stream');

    const report = await prisma.report.create({
      data: {
        sessionId: input.sessionId,
        reporterId,
        reportedId: reported.userId,
        category: input.category,
        details: input.details,
        status,
        severity,
        retentionDeadline: expiresAt,
        evidence: {
          create: {
            storageKey,
            kind: 'snapshot',
            encrypted: true,
            expiresAt,
          },
        },
      },
    });

    if (input.alsoBlock) {
      await prisma.block.upsert({
        where: {
          blockerId_blockedId: { blockerId: reporterId, blockedId: reported.userId },
        },
        create: { blockerId: reporterId, blockedId: reported.userId },
        update: {},
      });
    }

    if (input.category === 'underage') {
      // Stub for legal CSAM / underage workflow — specialist + counsel required before launch
      await this.handleCsamSuspicion(report.id, reported.userId);
    }

    await this.sessions.finish(input.sessionId, reporterId, 'report');

    return {
      id: Number(report.id),
      status: report.status,
      severity: report.severity,
    };
  }

  /** TODO: hash-matching + legal reporting workflow before public launch. Do not store suspected CSAM. */
  async handleCsamSuspicion(reportId: bigint, userId: string): Promise<void> {
    await prisma.enforcement.create({
      data: {
        userId,
        action: 'suspend',
        reason: 'Automated hold pending underage review',
        reportId,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'suspended', trustTier: 'flagged' },
    });
    console.warn(`[safety] CSAM/underage suspicion stub fired for report ${reportId}`);
  }

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new AppError('invalid', 'Cannot block yourself', 400);
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
    return { ok: true };
  }

  async unblock(blockerId: string, blockedId: string) {
    await prisma.block.deleteMany({ where: { blockerId, blockedId } });
    return { ok: true };
  }

  async listBlocks(userId: string) {
    const rows = await prisma.block.findMany({
      where: { blockerId: userId },
      include: { blocked: true },
    });
    return rows.map((r) => ({
      userId: r.blockedId,
      displayName: r.blocked.displayName,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async applyEnforcement(input: {
    userId: string;
    action: EnforcementAction;
    reason?: string;
    reportId?: bigint;
    actorId?: string;
    suspendDays?: number;
  }) {
    const expiresAt =
      input.action === 'video_block'
        ? new Date(Date.now() + 24 * 3600 * 1000)
        : input.action === 'suspend'
          ? new Date(Date.now() + (input.suspendDays ?? 7) * 24 * 3600 * 1000)
          : null;

    await prisma.enforcement.create({
      data: {
        userId: input.userId,
        action: input.action,
        reason: input.reason,
        reportId: input.reportId,
        actorId: input.actorId,
        expiresAt,
      },
    });

    if (input.action === 'ban') {
      await prisma.user.update({
        where: { id: input.userId },
        data: { status: 'banned', trustTier: 'flagged' },
      });
    } else if (input.action === 'suspend') {
      await prisma.user.update({
        where: { id: input.userId },
        data: { status: 'suspended' },
      });
    } else if (input.action === 'shadow_pool' || input.action === 'video_block') {
      await prisma.user.update({
        where: { id: input.userId },
        data: { status: 'restricted', trustTier: 'flagged' },
      });
    }
  }
}
