import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { Providers } from '../../providers/index.js';

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export class ConnectionsService {
  async createMutual(userA: string, userB: string, originSession?: string) {
    const [a, b] = orderedPair(userA, userB);
    return prisma.connection.upsert({
      where: { userA_userB: { userA: a, userB: b } },
      create: { userA: a, userB: b, originSession },
      update: { status: 'active' },
    });
  }

  async list(userId: string) {
    const rows = await prisma.connection.findMany({
      where: { OR: [{ userA: userId }, { userB: userId }], status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    const result = [];
    for (const c of rows) {
      const otherId = c.userA === userId ? c.userB : c.userA;
      const other = await prisma.user.findUnique({
        where: { id: otherId },
        include: { profile: true, interests: { include: { interest: true } } },
      });
      const last = await prisma.message.findFirst({
        where: { connectionId: c.id },
        orderBy: { id: 'desc' },
      });
      const unread = await prisma.message.count({
        where: { connectionId: c.id, senderId: { not: userId }, readAt: null },
      });
      result.push({
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        peer: {
          id: other?.id,
          displayName: other?.displayName,
          city: other?.profile?.city ?? null,
          languages: other?.profile?.languages ?? [],
          interests: other?.interests.map((i) => i.interest.label) ?? [],
          trustTier: other?.trustTier,
          verified: other?.ageVerified,
        },
        lastMessage: last
          ? { body: last.body, createdAt: last.createdAt.toISOString(), senderId: last.senderId }
          : null,
        unread,
      });
    }
    return result;
  }

  async get(connectionId: string, userId: string) {
    const c = await prisma.connection.findUnique({ where: { id: connectionId } });
    if (!c || (c.userA !== userId && c.userB !== userId)) {
      throw new AppError('not_found', 'Connection not found', 404);
    }
    const list = await this.list(userId);
    const found = list.find((x) => x.id === connectionId);
    if (!found) throw new AppError('not_found', 'Connection not found', 404);
    return found;
  }

  async messages(connectionId: string, userId: string, before?: number, limit = 50) {
    await this.get(connectionId, userId);
    const rows = await prisma.message.findMany({
      where: {
        connectionId,
        ...(before ? { id: { lt: BigInt(before) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit,
    });
    return rows
      .map((m) => ({
        id: Number(m.id),
        connectionId: m.connectionId,
        senderId: m.senderId,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        readAt: m.readAt?.toISOString() ?? null,
      }))
      .reverse();
  }

  async send(
    connectionId: string,
    userId: string,
    body: string,
    moderation?: Providers['moderation'],
  ) {
    await this.get(connectionId, userId);
    let flagged = false;
    if (moderation) {
      const score = await moderation.scoreText(body);
      flagged = score.toxicity >= 0.9;
      if (flagged) {
        throw new AppError('message_blocked', 'Message blocked by safety filters', 400);
      }
    }
    const msg = await prisma.message.create({
      data: { connectionId, senderId: userId, body, moderationFlag: flagged },
    });
    return {
      id: Number(msg.id),
      connectionId: msg.connectionId,
      senderId: msg.senderId,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
    };
  }

  async markRead(connectionId: string, userId: string) {
    await this.get(connectionId, userId);
    await prisma.message.updateMany({
      where: { connectionId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async startCall(connectionId: string, userId: string, providers: Providers, blurSeconds: number) {
    const c = await this.get(connectionId, userId);
    const peerId = c.peer.id!;
    const ice = await prisma.icebreaker.findFirst({ where: { active: true } });
    const session = await prisma.session.create({
      data: {
        status: 'connecting',
        livekitRoom: undefined,
        icebreaker: ice?.text ?? 'What have you been into lately?',
        startedAt: new Date(),
        participants: {
          create: [{ userId, joinedAt: new Date() }, { userId: peerId, joinedAt: new Date() }],
        },
      },
    });
    const room = session.id;
    await prisma.session.update({ where: { id: session.id }, data: { livekitRoom: room } });
    await providers.livekit.createRoom(room);
    // Only mint the caller's token — peer fetches their own via GET /sessions/:id (participant-gated).
    const token = await providers.livekit.createToken({
      roomName: room,
      identity: userId,
      name: 'You',
    });
    return {
      sessionId: session.id,
      peerId,
      livekit: token,
      blurUntilMs: Date.now() + blurSeconds * 1000,
    };
  }
}
