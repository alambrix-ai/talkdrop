import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from './config.js';
import { ensureRedis, getRedis } from './lib/redis.js';
import { MATCH_CHANNEL, CUT_CHANNEL, SESSION_CHANNEL } from './lib/bus.js';
import { registerAuth } from './plugins/auth.js';
import { createSocketHub } from './plugins/socket.js';
import { createProviders } from './providers/index.js';
import { createServices, registerRoutes } from './modules/routes.js';
import { ServerEvents, type MatchFound } from '@talkdrop/shared';
import { metrics } from './lib/metrics.js';

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'body.phoneE164',
          'body.code',
          'body.password',
        ],
        remove: true,
      },
    },
  });

  await ensureRedis();

  await app.register(cors, {
    origin: config.NODE_ENV === 'production' ? config.WEB_ORIGIN : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Talkdrop-Webhook-Secret'],
  });
  await app.register(cookie);
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(multipart, {
    limits: { fileSize: 512_000, files: 1 },
  });
  await app.register(rateLimit, {
    global: true,
    max: config.NODE_ENV === 'production' ? 120 : 300,
    timeWindow: '1 minute',
  });

  await registerAuth(app, config);

  const providers = await createProviders(config);
  const services = createServices(config, providers);
  // Hub before routes so REST handlers can notify peers (calls, chat).
  const hub = createSocketHub(app.server, config, services, providers);
  await registerRoutes(app, config, services, providers, hub);

  // Subscribe to worker events
  const sub = getRedis().duplicate();
  await sub.connect();
  await sub.subscribe(MATCH_CHANNEL, CUT_CHANNEL, SESSION_CHANNEL);
  sub.on('message', (channel, message) => {
    try {
      const payload = JSON.parse(message) as Record<string, unknown>;
      if (channel === MATCH_CHANNEL) {
        const data = payload as unknown as MatchFound & { userId: string };
        hub.emitToUser(data.userId, ServerEvents.MATCH_FOUND, data);
        metrics.matches.inc();
      } else if (channel === CUT_CHANNEL) {
        const data = payload as { sessionId: string; reason: string; userMessage: string };
        hub.emitToSession(data.sessionId, ServerEvents.SESSION_CUT, data);
        metrics.moderationCuts.inc({ source: 'server_or_client' });
      } else if (channel === SESSION_CHANNEL) {
        const data = payload as { sessionId: string; event: string; body: unknown };
        hub.emitToSession(data.sessionId, data.event, data.body);
      }
    } catch (err) {
      app.log.error({ err }, 'bus message failed');
    }
  });

  app.addHook('onClose', async () => {
    await sub.quit().catch(() => undefined);
    hub.io.close();
  });

  return { app, services, providers, hub };
}
