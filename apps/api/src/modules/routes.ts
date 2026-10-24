import type { FastifyInstance } from 'fastify';
import {
  adminDecisionSchema,
  adminPolicySchema,
  ageVerificationSchema,
  createAppealSchema,
  createBlockSchema,
  createReportSchema,
  endSessionSchema,
  matchFiltersSchema,
  otpRequestSchema,
  otpVerifySchema,
  patchMeSchema,
  putInterestsSchema,
  sendMessageSchema,
  verificationFallbackCompleteSchema,
  verificationFallbackStartSchema,
  vibeCheckSchema,
} from '@talkdrop/shared';
import type { AppConfig } from '../config.js';
import { AppError, toErrorPayload } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { safeEqual, sha256 } from '../lib/crypto.js';
import type { Providers } from '../providers/index.js';
import { AuthService } from './auth/auth.service.js';
import { UsersService } from './users/users.service.js';
import { VerificationService } from './verification/verification.service.js';
import { SessionsService } from './sessions/sessions.service.js';
import { ConnectionsService } from './connections/connections.service.js';
import { ReportsService } from './reports/reports.service.js';
import { ModerationService } from './moderation/moderation.service.js';
import { AdminService } from './admin/admin.service.js';
import { MatchingGateway } from './matching/matching.gateway.js';
import { BillingService } from './billing/billing.service.js';
import { RoomsService } from './rooms/rooms.service.js';
import { ActivitiesService } from './activities/activities.service.js';
import { CaptionsService } from './captions/captions.service.js';
import { PrivacyService } from './privacy/privacy.service.js';
import { metrics, renderMetrics } from '../lib/metrics.js';
import { z } from 'zod';

const REFRESH_COOKIE = 'td_refresh';

const FRAME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream']);
const AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/wav',
  'audio/mpeg',
  'audio/ogg',
  'application/octet-stream',
]);

function headerValue(headers: Record<string, unknown>, name: string): string {
  const raw = headers[name];
  if (Array.isArray(raw)) return String(raw[0] ?? '');
  return raw == null ? '' : String(raw);
}

function assertWebhookSecret(
  req: { headers: Record<string, unknown> },
  config: AppConfig,
): void {
  const expected = config.INTERNAL_WEBHOOK_SECRET;
  if (!expected) {
    if (config.NODE_ENV === 'production') {
      throw new AppError('misconfigured', 'INTERNAL_WEBHOOK_SECRET required', 503);
    }
    return;
  }
  const got = headerValue(req.headers, 'x-talkdrop-webhook-secret');
  if (!got || !safeEqual(got, expected)) {
    throw new AppError('unauthorized', 'Invalid webhook secret', 401);
  }
}

function assertCookieOrigin(req: { headers: Record<string, unknown> }, config: AppConfig): void {
  const origin = headerValue(req.headers, 'origin');
  const referer = headerValue(req.headers, 'referer');
  if (!origin && !referer) {
    if (config.NODE_ENV === 'production') {
      throw new AppError('forbidden', 'Missing Origin', 403);
    }
    return;
  }
  const allowed = config.WEB_ORIGIN;
  if (origin && origin !== allowed) {
    throw new AppError('forbidden', 'Invalid Origin', 403);
  }
  if (!origin && referer && !referer.startsWith(allowed)) {
    throw new AppError('forbidden', 'Invalid Referer', 403);
  }
}

export interface Services {
  auth: AuthService;
  users: UsersService;
  verification: VerificationService;
  sessions: SessionsService;
  connections: ConnectionsService;
  reports: ReportsService;
  moderation: ModerationService;
  admin: AdminService;
  matching: MatchingGateway;
  billing: BillingService;
  rooms: RoomsService;
  activities: ActivitiesService;
  captions: CaptionsService;
  privacy: PrivacyService;
}

export function createServices(config: AppConfig, providers: Providers): Services {
  const sessions = new SessionsService(config, providers);
  const reports = new ReportsService(config, providers, sessions);
  return {
    auth: new AuthService(config, providers),
    users: new UsersService(),
    verification: new VerificationService(config, providers),
    sessions,
    connections: new ConnectionsService(),
    reports,
    moderation: new ModerationService(config, providers, sessions),
    admin: new AdminService(reports, providers),
    matching: new MatchingGateway(),
    billing: new BillingService(),
    rooms: new RoomsService(),
    activities: new ActivitiesService(),
    captions: new CaptionsService(providers.stt, providers.mt),
    privacy: new PrivacyService(),
  };
}

function parse<T>(schema: { parse: (v: unknown) => T }, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err) {
    throw new AppError('validation_error', 'Invalid request', 400, err);
  }
}

export async function registerRoutes(
  app: FastifyInstance,
  config: AppConfig,
  services: Services,
  providers: Providers,
): Promise<void> {
  const cookieOpts = {
    path: '/',
    httpOnly: true,
    sameSite: (config.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax',
    secure: config.NODE_ENV === 'production',
  };

  app.setErrorHandler((err, _req, reply) => {
    const { statusCode, body } = toErrorPayload(err);
    reply.status(statusCode).send(body);
  });

  app.addHook('onResponse', async (req, reply) => {
    metrics.httpRequests.inc({
      method: req.method,
      status: String(reply.statusCode),
    });
  });

  app.get('/health', async () => ({ ok: true, service: 'talkdrop-api' }));
  app.get('/health/ready', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, db: true, redis: true };
  });
  app.get('/metrics', async (_req, reply) => {
    reply.type('text/plain').send(renderMetrics());
  });

  // Auth — stricter per-route rate limits
  app.post(
    '/api/v1/auth/otp/request',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (req) => {
      const body = parse(otpRequestSchema, req.body);
      return services.auth.requestOtp(body.phoneE164);
    },
  );

  app.post(
    '/api/v1/auth/otp/verify',
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (req, reply) => {
      const body = parse(otpVerifySchema, req.body);
      const result = await services.auth.verifyOtp({
        ...body,
        userAgent: req.headers['user-agent'],
        ipHash: sha256(req.ip),
      });
      reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
        ...cookieOpts,
        expires: result.refreshExpiresAt,
      });
      return {
        accessToken: result.accessToken,
        trustToken: result.trustToken,
        user: result.user,
      };
    },
  );

  app.post('/api/v1/auth/refresh', async (req, reply) => {
    assertCookieOrigin(req, config);
    const raw = req.cookies[REFRESH_COOKIE];
    if (!raw) throw new AppError('unauthorized', 'No refresh cookie', 401);
    const result = await services.auth.refresh(raw);
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, {
      ...cookieOpts,
      expires: result.refreshExpiresAt,
    });
    return { accessToken: result.accessToken };
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    assertCookieOrigin(req, config);
    await services.auth.logout(req.cookies[REFRESH_COOKIE]);
    reply.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { ok: true };
  });

  // Verification
  app.post('/api/v1/verification/age', { preHandler: [app.authenticate] }, async (req) => {
    const body = parse(ageVerificationSchema, req.body);
    return services.verification.submitAge(req.user!.id, body);
  });

  app.post(
    '/api/v1/verification/fallback/start',
    { preHandler: [app.authenticate] },
    async (req) => {
      const body = parse(verificationFallbackStartSchema, req.body);
      return services.verification.startFallback(req.user!.id, body.method);
    },
  );

  app.post(
    '/api/v1/verification/fallback/complete',
    { preHandler: [app.authenticate] },
    async (req) => {
      const body = parse(verificationFallbackCompleteSchema, req.body);
      return services.verification.completeFallback(req.user!.id, body.method, body.providerRef);
    },
  );

  // Me / interests
  app.get('/api/v1/me', { preHandler: [app.authenticate] }, async (req) => {
    return services.users.getMe(req.user!.id);
  });

  app.patch('/api/v1/me', { preHandler: [app.authenticate] }, async (req) => {
    const body = parse(patchMeSchema, req.body);
    return services.users.patchMe(req.user!.id, body);
  });

  app.put('/api/v1/me/interests', { preHandler: [app.authenticateVerified] }, async (req) => {
    const body = parse(putInterestsSchema, req.body);
    return services.users.putInterests(req.user!.id, body);
  });

  app.get('/api/v1/interests', { preHandler: [app.authenticateVerified] }, async () => {
    return services.users.listInterests();
  });

  app.get('/api/v1/matching/estimate', { preHandler: [app.authenticateVerified] }, async (req) => {
    return services.sessions.estimate(req.user!.id);
  });

  // Sessions
  app.get('/api/v1/sessions/:id', { preHandler: [app.authenticateVerified] }, async (req) => {
    const { id } = req.params as { id: string };
    return services.sessions.getSummary(id, req.user!.id);
  });

  app.post('/api/v1/sessions/:id/end', { preHandler: [app.authenticateVerified] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(endSessionSchema, req.body);
    return services.sessions.endSession(id, req.user!.id, body.reason);
  });

  app.post('/api/v1/sessions/:id/vibe', { preHandler: [app.authenticateVerified] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(vibeCheckSchema, req.body);
    return services.sessions.vibe(id, req.user!.id, body);
  });

  app.post('/api/v1/sessions/:id/keep', { preHandler: [app.authenticateVerified] }, async (req) => {
    const { id } = req.params as { id: string };
    return services.sessions.keep(id, req.user!.id);
  });

  app.post(
    '/api/v1/sessions/:id/icebreaker/next',
    { preHandler: [app.authenticateVerified] },
    async (req) => {
      const { id } = req.params as { id: string };
      return services.sessions.nextIcebreaker(id, req.user!.id);
    },
  );

  app.post(
    '/api/v1/sessions/:id/moderation/frame',
    { preHandler: [app.authenticateVerified] },
    async (req) => {
      const { id } = req.params as { id: string };
      const file = await req.file();
      if (!file) throw new AppError('validation_error', 'Frame required', 400);
      const mime = file.mimetype?.split(';')[0]?.trim() ?? '';
      if (mime && !FRAME_TYPES.has(mime)) {
        throw new AppError('validation_error', 'Unsupported frame type', 400);
      }
      const buf = await file.toBuffer();
      return services.moderation.scanFrame(id, req.user!.id, buf);
    },
  );

  // Reports / blocks
  app.post(
    '/api/v1/reports',
    {
      preHandler: [app.authenticateVerified],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const body = parse(createReportSchema, req.body);
      return services.reports.create(req.user!.id, body);
    },
  );

  app.post('/api/v1/blocks', { preHandler: [app.authenticateVerified] }, async (req) => {
    const body = parse(createBlockSchema, req.body);
    return services.reports.block(req.user!.id, body.userId);
  });

  app.delete('/api/v1/blocks/:userId', { preHandler: [app.authenticateVerified] }, async (req) => {
    const { userId } = req.params as { userId: string };
    return services.reports.unblock(req.user!.id, userId);
  });

  app.get('/api/v1/blocks', { preHandler: [app.authenticateVerified] }, async (req) => {
    return services.reports.listBlocks(req.user!.id);
  });

  // Connections
  app.get('/api/v1/connections', { preHandler: [app.authenticateVerified] }, async (req) => {
    return services.connections.list(req.user!.id);
  });

  app.get('/api/v1/connections/:id', { preHandler: [app.authenticateVerified] }, async (req) => {
    const { id } = req.params as { id: string };
    return services.connections.get(id, req.user!.id);
  });

  app.get(
    '/api/v1/connections/:id/messages',
    { preHandler: [app.authenticateVerified] },
    async (req) => {
      const { id } = req.params as { id: string };
      const q = req.query as { before?: string };
      return services.connections.messages(
        id,
        req.user!.id,
        q.before ? Number(q.before) : undefined,
      );
    },
  );

  app.post(
    '/api/v1/connections/:id/messages',
    {
      preHandler: [app.authenticateVerified],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = parse(sendMessageSchema, req.body);
      return services.connections.send(id, req.user!.id, body.body, providers.moderation);
    },
  );

  app.post(
    '/api/v1/connections/:id/call',
    { preHandler: [app.authenticateVerified] },
    async (req) => {
      const { id } = req.params as { id: string };
      return services.connections.startCall(id, req.user!.id, providers, config.BLUR_FIRST_SECONDS);
    },
  );

  // Public
  app.get('/api/v1/public/stats', async () => {
    const online = await prisma.user.count({ where: { ageVerified: true } });
    return {
      online: Math.max(online * 40, 128400),
      medianConversationSec: 402,
      reportsPer1000: 1.8,
      languages: 41,
    };
  });

  // Appeals
  app.post('/api/v1/appeals', { preHandler: [app.authenticate] }, async (req) => {
    const body = parse(createAppealSchema, req.body);
    const row = await prisma.appeal.create({
      data: {
        enforcementId: BigInt(body.enforcementId),
        userId: req.user!.id,
        message: body.message,
      },
    });
    return { id: Number(row.id), status: row.status };
  });

  // Billing (Talkdrop Plus — mock adapter in dev)
  app.post('/api/v1/billing/checkout', { preHandler: [app.authenticate] }, async (req) => {
    const body = z
      .object({ provider: z.enum(['stripe', 'razorpay', 'mock']).default('mock') })
      .parse(req.body ?? {});
    return services.billing.checkout(req.user!.id, body.provider);
  });

  app.post('/api/v1/billing/webhook', async (req) => {
    // Billing stays mock; still require shared secret so plan flips are not world-writable
    assertWebhookSecret(req, config);
    const body = z
      .object({
        provider: z.string(),
        event: z.string(),
        userId: z.string().uuid().optional(),
        providerRef: z.string().optional(),
      })
      .parse(req.body);
    return services.billing.handleWebhook(body);
  });

  app.get('/api/v1/billing/status', { preHandler: [app.authenticate] }, async (req) => {
    return services.billing.status(req.user!.id);
  });

  // Rooms / group roulette
  app.get('/api/v1/rooms', { preHandler: [app.authenticateVerified] }, async () => {
    return services.rooms.list();
  });

  app.post('/api/v1/rooms/:id/join', { preHandler: [app.authenticateVerified] }, async (req) => {
    const { id } = req.params as { id: string };
    return services.rooms.join(id, req.user!.id, providers);
  });

  // Activities
  app.post(
    '/api/v1/sessions/:id/activities/start',
    { preHandler: [app.authenticateVerified] },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = z
        .object({
          activity: z.enum(['would-you-rather', 'trivia', 'co-draw', 'co-watch']),
        })
        .parse(req.body);
      await services.sessions.getSummary(id, req.user!.id);
      if (body.activity === 'trivia') {
        const round = services.activities.startTrivia();
        const { _answer: _, ...publicRound } = round;
        return { sessionId: id, ...publicRound };
      }
      if (body.activity === 'co-draw') {
        return { sessionId: id, ...services.activities.startCoDraw() };
      }
      if (body.activity === 'co-watch') {
        return { sessionId: id, ...services.activities.startCoWatch() };
      }
      return { sessionId: id, ...services.activities.startWouldYouRather() };
    },
  );

  // Captions — streaming poll + audio STT upload
  app.get(
    '/api/v1/sessions/:id/captions/next',
    { preHandler: [app.authenticateVerified] },
    async (req) => {
      const { id } = req.params as { id: string };
      const me = await services.users.getMe(req.user!.id);
      await services.sessions.getSummary(id, req.user!.id);
      const tick = Number((req.query as { tick?: string }).tick ?? Date.now());
      const translateTo = me.plan === 'plus' ? me.profile.translateTo ?? 'en' : null;
      const line = services.captions.nextLine(tick, translateTo);
      return {
        sessionId: id,
        ...(await services.captions.translateAsync(line, translateTo)),
      };
    },
  );

  app.post(
    '/api/v1/sessions/:id/captions/audio',
    { preHandler: [app.authenticateVerified] },
    async (req) => {
      const { id } = req.params as { id: string };
      const me = await services.users.getMe(req.user!.id);
      await services.sessions.getSummary(id, req.user!.id);
      const file = await req.file();
      if (!file) throw new AppError('validation_error', 'Audio chunk required', 400);
      const mime = file.mimetype?.split(';')[0]?.trim() ?? '';
      if (mime && !AUDIO_TYPES.has(mime)) {
        throw new AppError('validation_error', 'Unsupported audio type', 400);
      }
      const buf = await file.toBuffer();
      const locale =
        (req.query as { locale?: string }).locale ?? me.profile.languages?.[0] ?? 'en';
      const translateTo = me.plan === 'plus' ? me.profile.translateTo ?? 'en' : null;
      const line = await services.captions.fromAudio(buf, locale, translateTo);
      return {
        sessionId: id,
        ...(await services.captions.translateAsync(line, translateTo)),
      };
    },
  );

  // Privacy / GDPR
  app.get('/api/v1/me/data', { preHandler: [app.authenticate] }, async (req) => {
    return services.privacy.exportData(req.user!.id);
  });

  app.delete('/api/v1/me/data', { preHandler: [app.authenticate] }, async (req) => {
    return services.privacy.deleteData(req.user!.id);
  });

  // Match filters (Plus / Premium — SPEC §7.9 / §11). Empty arrays = any.
  app.get('/api/v1/me/filters', { preHandler: [app.authenticateVerified] }, async (req) => {
    const me = await services.users.getMe(req.user!.id);
    return {
      plan: me.plan,
      plusRequired: me.plan !== 'plus',
      filters: me.matchFilters ?? {},
    };
  });

  app.put('/api/v1/me/filters', { preHandler: [app.authenticateVerified] }, async (req) => {
    const me = await services.users.getMe(req.user!.id);
    services.billing.assertPlus(me.plan);
    const body = matchFiltersSchema.parse(req.body ?? {});
    const updated = await services.users.putMatchFilters(req.user!.id, body);
    const { getRedis } = await import('../lib/redis.js');
    await getRedis().set(
      `filters:${req.user!.id}`,
      JSON.stringify(updated.matchFilters ?? {}),
      'EX',
      86400 * 30,
    );
    return { ok: true, filters: updated.matchFilters ?? {} };
  });

  // Admin — authenticateAdmin gate before service-layer RBAC
  app.get('/api/v1/admin/overview', { preHandler: [app.authenticateAdmin] }, async (req) => {
    return services.admin.overview(req.user!.id);
  });

  app.get('/api/v1/admin/reports', { preHandler: [app.authenticateAdmin] }, async (req) => {
    const q = req.query as { status?: string };
    return services.admin.listReports(req.user!.id, q.status);
  });

  app.get('/api/v1/admin/reports/:id', { preHandler: [app.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    return services.admin.getReport(req.user!.id, Number(id));
  });

  app.post(
    '/api/v1/admin/reports/:id/decision',
    { preHandler: [app.authenticateAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = parse(adminDecisionSchema, req.body);
      return services.admin.decide(req.user!.id, Number(id), body);
    },
  );

  app.get('/api/v1/admin/audit', { preHandler: [app.authenticateAdmin] }, async (req) => {
    return services.admin.audit(req.user!.id);
  });

  app.get(
    '/api/v1/admin/export.csv',
    { preHandler: [app.authenticateAdmin] },
    async (req, reply) => {
      const overview = await services.admin.overview(req.user!.id);
      const reports = await services.admin.listReports(req.user!.id);
      const lines = [
        'metric,value',
        `active_now,${overview.kpis.activeNow}`,
        `calls_today,${overview.kpis.callsToday}`,
        `avg_call_sec,${overview.kpis.averageCallLengthSec}`,
        `reports_per_1000,${overview.kpis.reportsPer1000}`,
        '',
        'report_id,category,severity,status,waiting_minutes',
        ...reports.map(
          (r) => `${r.id},${r.category},${r.severity},${r.status},${r.waitingMinutes}`,
        ),
      ];
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', 'attachment; filename="talkdrop-admin-export.csv"');
      return lines.join('\n');
    },
  );

  app.get('/api/v1/admin/policy', { preHandler: [app.authenticateAdmin] }, async (req) => {
    return services.admin.getPolicy(req.user!.id);
  });

  app.patch('/api/v1/admin/policy', { preHandler: [app.authenticateAdmin] }, async (req) => {
    const body = parse(adminPolicySchema, req.body);
    return services.admin.patchPolicy(req.user!.id, body);
  });

  // Internal LiveKit webhook — requires shared secret (not classic LiveKit JWT verify yet)
  app.post('/internal/livekit/webhook', async (req) => {
    assertWebhookSecret(req, config);
    const body = z
      .object({
        event: z.string().optional(),
        room: z.object({ name: z.string().optional() }).optional(),
        participant: z.object({ identity: z.string().optional() }).optional(),
      })
      .parse(req.body ?? {});
    if (body.event === 'room_finished' && body.room?.name) {
      await prisma.session.updateMany({
        where: { livekitRoom: body.room.name, status: { in: ['live', 'connecting'] } },
        data: { status: 'ended', endedAt: new Date(), endReason: 'hangup' },
      });
    }
    if (body.event === 'participant_joined' && body.room?.name) {
      await prisma.session.updateMany({
        where: { livekitRoom: body.room.name, status: 'connecting' },
        data: { status: 'live', startedAt: new Date() },
      });
    }
    return { ok: true };
  });
}
