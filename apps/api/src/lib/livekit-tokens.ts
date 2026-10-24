import { SignJWT } from 'jose';

export interface LiveKitTokenInput {
  url: string;
  apiKey: string;
  apiSecret: string;
  roomName: string;
  identity: string;
  name: string;
  ttlSec?: number;
  /** Hidden moderation bot — cannot publish, can subscribe. */
  hiddenSubscriber?: boolean;
  mock?: boolean;
}

/** Mint a LiveKit JWT. Uses livekit-server-sdk when not mock; mock HS256 otherwise. */
export async function mintLiveKitToken(input: LiveKitTokenInput): Promise<{
  url: string;
  token: string;
}> {
  if (input.mock) {
    const secret = new TextEncoder().encode('mock-livekit-secret');
    const token = await new SignJWT({
      video: {
        roomJoin: true,
        room: input.roomName,
        canPublish: !input.hiddenSubscriber,
        canSubscribe: true,
        hidden: Boolean(input.hiddenSubscriber),
      },
      name: input.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(input.identity)
      .setIssuedAt()
      .setExpirationTime(`${input.ttlSec ?? 600}s`)
      .sign(secret);
    return { url: input.url, token };
  }

  const { AccessToken } = await import('livekit-server-sdk');
  const at = new AccessToken(input.apiKey, input.apiSecret, {
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
  return { url: input.url, token: await at.toJwt() };
}

export async function ensureLiveKitRoom(opts: {
  mock: boolean;
  url: string;
  apiKey: string;
  apiSecret: string;
  roomName: string;
}): Promise<void> {
  if (opts.mock) return;
  const { RoomServiceClient } = await import('livekit-server-sdk');
  const httpUrl = opts.url.replace(/^ws/, 'http');
  const rooms = new RoomServiceClient(httpUrl, opts.apiKey, opts.apiSecret);
  try {
    await rooms.createRoom({
      name: opts.roomName,
      emptyTimeout: 60,
      maxParticipants: 8,
    });
  } catch (err) {
    // Room may already exist
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already exists|conflict/i.test(msg)) throw err;
  }
}
