import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  ClientEvents,
  ServerEvents,
  chatSendSchema,
  queueJoinSchema,
  type MatchFound,
} from '@talkdrop/shared';
import type { AppConfig } from '../config.js';
import { verifyAccessToken } from '../lib/tokens.js';
import type { Services } from '../modules/routes.js';
import type { Providers } from '../providers/index.js';
import { getRedis } from '../lib/redis.js';

export interface SocketHub {
  io: Server;
  emitToUser: (userId: string, event: string, payload: unknown) => void;
  emitToSession: (sessionId: string, event: string, payload: unknown) => void;
}

export function createSocketHub(
  httpServer: HttpServer,
  config: AppConfig,
  services: Services,
  providers: Providers,
): SocketHub {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: config.WEB_ORIGIN, credentials: true },
  });

  const nsp = io.of('/rt');

  nsp.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.headers.authorization?.replace('Bearer ', '') as string | undefined);
      if (!token) return next(new Error('unauthorized'));
      const claims = await verifyAccessToken(config, token);
      socket.data.userId = claims.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  nsp.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(`user:${userId}`);

    const hb = setInterval(() => {
      void services.matching.heartbeat(userId).catch(() => undefined);
    }, 5000);

    socket.on('disconnect', () => {
      clearInterval(hb);
      void services.matching.leave(userId).catch(() => undefined);
    });

    socket.on(ClientEvents.QUEUE_JOIN, async (payload, ack) => {
      try {
        const prefs = queueJoinSchema.parse(payload);
        const result = await services.matching.join(userId, prefs);
        ack?.({ ok: true, ...result });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof Error ? err.message : 'join_failed' });
      }
    });

    socket.on(ClientEvents.QUEUE_LEAVE, async (_payload, ack) => {
      await services.matching.leave(userId);
      ack?.({ ok: true });
    });

    socket.on(ClientEvents.MATCH_ACCEPT, async (payload: { sessionId: string }, ack) => {
      const key = `accept:${payload.sessionId}`;
      const redis = getRedis();
      await redis.sadd(key, userId);
      await redis.expire(key, 30);
      const members = await redis.smembers(key);
      if (members.length >= 2) {
        const blurUntilMs = Date.now() + config.BLUR_FIRST_SECONDS * 1000;
        nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.SESSION_STARTED, {
          sessionId: payload.sessionId,
          startedAt: new Date().toISOString(),
          blurUntilMs,
        });
      }
      void socket.join(`session:${payload.sessionId}`);
      ack?.({ ok: true });
    });

    socket.on(ClientEvents.MATCH_DECLINE, async (payload: { sessionId: string }, ack) => {
      await services.sessions.finish(payload.sessionId, userId, 'next');
      ack?.({ ok: true });
    });

    socket.on(ClientEvents.SESSION_END, async (payload: { sessionId: string }, ack) => {
      await services.sessions.finish(payload.sessionId, userId, 'hangup');
      nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.SESSION_ENDED, {
        reason: 'hangup',
        sessionId: payload.sessionId,
      });
      ack?.({ ok: true });
    });

    socket.on(ClientEvents.SESSION_NEXT, async (payload: { sessionId: string }, ack) => {
      await services.sessions.finish(payload.sessionId, userId, 'next');
      nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.SESSION_ENDED, {
        reason: 'next',
        sessionId: payload.sessionId,
      });
      ack?.({ ok: true });
    });

    socket.on(ClientEvents.SESSION_KEEP, async (payload: { sessionId: string }, ack) => {
      const result = await services.sessions.keep(payload.sessionId, userId);
      nsp.to(`user:${result.partnerId}`).emit(ServerEvents.SESSION_PARTNER_KEPT, {
        sessionId: payload.sessionId,
      });
      ack?.({ ok: true, ...result });
    });

    socket.on(ClientEvents.CHAT_SEND, async (payload, ack) => {
      try {
        const data = chatSendSchema.parse(payload);
        const msg = await services.connections.send(
          data.connectionId,
          userId,
          data.body,
          providers.moderation,
        );
        const conn = await services.connections.get(data.connectionId, userId);
        const peerId = conn.peer.id!;
        nsp.to(`user:${peerId}`).emit(ServerEvents.CHAT_MESSAGE, msg);
        socket.emit(ServerEvents.CHAT_MESSAGE, msg);
        ack?.({ ok: true, message: msg });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof Error ? err.message : 'send_failed' });
      }
    });

    socket.on(ClientEvents.CHAT_READ, async (payload: { connectionId: string }, ack) => {
      await services.connections.markRead(payload.connectionId, userId);
      ack?.({ ok: true });
    });

    socket.on(ClientEvents.CHAT_TYPING, (payload: { connectionId: string }) => {
      void services.connections.get(payload.connectionId, userId).then((conn) => {
        nsp.to(`user:${conn.peer.id}`).emit(ServerEvents.CHAT_TYPING, {
          connectionId: payload.connectionId,
          userId,
        });
      });
    });
  });

  return {
    io,
    emitToUser(userId, event, payload) {
      nsp.to(`user:${userId}`).emit(event, payload);
    },
    emitToSession(sessionId, event, payload) {
      nsp.to(`session:${sessionId}`).emit(event, payload);
    },
  };
}

/** Helper used by worker to notify matched users */
export type MatchEmitter = (userId: string, payload: MatchFound) => void;
