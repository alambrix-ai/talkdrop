import { useEffect, useRef, useState } from 'react';
import { ClientEvents, ServerEvents } from '@talkdrop/shared';
import { Button } from '@talkdrop/ui';
import { connectSocket } from '../../lib/socket';

interface StrokePayload {
  sessionId: string;
  strokeId: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  userId?: string;
}

export function CoDrawCanvas({
  sessionId,
  theme,
  onClose,
}: {
  sessionId: string;
  theme?: string;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const points = useRef<Array<{ x: number; y: number }>>([]);
  const [color] = useState('#4A4A4A');

  useEffect(() => {
    const socket = connectSocket();
    const onStroke = (payload: StrokePayload) => {
      if (payload.sessionId !== sessionId) return;
      drawStroke(payload.points, payload.color, payload.width);
    };
    const onClear = (payload: { sessionId: string }) => {
      if (payload.sessionId !== sessionId) return;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !canvasRef.current) return;
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    };
    socket.on(ServerEvents.CODRAW_STROKE, onStroke);
    socket.on(ServerEvents.CODRAW_CLEAR, onClear);
    return () => {
      socket.off(ServerEvents.CODRAW_STROKE, onStroke);
      socket.off(ServerEvents.CODRAW_CLEAR, onClear);
    };
  }, [sessionId]);

  function drawStroke(
    pts: Array<{ x: number; y: number }>,
    strokeColor: string,
    width: number,
  ) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || pts.length < 2) return;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x * canvas.width, pts[0]!.y * canvas.height);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]!.x * canvas.width, pts[i]!.y * canvas.height);
    }
    ctx.stroke();
  }

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    drawing.current = true;
    points.current = [pos(e)];
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    points.current.push(pos(e));
    drawStroke(points.current.slice(-2), color, 3);
  }

  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    const stroke = points.current;
    points.current = [];
    if (stroke.length < 2) return;
    connectSocket().emit(ClientEvents.CODRAW_STROKE, {
      sessionId,
      strokeId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      points: stroke,
      color,
      width: 3,
    });
  }

  function clear() {
    connectSocket().emit(ClientEvents.CODRAW_CLEAR, { sessionId });
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Co-draw canvas"
      style={{
        position: 'absolute',
        right: 16,
        top: 160,
        width: 320,
        background: 'var(--overlay)',
        color: 'var(--ink)',
        borderRadius: 16,
        padding: 12,
        zIndex: 5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Co-draw{theme ? ` · ${theme}` : ''}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        style={{
          width: '100%',
          height: 180,
          background: 'var(--cream)',
          borderRadius: 12,
          touchAction: 'none',
          cursor: 'crosshair',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
