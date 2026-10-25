import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import type { Providers } from '../../providers/index.js';

export class RoomsService {
  async list() {
    const rooms = await prisma.room.findMany({
      orderBy: { startsAt: 'asc' },
      take: 50,
    });
    return rooms.map((r) => ({
      id: r.id,
      title: r.title,
      startsAt: r.startsAt?.toISOString() ?? null,
      capacity: r.capacity,
      language: r.language,
      joinedCount: r.joinedCount,
      open: !r.startsAt || r.startsAt <= new Date(),
    }));
  }

  async join(roomId: string, userId: string, providers: Providers) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new AppError('not_found', 'Room not found', 404);
    if (room.joinedCount >= room.capacity) {
      throw new AppError('room_full', 'Room is full', 409);
    }

    await prisma.room.update({
      where: { id: roomId },
      data: { joinedCount: { increment: 1 } },
    });

    // Group roulette: create a multi-participant session keyed by room
    const session = await prisma.session.create({
      data: {
        kind: 'room',
        status: 'connecting',
        icebreaker: `Welcome to ${room.title ?? 'the room'}`,
        livekitRoom: undefined,
        participants: { create: [{ userId, joinedAt: new Date() }] },
      },
    });
    const lkRoom = `room_${roomId}_${session.id.slice(0, 8)}`;
    await prisma.session.update({ where: { id: session.id }, data: { livekitRoom: lkRoom } });
    await providers.livekit.createRoom(lkRoom);
    const livekit = await providers.livekit.createToken({
      roomName: lkRoom,
      identity: userId,
      name: 'Guest',
    });

    return {
      roomId,
      sessionId: session.id,
      livekit,
      note: 'Group roulette / hosted rooms — v1 scaffolding',
    };
  }

  async create(input: {
    title: string;
    language?: string;
    capacity?: number;
    startsAt?: string;
    hostId?: string;
  }) {
    return prisma.room.create({
      data: {
        title: input.title,
        language: input.language,
        capacity: input.capacity ?? 6,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        hostId: input.hostId,
      },
    });
  }
}
