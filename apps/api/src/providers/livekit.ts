import type { LiveKitProvider } from '@talkdrop/shared';
import { ensureLiveKitRoom, mintLiveKitToken } from '../lib/livekit-tokens.js';

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
    return mintLiveKitToken({
      mock: true,
      url: this.url,
      apiKey: 'devkey',
      apiSecret: 'secret',
      roomName: input.roomName,
      identity: input.identity,
      name: input.name,
      ttlSec: input.ttlSec,
    });
  }
}

export class RealLiveKitProvider implements LiveKitProvider {
  constructor(
    private url: string,
    private apiKey: string,
    private apiSecret: string,
  ) {}

  async createRoom(roomName: string): Promise<void> {
    try {
      await ensureLiveKitRoom({
        mock: false,
        url: this.url,
        apiKey: this.apiKey,
        apiSecret: this.apiSecret,
        roomName,
      });
    } catch (err) {
      console.warn(
        `[livekit] createRoom(${roomName}) failed — is Compose LiveKit up?`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    try {
      const { RoomServiceClient } = await import('livekit-server-sdk');
      const rooms = new RoomServiceClient(
        this.url.replace(/^ws/, 'http'),
        this.apiKey,
        this.apiSecret,
      );
      await rooms.deleteRoom(roomName);
    } catch {
      /* ignore missing rooms */
    }
  }

  async createToken(input: {
    roomName: string;
    identity: string;
    name: string;
    ttlSec?: number;
  }): Promise<{ url: string; token: string }> {
    return mintLiveKitToken({
      mock: false,
      url: this.url,
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      roomName: input.roomName,
      identity: input.identity,
      name: input.name,
      ttlSec: input.ttlSec,
    });
  }
}

export async function createLiveKitProvider(opts: {
  mock: boolean;
  url: string;
  apiKey: string;
  apiSecret: string;
}): Promise<LiveKitProvider> {
  if (opts.mock) {
    console.info('[livekit] using MockLiveKitProvider (LIVEKIT_MOCK=true)');
    return new MockLiveKitProvider(opts.url);
  }

  try {
    // Soft probe: construct client; actual createRoom validates connectivity later.
    await import('livekit-server-sdk');
    console.info(`[livekit] using RealLiveKitProvider → ${opts.url}`);
    return new RealLiveKitProvider(opts.url, opts.apiKey, opts.apiSecret);
  } catch (err) {
    console.warn(
      '[livekit] livekit-server-sdk unavailable, falling back to mock:',
      err instanceof Error ? err.message : err,
    );
    return new MockLiveKitProvider(opts.url);
  }
}
