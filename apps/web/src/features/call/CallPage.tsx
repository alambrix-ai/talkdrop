import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClientEvents, ServerEvents, type SessionSummary } from '@talkdrop/shared';
import { Button, Card, Modal, Tag, VideoTile } from '@talkdrop/ui';
import { api, apiForm } from '../../lib/api';
import { connectSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';
import { ReportSheet } from '../report/ReportSheet';

export default function CallPage() {
  const { sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const match = useAppStore((s) => s.match);
  const setToast = useAppStore((s) => s.setToast);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blurred, setBlurred] = useState(true);
  const [icebreaker, setIcebreaker] = useState(match?.icebreaker ?? '');
  const [reportOpen, setReportOpen] = useState(params.get('report') === '1');
  const [cutOpen, setCutOpen] = useState(false);
  const [cutMessage, setCutMessage] = useState('');

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api<SessionSummary>(`/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    if (session.data?.icebreaker) setIcebreaker(session.data.icebreaker);
  }, [session.data?.icebreaker]);

  useEffect(() => {
    const until = session.data?.blurUntilMs ?? match ? Date.now() + 15_000 : Date.now();
    const tick = () => {
      setBlurred(Date.now() < until);
      setElapsed((e) => e + 1);
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [session.data?.blurUntilMs, match]);

  useEffect(() => {
    if (elapsed === 180) setToast('Enjoying this? Keep in touch or play a game.');
  }, [elapsed, setToast]);

  useEffect(() => {
    const socket = connectSocket();
    const onEnded = (payload: { reason: string; sessionId?: string }) => {
      if (payload.sessionId && payload.sessionId !== sessionId) return;
      navigate(`/after/${sessionId}`);
    };
    const onCut = (payload: { userMessage: string }) => {
      setCutMessage(payload.userMessage);
      setCutOpen(true);
    };
    const onIce = (payload: { text: string }) => setIcebreaker(payload.text);
    socket.on(ServerEvents.SESSION_ENDED, onEnded);
    socket.on(ServerEvents.SESSION_CUT, onCut);
    socket.on(ServerEvents.ICEBREAKER_NEW, onIce);
    return () => {
      socket.off(ServerEvents.SESSION_ENDED, onEnded);
      socket.off(ServerEvents.SESSION_CUT, onCut);
      socket.off(ServerEvents.ICEBREAKER_NEW, onIce);
    };
  }, [navigate, sessionId]);

  // Client-side frame moderation (mock): every 2s post a tiny buffer
  useEffect(() => {
    if (!sessionId) return;
    const id = setInterval(() => {
      const form = new FormData();
      form.append('file', new Blob([`frame-${Date.now()}`], { type: 'image/jpeg' }), 'frame.jpg');
      void apiForm<{ cut?: boolean; userMessage?: string }>(
        `/sessions/${sessionId}/moderation/frame`,
        form,
      )
        .then((res) => {
          if (res.cut) {
            setCutMessage(res.userMessage ?? 'Call ended by safety systems.');
            setCutOpen(true);
          }
        })
        .catch(() => undefined);
    }, 8000);
    return () => clearInterval(id);
  }, [sessionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') setMuted((v) => !v);
      if (e.key === 'v' || e.key === 'V') setCameraOff((v) => !v);
      if (e.key === 'n' || e.key === 'N') void next();
      if (e.key === 'Escape') void end();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const partner = session.data?.partner ?? match?.partner;
  const timer = useMemo(() => {
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    return `${m}:${s}`;
  }, [elapsed]);

  async function end() {
    const socket = connectSocket();
    socket.emit(ClientEvents.SESSION_END, { sessionId });
    await api(`/sessions/${sessionId}/end`, { method: 'POST', json: { reason: 'hangup' } });
    navigate(`/after/${sessionId}`);
  }

  async function next() {
    const socket = connectSocket();
    socket.emit(ClientEvents.SESSION_NEXT, { sessionId });
    await api(`/sessions/${sessionId}/end`, { method: 'POST', json: { reason: 'next' } });
    navigate('/lobby');
  }

  async function rotateIcebreaker() {
    const res = await api<{ text: string }>(`/sessions/${sessionId}/icebreaker/next`, {
      method: 'POST',
    });
    setIcebreaker(res.text);
  }

  return (
    <div
      className="app"
      style={{
        minHeight: '100vh',
        background: 'var(--ink)',
        color: 'var(--cream)',
        position: 'relative',
      }}
    >
      <VideoTile
        blurred={blurred}
        style={{ position: 'absolute', inset: 0, borderRadius: 0 }}
        overlays={null}
      />

      <VideoTile
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 160,
          height: 120,
          borderRadius: 16,
          border: '2px solid var(--white)',
          opacity: cameraOff ? 0.4 : 1,
        }}
      />

      <Card
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: 14,
          background: 'var(--overlay)',
          color: 'var(--ink)',
          minWidth: 220,
        }}
      >
        <div style={{ fontWeight: 700 }}>
          {partner?.displayName}
          {partner?.city ? ` · ${partner.city}` : ''}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <Tag variant="mint">18+</Tag>
          <Tag variant="deep">Trust: {partner?.trustTier}</Tag>
          <Tag>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{timer}</span>
          </Tag>
        </div>
        <div style={{ marginTop: 10 }}>
          <Tag variant="mint">
            <span className="live" /> AI safety on
          </Tag>
        </div>
        <Button
          size="sm"
          variant="ghost"
          style={{ marginTop: 10 }}
          onClick={() => setReportOpen(true)}
          aria-label="Report"
        >
          Flag
        </Button>
      </Card>

      <Card
        style={{
          position: 'absolute',
          left: 16,
          bottom: 110,
          padding: 14,
          background: 'var(--overlay)',
          color: 'var(--ink)',
          maxWidth: 360,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700 }}>ICEBREAKER</div>
        <div style={{ marginTop: 4 }}>{icebreaker}</div>
        <Button size="sm" variant="ghost" style={{ marginTop: 8 }} onClick={() => void rotateIcebreaker()}>
          Another
        </Button>
      </Card>

      <div
        style={{
          position: 'absolute',
          left: 16,
          bottom: 180,
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          maxWidth: '70%',
        }}
      >
        <Tag variant="deep">Would you rather</Tag>
        <Tag style={{ opacity: 0.5 }}>Co-draw (Soon)</Tag>
        <Tag style={{ opacity: 0.5 }}>Trivia (Soon)</Tag>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 28,
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 10,
          padding: 10,
          borderRadius: 999,
          background: 'var(--overlay)',
        }}
      >
        <Button size="icon" variant="ghost" aria-label="Mute" onClick={() => setMuted((v) => !v)}>
          {muted ? 'Mic' : 'Mic'}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Camera"
          onClick={() => setCameraOff((v) => !v)}
        >
          Cam
        </Button>
        <Button onClick={() => void next()}>Next</Button>
        <Button size="icon" variant="ghost" aria-label="Chat">
          Chat
        </Button>
        <Button variant="danger" onClick={() => void end()}>
          End
        </Button>
      </div>

      <ReportSheet
        open={reportOpen}
        name={partner?.displayName ?? 'partner'}
        sessionId={sessionId}
        onClose={() => setReportOpen(false)}
        onSubmitted={() => {
          setToast('Report submitted. A short clip is kept for 24 hours.');
          navigate(`/after/${sessionId}`);
        }}
      />

      <Modal
        open={cutOpen}
        title="Call ended by safety"
        onClose={() => navigate('/lobby')}
        footer={
          <Button onClick={() => navigate('/lobby')}>Back to lobby</Button>
        }
      >
        <p>{cutMessage || 'This call was ended by our safety systems.'}</p>
      </Modal>
    </div>
  );
}
