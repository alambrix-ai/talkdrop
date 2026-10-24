import { SignJWT } from 'jose';

export interface WorkerLiveKit {
  mock: boolean;
  url: string;
  apiKey: string;
  apiSecret: string;
  createRoom(roomName: string): Promise<void>;
  createToken(input: {
    roomName: string;
    identity: string;
    name: string;
    hiddenSubscriber?: boolean;
    ttlSec?: number;
  }): Promise<{ url: string; token: string }>;
  listParticipants(roomName: string): Promise<Array<{ identity: string }>>;
}

async function mockToken(
  room: string,
  identity: string,
  name: string,
  hidden = false,
): Promise<string> {
  const secret = new TextEncoder().encode('mock-livekit-secret');
  return new SignJWT({
    video: {
      roomJoin: true,
      room,
      canPublish: !hidden,
      canSubscribe: true,
      hidden,
    },
    name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(identity)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
}

export function createWorkerLiveKit(): WorkerLiveKit {
  const mock = process.env.LIVEKIT_MOCK === 'true';
  const url = process.env.LIVEKIT_URL ?? 'ws://localhost:7880';
  const apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET ?? 'secret';

  if (mock) {
    console.info('[worker-livekit] mock mode');
    return {
      mock: true,
      url,
      apiKey,
      apiSecret,
      async createRoom() {
        /* no-op */
      },
      async createToken(input) {
        return {
          url,
          token: await mockToken(
            input.roomName,
            input.identity,
            input.name,
            input.hiddenSubscriber,
          ),
        };
      },
      async listParticipants() {
        return [];
      },
    };
  }

  console.info(`[worker-livekit] real SFU → ${url}`);
  return {
    mock: false,
    url,
    apiKey,
    apiSecret,
    async createRoom(roomName) {
      try {
        const { RoomServiceClient } = await import('livekit-server-sdk');
        const rooms = new RoomServiceClient(url.replace(/^ws/, 'http'), apiKey, apiSecret);
        try {
          await rooms.createRoom({ name: roomName, emptyTimeout: 60, maxParticipants: 8 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/already exists|conflict/i.test(msg)) throw err;
        }
      } catch (err) {
        console.warn(
          `[worker-livekit] createRoom(${roomName}) failed — is Compose LiveKit up?`,
          err instanceof Error ? err.message : err,
        );
      }
    },
    async createToken(input) {
      const { AccessToken } = await import('livekit-server-sdk');
      const at = new AccessToken(apiKey, apiSecret, {
        identity: input.identity,
        name: input.name,
        ttl: input.ttlSec ?? 600,
      });
      at.addGrant({
        roomJoin: true,
        room: input.roomName,
        canPublish: !input.hiddenSubscriber,
        canSubscribe: true,
        canPublishData: !input.hiddenSubscriber,
        hidden: Boolean(input.hiddenSubscriber),
      });
      return { url, token: await at.toJwt() };
    },
    async listParticipants(roomName) {
      try {
        const { RoomServiceClient } = await import('livekit-server-sdk');
        const rooms = new RoomServiceClient(url.replace(/^ws/, 'http'), apiKey, apiSecret);
        const parts = await rooms.listParticipants(roomName);
        return parts.map((p) => ({ identity: p.identity }));
      } catch {
        return [];
      }
    },
  };
}
