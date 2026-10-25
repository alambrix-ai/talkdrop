import { useEffect, useRef } from 'react';

export function LocalVideo({
  muted,
  cameraOff,
  className,
  style,
}: {
  muted: boolean;
  cameraOff: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (ref.current) {
          ref.current.srcObject = stream;
          await ref.current.play().catch(() => undefined);
        }
      } catch {
        // Camera unavailable — placeholder remains
      }
    }

    void start();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const stream = ref.current?.srcObject as MediaStream | null;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !cameraOff;
    });
  }, [muted, cameraOff]);

  return (
    <video
      ref={ref}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: 'scaleX(-1)',
        background: 'linear-gradient(160deg, var(--slate), var(--grey))',
        ...style,
      }}
      playsInline
      muted
      aria-label="Your camera"
    />
  );
}
