import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  ClientEvents,
  ServerEvents,
  chatSendSchema,
  codrawStrokeSchema,
  cowatchStateSchema,
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

    socket.on(
      ClientEvents.ACTIVITY_START,
      async (
        payload: {
          sessionId: string;
          activity: 'would-you-rather' | 'trivia' | 'co-draw' | 'co-watch';
        },
        ack,
      ) => {
        try {
          await services.sessions.getSummary(payload.sessionId, userId);
          let round;
          if (payload.activity === 'trivia') {
            const t = services.activities.startTrivia();
            const { _answer: _, ...pub } = t;
            round = pub;
          } else if (payload.activity === 'co-draw') {
            round = services.activities.startCoDraw();
          } else if (payload.activity === 'co-watch') {
            round = services.activities.startCoWatch();
          } else {
            round = services.activities.startWouldYouRather();
          }
          const body = { sessionId: payload.sessionId, ...round };
          nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.ACTIVITY_START, body);
          void socket.join(`session:${payload.sessionId}`);
          ack?.({ ok: true, ...body });
        } catch (err) {
          ack?.({ ok: false, error: err instanceof Error ? err.message : 'activity_failed' });
        }
      },
    );

    socket.on(
      ClientEvents.ACTIVITY_UPDATE,
      async (payload: { sessionId: string; choice: 'a' | 'b' }, ack) => {
        const body = { sessionId: payload.sessionId, choice: payload.choice, userId };
        nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.ACTIVITY_UPDATE, body);
        ack?.({ ok: true });
      },
    );

    socket.on(
      ClientEvents.CAPTIONS_TOGGLE,
      async (payload: { sessionId: string; enabled: boolean }, ack) => {
        if (payload.enabled) {
          const line = await services.captions.translateAsync(
            services.captions.nextLine(Date.now()),
            null,
          );
          nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.CAPTION_LINE, {
            sessionId: payload.sessionId,
            ...line,
          });
        }
        ack?.({ ok: true });
      },
    );

    socket.on(
      ClientEvents.CAPTION_CLIENT_LINE,
      async (
        payload: { sessionId: string; text: string; speakerLocale?: string; translateTo?: string },
        ack,
      ) => {
        try {
          const line = await services.captions.translateAsync(
            await services.captions.fromClientText(
              payload.text,
              payload.speakerLocale ?? 'en',
              payload.translateTo,
            ),
            payload.translateTo,
          );
          const body = { sessionId: payload.sessionId, userId, ...line };
          nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.CAPTION_LINE, body);
          ack?.({ ok: true, ...body });
        } catch (err) {
          ack?.({ ok: false, error: err instanceof Error ? err.message : 'caption_failed' });
        }
      },
    );

    socket.on(
      ClientEvents.AVATAR_CONSENT,
      async (payload: { sessionId: string; consent: boolean }, ack) => {
        nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.AVATAR_MODE, {
          sessionId: payload.sessionId,
          userId,
          avatarOnly: !payload.consent,
        });
        ack?.({ ok: true });
      },
    );

    socket.on(
      ClientEvents.EFFECT_SET,
      async (payload: { sessionId: string; effect: 'none' | 'warm' | 'mono' | 'soft' }, ack) => {
        // Server hook for effect preference (audit / Plus HD future); broadcast to peer.
        const body = {
          sessionId: payload.sessionId,
          effect: payload.effect,
          userId,
        };
        await getRedis().set(
          `effect:${payload.sessionId}:${userId}`,
          payload.effect,
          'EX',
          3600,
        );
        nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.EFFECT_SET, body);
        ack?.({ ok: true, ...body });
      },
    );

    socket.on(ClientEvents.CODRAW_STROKE, async (payload, ack) => {
      try {
        const stroke = codrawStrokeSchema.parse(payload);
        void socket.join(`session:${stroke.sessionId}`);
        nsp.to(`session:${stroke.sessionId}`).emit(ServerEvents.CODRAW_STROKE, {
          ...stroke,
          userId,
        });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof Error ? err.message : 'codraw_failed' });
      }
    });

    socket.on(
      ClientEvents.CODRAW_CLEAR,
      async (payload: { sessionId: string }, ack) => {
        nsp.to(`session:${payload.sessionId}`).emit(ServerEvents.CODRAW_CLEAR, {
          sessionId: payload.sessionId,
          userId,
        });
        ack?.({ ok: true });
      },
    );

    socket.on(ClientEvents.COWATCH_STATE, async (payload, ack) => {
      try {
        const state = cowatchStateSchema.parse(payload);
        const clip = services.activities.resolveCoWatchVideo(state.videoId);
        const body = {
          ...state,
          url: clip.url,
          title: clip.title,
          userId,
          updatedAt: Date.now(),
        };
        void socket.join(`session:${state.sessionId}`);
        nsp.to(`session:${state.sessionId}`).emit(ServerEvents.COWATCH_STATE, body);
        ack?.({ ok: true, ...body });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof Error ? err.message : 'cowatch_failed' });
      }
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
