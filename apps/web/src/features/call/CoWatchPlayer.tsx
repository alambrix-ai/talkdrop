import { useEffect, useRef, useState } from 'react';
import { ClientEvents, ServerEvents } from '@talkdrop/shared';
import { Button } from '@talkdrop/ui';
import { connectSocket } from '../../lib/socket';

interface CatalogItem {
  id: string;
  title: string;
  url: string;
}

interface WatchState {
  sessionId: string;
  videoId: string;
  url?: string;
  title?: string;
  playing: boolean;
  positionSec: number;
  userId?: string;
  updatedAt?: number;
}

export function CoWatchPlayer({
  sessionId,
  catalog,
  initial,
  onClose,
}: {
  sessionId: string;
  catalog: CatalogItem[];
  initial: { videoId: string; url: string; playing: boolean; positionSec: number };
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoId, setVideoId] = useState(initial.videoId);
  const [url, setUrl] = useState(initial.url);
  const applyingRemote = useRef(false);

  useEffect(() => {
    const socket = connectSocket();
    const onState = (payload: WatchState) => {
      if (payload.sessionId !== sessionId) return;
      applyingRemote.current = true;
      if (payload.url && payload.url !== url) setUrl(payload.url);
      if (payload.videoId !== videoId) setVideoId(payload.videoId);
      const el = videoRef.current;
      if (el) {
        if (Math.abs(el.currentTime - payload.positionSec) > 0.75) {
          el.currentTime = payload.positionSec;
        }
        if (payload.playing) void el.play().catch(() => undefined);
        else el.pause();
      }
      queueMicrotask(() => {
        applyingRemote.current = false;
      });
    };
    socket.on(ServerEvents.COWATCH_STATE, onState);
    return () => {
      socket.off(ServerEvents.COWATCH_STATE, onState);
    };
  }, [sessionId, url, videoId]);

  function emit(partial: Partial<WatchState>) {
    if (applyingRemote.current) return;
    const el = videoRef.current;
    connectSocket().emit(ClientEvents.COWATCH_STATE, {
      sessionId,
      videoId: partial.videoId ?? videoId,
      playing: partial.playing ?? !(el?.paused ?? true),
      positionSec: partial.positionSec ?? el?.currentTime ?? 0,
    });
  }

  function select(item: CatalogItem) {
    setVideoId(item.id);
    setUrl(item.url);
    emit({ videoId: item.id, playing: false, positionSec: 0 });
  }

  return (
    <div
      role="dialog"
      aria-label="Co-watch player"
      style={{
        position: 'absolute',
        left: 16,
        top: 160,
        width: 340,
        background: 'var(--overlay)',
        color: 'var(--ink)',
        borderRadius: 16,
        padding: 12,
        zIndex: 5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Co-watch</strong>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <video
        ref={videoRef}
        key={url}
        src={url}
        style={{ width: '100%', borderRadius: 12, background: '#000' }}
        controls
        playsInline
        onPlay={() => emit({ playing: true })}
        onPause={() => emit({ playing: false })}
        onSeeked={() => emit({ positionSec: videoRef.current?.currentTime ?? 0 })}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {catalog.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={c.id === videoId ? undefined : 'ghost'}
            aria-pressed={c.id === videoId}
            onClick={() => select(c)}
          >
            {c.title}
          </Button>
        ))}
      </div>
    </div>
  );
}
