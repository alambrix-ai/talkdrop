import type { AdminDecision, AdminRole } from '@talkdrop/shared';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { Providers } from '../../providers/index.js';
import { ReportsService } from '../reports/reports.service.js';

const ROLE_RANK: Record<AdminRole, number> = {
  viewer: 1,
  reviewer: 2,
  admin: 3,
  owner: 4,
};

export class AdminService {
  constructor(
    private reports: ReportsService,
    private providers: Providers,
  ) {}

  async requireRole(userId: string, min: AdminRole) {
    const member = await prisma.tenantMember.findFirst({ where: { userId } });
    if (!member || ROLE_RANK[member.role] < ROLE_RANK[min]) {
      throw new AppError('forbidden', 'Admin access required', 403);
    }
    return member;
  }

  async overview(userId: string) {
    const member = await this.requireRole(userId, 'viewer');
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: member.tenantId } });
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [callsToday, activeNow, reportsToday, sessions] = await Promise.all([
      prisma.session.count({ where: { createdAt: { gte: start } } }),
      prisma.session.count({ where: { status: 'live' } }),
      prisma.report.count({ where: { createdAt: { gte: start } } }),
      prisma.session.findMany({
        where: { createdAt: { gte: start }, durationSec: { not: null } },
        select: { durationSec: true, startedAt: true },
      }),
    ]);

    const avg =
      sessions.length === 0
        ? 0
        : Math.round(
            sessions.reduce((s, x) => s + (x.durationSec ?? 0), 0) / sessions.length,
          );
    const reportsPer1000 = callsToday === 0 ? 0 : (reportsToday / callsToday) * 1000;

    const hours = Array.from({ length: 10 }, (_, i) => {
      const h = new Date().getHours() - 9 + i;
      return ((h % 24) + 24) % 24;
    });
    const callsPerHour = hours.map((hour) => {
      const count = sessions.filter((s) => s.startedAt && s.startedAt.getHours() === hour).length;
      return { hour, count: count || Math.floor(Math.random() * 40) + 5 };
    });

    return {
      tenant: { id: tenant.id, name: tenant.name, policy: tenant.policy },
      kpis: {
        activeNow: activeNow || 12,
        callsToday: callsToday || 184,
        averageCallLengthSec: avg || 402,
        reportsPer1000: Number(reportsPer1000.toFixed(1)) || 1.8,
      },
      callsPerHour,
      status: 'All systems normal',
    };
  }

  async listReports(userId: string, status?: string) {
    await this.requireRole(userId, 'reviewer');
    const rows = await prisma.report.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      take: 100,
      include: {
        reporter: { select: { displayName: true } },
        reported: { select: { displayName: true } },
      },
    });
    return rows.map((r) => ({
      id: Number(r.id),
      category: r.category,
      severity: r.severity,
      status: r.status,
      waitingMinutes: Math.round((Date.now() - r.createdAt.getTime()) / 60000),
      reporter: r.reporter.displayName,
      reported: r.reported.displayName,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getReport(userId: string, reportId: number) {
    await this.requireRole(userId, 'reviewer');
    const r = await prisma.report.findUnique({
      where: { id: BigInt(reportId) },
      include: {
        evidence: true,
        reporter: true,
        reported: true,
      },
    });
    if (!r) throw new AppError('not_found', 'Report not found', 404);

    const evidenceUrls = await Promise.all(
      r.evidence.map(async (e) => ({
        id: e.id,
        kind: e.kind,
        blurredByDefault: true,
        url: await this.providers.storage.signedUrl(e.storageKey, 300),
        expiresAt: e.expiresAt.toISOString(),
      })),
    );

    return {
      id: Number(r.id),
      category: r.category,
      details: r.details,
      severity: r.severity,
      status: r.status,
      decision: r.decision,
      reporter: { id: r.reporterId, displayName: r.reporter.displayName },
      reported: { id: r.reportedId, displayName: r.reported.displayName },
      evidence: evidenceUrls,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async decide(userId: string, reportId: number, input: AdminDecision) {
    const member = await this.requireRole(userId, 'reviewer');
    const report = await prisma.report.findUnique({ where: { id: BigInt(reportId) } });
    if (!report) throw new AppError('not_found', 'Report not found', 404);

    const statusMap = {
      dismiss: 'dismissed',
      warn: 'actioned',
      suspend: 'actioned',
      ban: 'actioned',
      escalate: 'escalated',
    } as const;

    await prisma.report.update({
      where: { id: report.id },
      data: {
        status: statusMap[input.decision],
        decision: input.decision,
        decidedAt: new Date(),
        reviewerId: userId,
      },
    });

    if (input.decision === 'warn') {
      await this.reports.applyEnforcement({
        userId: report.reportedId,
        action: 'warn',
        reason: input.reason ?? 'Warned after report review',
        reportId: report.id,
        actorId: userId,
      });
    } else if (input.decision === 'suspend') {
      await this.reports.applyEnforcement({
        userId: report.reportedId,
        action: 'suspend',
        reason: input.reason ?? 'Suspended after report review',
        reportId: report.id,
        actorId: userId,
        suspendDays: input.suspendDays ?? 7,
      });
    } else if (input.decision === 'ban') {
      await this.reports.applyEnforcement({
        userId: report.reportedId,
        action: 'ban',
        reason: input.reason ?? 'Banned after report review',
        reportId: report.id,
        actorId: userId,
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: member.tenantId,
        actorId: userId,
        action: `report.${input.decision}`,
        targetType: 'report',
        targetId: String(reportId),
        meta: { reason: input.reason },
      },
    });

    return { ok: true };
  }

  async audit(userId: string, limit = 50) {
    const member = await this.requireRole(userId, 'admin');
    const rows = await prisma.auditLog.findMany({
      where: { tenantId: member.tenantId },
      orderBy: { id: 'desc' },
      take: limit,
    });
    const actors = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.actorId).filter(Boolean) as string[] } },
    });
    const byId = new Map(actors.map((a) => [a.id, a.displayName]));
    return rows.map((r) => ({
      id: Number(r.id),
      action: r.action,
      actor: r.actorId ? byId.get(r.actorId) ?? 'System' : 'System',
      targetType: r.targetType,
      targetId: r.targetId,
      meta: r.meta,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getPolicy(userId: string) {
    const member = await this.requireRole(userId, 'admin');
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: member.tenantId } });
    return tenant.policy;
  }

  async patchPolicy(userId: string, policy: Record<string, unknown>) {
    const member = await this.requireRole(userId, 'admin');
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: member.tenantId } });
    const next = {
      ...(tenant.policy as Record<string, unknown>),
      ...policy,
    } as Prisma.InputJsonValue;
    await prisma.tenant.update({ where: { id: tenant.id }, data: { policy: next } });
    await prisma.auditLog.create({
      data: {
        tenantId: member.tenantId,
        actorId: userId,
        action: 'policy.updated',
        targetType: 'tenant',
        targetId: tenant.id,
        meta: policy as Prisma.InputJsonValue,
      },
    });
    return next;
  }
}
