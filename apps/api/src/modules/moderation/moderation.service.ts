import type { AppConfig } from '../../config.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { Providers } from '../../providers/index.js';
import { SessionsService } from '../sessions/sessions.service.js';

export class ModerationService {
  constructor(
    private config: AppConfig,
    private providers: Providers,
    private sessions: SessionsService,
  ) {}

  async scanFrame(sessionId: string, userId: string, buf: Buffer) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session?.participants.some((p) => p.userId === userId)) {
      throw new AppError('forbidden', 'Not a participant', 403);
    }
    if (session.status === 'ended' || session.status === 'cut') {
      return { flagged: false, cut: false };
    }

    const result = await this.providers.moderation.scanImage(buf);
    const top = result.labels[0];
    const score = top?.score ?? 0;
    const label = top?.name ?? 'unknown';

    let actionTaken = 'none';

    if (score >= this.config.MOD_NUDITY_CUT || result.flagged) {
      actionTaken = 'cut';
      await prisma.moderationEvent.create({
        data: {
          sessionId,
          userId,
          kind: 'frame',
          label,
          score,
          actionTaken,
        },
      });
      await this.sessions.finish(sessionId, userId, 'moderation_cut');
      await prisma.user.update({
        where: { id: userId },
        data: { trustTier: 'flagged', status: 'restricted' },
      });
      return {
        flagged: true,
        cut: true,
        label,
        score,
        userMessage: 'This call was ended by safety systems. A short clip may be reviewed.',
      };
    }

    if (score >= this.config.MOD_NUDITY_REVIEW) {
      actionTaken = 'review';
    }

    await prisma.moderationEvent.create({
      data: {
        sessionId,
        userId,
        kind: 'frame',
        label,
        score,
        actionTaken,
      },
    });

    return { flagged: result.flagged, cut: false, label, score };
  }
}
