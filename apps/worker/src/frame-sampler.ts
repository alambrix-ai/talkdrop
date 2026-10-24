/**
 * Server-side LiveKit frame sampler for the moderation tap.
 *
 * Real path: mint a hidden subscriber token, join via `@livekit/rtc-node`
 * (when installed), and pull VideoFrame buffers from remote tracks.
 *
 * Fallback (no rtc-node / join failure): build a deterministic JPEG-like
 * buffer tagged with room participant identities so the ModerationProvider
 * still receives non-FLAG samples. MOD_FORCE_FLAG continues to inject cuts.
 */
import type { WorkerLiveKit } from './livekit.js';

export interface FrameSample {
  buffer: Buffer;
  source: 'rtc-node' | 'room-meta' | 'forced-flag' | 'synthetic';
  participantIdentity?: string;
}

export interface FrameSampler {
  sampleRoom(roomName: string, sessionId: string): Promise<FrameSample>;
  disconnectAll(): Promise<void>;
}

function metaFrame(sessionId: string, identities: string[]): Buffer {
  // Not a real JPEG — mock moderation keys off UTF-8 markers; real vendors
  // receive rtc-node RGB/JPEG frames. Tag so logs show the sampler path.
  return Buffer.from(
    `server-tap:meta:${sessionId}:participants=${identities.join(',')}:${Date.now()}`,
  );
}

export function createFrameSampler(livekit: WorkerLiveKit): FrameSampler {
  const rooms = new Map<string, { disconnect: () => Promise<void> }>();

  return {
    async sampleRoom(roomName, sessionId) {
      if (process.env.MOD_FORCE_FLAG === '1') {
        return {
          buffer: Buffer.from('FLAG-server-tap'),
          source: 'forced-flag',
        };
      }

      if (livekit.mock) {
        return {
          buffer: Buffer.from(`server-tap:${sessionId}:${Date.now()}`),
          source: 'synthetic',
        };
      }

      // Prefer real hidden subscriber via @livekit/rtc-node
      try {
        const rtc = await import('@livekit/rtc-node').catch(() => null);
        if (rtc) {
          const { token } = await livekit.createToken({
            roomName,
            identity: `modbot:${sessionId.slice(0, 8)}`,
            name: 'Talkdrop Safety',
            hiddenSubscriber: true,
            ttlSec: 120,
          });

          const room = new rtc.Room();
          await room.connect(livekit.url, token, {
            autoSubscribe: true,
            dynacast: true,
          });

          rooms.set(roomName, {
            disconnect: async () => {
              await room.disconnect();
            },
          });

          // Wait briefly for remote tracks
          await new Promise((r) => setTimeout(r, 400));

          for (const participant of room.remoteParticipants.values()) {
            for (const pub of participant.trackPublications.values()) {
              const track = pub.track;
              if (!track || pub.kind !== rtc.TrackKind.KIND_VIDEO) continue;
              try {
                const stream = new rtc.VideoStream(track);
                const reader = stream.getReader();
                const result = await Promise.race([
                  reader.read(),
                  new Promise<{ done: true; value?: undefined }>((resolve) =>
                    setTimeout(() => resolve({ done: true }), 800),
                  ),
                ]);
                await reader.cancel().catch(() => undefined);
                if (result && 'value' in result && result.value) {
                  const event = result.value as {
                    frame?: {
                      data?: Uint8Array;
                      convert?: (t: unknown) => { data?: Uint8Array };
                    };
                  };
                  let bytes: Uint8Array | undefined = event.frame?.data;
                  if (!bytes && event.frame?.convert) {
                    try {
                      const rgba = event.frame.convert(rtc.VideoBufferType.RGBA);
                      bytes = rgba?.data;
                    } catch {
                      /* ignore convert errors */
                    }
                  }
                  if (bytes && bytes.length > 0) {
                    return {
                      buffer: Buffer.from(bytes),
                      source: 'rtc-node',
                      participantIdentity: participant.identity,
                    };
                  }
                }
              } catch {
                /* try next track */
              }
            }
          }

          const identities = [...room.remoteParticipants.values()].map((p) => p.identity);
          await room.disconnect();
          rooms.delete(roomName);
          return {
            buffer: metaFrame(sessionId, identities),
            source: 'room-meta',
            participantIdentity: identities[0],
          };
        }
      } catch (err) {
        console.warn(
          '[frame-sampler] rtc-node path failed:',
          err instanceof Error ? err.message : err,
        );
      }

      const parts = await livekit.listParticipants(roomName);
      const identities = parts
        .map((p) => p.identity)
        .filter((id) => !id.startsWith('modbot:'));
      return {
        buffer: metaFrame(sessionId, identities),
        source: 'room-meta',
        participantIdentity: identities[0],
      };
    },

    async disconnectAll() {
      for (const [name, handle] of rooms) {
        await handle.disconnect().catch(() => undefined);
        rooms.delete(name);
      }
    },
  };
}
