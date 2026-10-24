import type { LiveKitProvider } from '@talkdrop/shared';
import { SignJWT } from 'jose';

export class MockLiveKitProvider implements LiveKitProvider {
  public rooms = new Set<string>();

  constructor(private url: string) {}

  async createRoom(roomName: string): Promise<void> {
    this.rooms.add(roomName);
  }

  async deleteRoom(roomName: string): Promise<void> {
    this.rooms.delete(roomName);
  }

  async createToken(input: {
    roomName: string;
    identity: string;
    name: string;
    ttlSec?: number;
  }): Promise<{ url: string; token: string }> {
    const secret = new TextEncoder().encode('mock-livekit-secret');
    const token = await new SignJWT({
      video: { roomJoin: true, room: input.roomName, canPublish: true, canSubscribe: true },
      name: input.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(input.identity)
      .setIssuedAt()
      .setExpirationTime(`${input.ttlSec ?? 600}s`)
      .sign(secret);
    return { url: this.url, token };
  }
}

export async function createLiveKitProvider(opts: {
  mock: boolean;
  url: string;
  apiKey: string;
  apiSecret: string;
}): Promise<LiveKitProvider> {
  if (opts.mock) return new MockLiveKitProvider(opts.url);
  try {
    const { AccessToken, RoomServiceClient } = await import('livekit-server-sdk');
    const rooms = new RoomServiceClient(opts.url.replace(/^ws/, 'http'), opts.apiKey, opts.apiSecret);
    return {
      async createRoom(roomName: string) {
        await rooms.createRoom({ name: roomName, emptyTimeout: 60, maxParticipants: 4 });
      },
      async deleteRoom(roomName: string) {
        try {
          await rooms.deleteRoom(roomName);
        } catch {
          /* ignore */
        }
      },
      async createToken(input) {
        const at = new AccessToken(opts.apiKey, opts.apiSecret, {
          identity: input.identity,
          name: input.name,
          ttl: input.ttlSec ?? 600,
        });
        at.addGrant({
          roomJoin: true,
          room: input.roomName,
          canPublish: true,
          canSubscribe: true,
        });
        return { url: opts.url, token: await at.toJwt() };
      },
    };
  } catch {
    return new MockLiveKitProvider(opts.url);
  }
}
