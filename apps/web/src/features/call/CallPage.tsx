import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ClientEvents,
  ServerEvents,
  type EffectId,
  type SessionSummary,
} from '@talkdrop/shared';
import { Button, Card, Modal, Tag, VideoTile } from '@talkdrop/ui';
import { api, apiForm } from '../../lib/api';
import { connectSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';
import { LocalVideo } from '../../components/LocalVideo';
import { ReportSheet } from '../report/ReportSheet';

export default function CallPage() {
  const { sessionId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const match = useAppStore((s) => s.match);
  const me = useAppStore((s) => s.me);
  const setToast = useAppStore((s) => s.setToast);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blurred, setBlurred] = useState(true);
  const [icebreaker, setIcebreaker] = useState(match?.icebreaker ?? '');
  const [reportOpen, setReportOpen] = useState(params.get('report') === '1');
  const [cutOpen, setCutOpen] = useState(false);
  const [cutMessage, setCutMessage] = useState('');
  const [caption, setCaption] = useState<string | null>(null);
  const [activity, setActivity] = useState<{
    prompt: string;
    options: [string, string];
    activity: string;
  } | null>(null);
  const [avatarOnly, setAvatarOnly] = useState(me?.profile.avatarFirst ?? false);
  const [effect, setEffect] = useState<EffectId>('none');
  const [reconnecting, setReconnecting] = useState(false);

  const effectFilter =
    effect === 'warm'
      ? 'sepia(0.35) saturate(1.2)'
      : effect === 'mono'
        ? 'grayscale(1) contrast(1.05)'
        : effect === 'soft'
          ? 'blur(0.6px) brightness(1.05)'
          : 'none';

  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api<SessionSummary>(`/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    if (session.data?.icebreaker) setIcebreaker(session.data.icebreaker);
  }, [session.data?.icebreaker]);

  useEffect(() => {
    const until = session.data?.blurUntilMs ?? (match ? Date.now() + 15_000 : Date.now());
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
    const onCaption = (payload: { text: string; translatedTo?: string | null }) => {
      setCaption(
        payload.translatedTo ? `${payload.text} (translated)` : payload.text,
      );
    };
    const onActivity = (payload: {
      prompt: string;
      options: [string, string];
      activity: string;
    }) => setActivity(payload);
    const onAvatar = (payload: { avatarOnly: boolean; userId: string }) => {
      if (payload.userId !== me?.id) setAvatarOnly(payload.avatarOnly);
    };
    const onEffect = (payload: { effect: EffectId; userId: string }) => {
      if (payload.userId !== me?.id) setEffect(payload.effect);
    };
    socket.on(ServerEvents.SESSION_ENDED, onEnded);
    socket.on(ServerEvents.SESSION_CUT, onCut);
    socket.on(ServerEvents.ICEBREAKER_NEW, onIce);
    socket.on(ServerEvents.CAPTION_LINE, onCaption);
    socket.on(ServerEvents.ACTIVITY_START, onActivity);
    socket.on(ServerEvents.AVATAR_MODE, onAvatar);
    socket.on(ServerEvents.EFFECT_SET, onEffect);
    socket.on('disconnect', () => setReconnecting(true));
    socket.on('connect', () => setReconnecting(false));
    return () => {
      socket.off(ServerEvents.SESSION_ENDED, onEnded);
      socket.off(ServerEvents.SESSION_CUT, onCut);
      socket.off(ServerEvents.ICEBREAKER_NEW, onIce);
      socket.off(ServerEvents.CAPTION_LINE, onCaption);
      socket.off(ServerEvents.ACTIVITY_START, onActivity);
      socket.off(ServerEvents.AVATAR_MODE, onAvatar);
      socket.off(ServerEvents.EFFECT_SET, onEffect);
    };
  }, [navigate, sessionId, me?.id]);

  useEffect(() => {
    if (!sessionId || !me?.profile.captions) return;
    const id = setInterval(() => {
      void api<{ text: string }>(`/sessions/${sessionId}/captions/next?tick=${Date.now()}`).then(
        (r) => setCaption(r.text),
      );
    }, 8000);
    return () => clearInterval(id);
  }, [sessionId, me?.profile.captions]);

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

  function startActivity(kind: 'would-you-rather' | 'trivia' | 'co-draw' | 'co-watch') {
    const socket = connectSocket();
    socket.emit(ClientEvents.ACTIVITY_START, { sessionId, activity: kind });
  }

  function applyEffect(next: EffectId) {
    setEffect(next);
    connectSocket().emit(ClientEvents.EFFECT_SET, { sessionId, effect: next });
  }

  function choose(choice: 'a' | 'b') {
    connectSocket().emit(ClientEvents.ACTIVITY_UPDATE, { sessionId, choice });
    setToast(
      (choice === 'a' ? activity?.options[0] : activity?.options[1]) ?? 'Choice sent',
    );
  }

  function toggleAvatar() {
    const next = !avatarOnly;
    setAvatarOnly(next);
    setCameraOff(next);
    connectSocket().emit(ClientEvents.AVATAR_CONSENT, { sessionId, consent: !next });
  }

  return (
    <div
      className="app"
      role="main"
      aria-label="Live call"
      style={{
        minHeight: '100vh',
        background: 'var(--ink)',
        color: 'var(--cream)',
        position: 'relative',
      }}
    >
      {reconnecting ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--alert)',
            color: '#fff',
            textAlign: 'center',
            padding: 8,
            fontWeight: 700,
          }}
        >
          Reconnecting…
        </div>
      ) : null}

      <VideoTile
        blurred={blurred}
        placeholder={!partner || avatarOnly}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 0,
          filter: effectFilter,
          transition: 'filter 280ms ease',
        }}
        overlays={
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--cream)',
              fontFamily: 'var(--font-display)',
              fontSize: 48,
              opacity: 0.85,
            }}
          >
            {avatarOnly ? 'Avatar mode' : partner?.displayName?.slice(0, 1) ?? '?'}
          </div>
        }
      />

      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 160,
          height: 120,
          borderRadius: 16,
          border: '2px solid var(--white)',
          overflow: 'hidden',
          opacity: cameraOff ? 0.4 : 1,
          zIndex: 3,
        }}
      >
        {avatarOnly ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              background: 'var(--slate)',
              fontWeight: 800,
            }}
          >
            You
          </div>
        ) : (
          <LocalVideo muted={muted} cameraOff={cameraOff} />
        )}
      </div>

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
            <span className="live" aria-hidden /> AI safety on
          </Tag>
        </div>
        <Button
          size="sm"
          variant="ghost"
          style={{ marginTop: 10 }}
          onClick={() => setReportOpen(true)}
          aria-label={`Report ${partner?.displayName ?? 'partner'}`}
        >
          Flag
        </Button>
      </Card>

      {caption ? (
        <Card
          role="log"
          aria-live="polite"
          aria-label="Live captions"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 200,
            transform: 'translateX(-50%)',
            padding: 12,
            background: 'var(--overlay)',
            color: 'var(--ink)',
            maxWidth: 480,
            width: '90%',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700 }}>Captions</div>
          <div>{caption}</div>
        </Card>
      ) : null}

      {activity ? (
        <Card
          style={{
            position: 'absolute',
            right: 16,
            top: 160,
            padding: 16,
            background: 'var(--overlay)',
            color: 'var(--ink)',
            width: 260,
            zIndex: 4,
          }}
        >
          <div style={{ fontWeight: 700 }}>{activity.prompt}</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            <Button size="sm" onClick={() => choose('a')}>
              {activity.options[0]}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => choose('b')}>
              {activity.options[1]}
            </Button>
          </div>
        </Card>
      ) : null}

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
        role="toolbar"
        aria-label="Activities"
      >
        <Button size="sm" variant="ghost" onClick={() => startActivity('would-you-rather')}>
          Would you rather
        </Button>
        <Button size="sm" variant="ghost" onClick={() => startActivity('trivia')}>
          Trivia duel
        </Button>
        <Button size="sm" variant="ghost" onClick={() => startActivity('co-draw')}>
          Co-draw
        </Button>
        <Button size="sm" variant="ghost" onClick={() => startActivity('co-watch')}>
          Co-watch
        </Button>
      </div>

      <div
        role="toolbar"
        aria-label="Video effects"
        style={{
          position: 'absolute',
          right: 16,
          bottom: 110,
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          maxWidth: 220,
          justifyContent: 'flex-end',
        }}
      >
        {(['none', 'warm', 'mono', 'soft'] as EffectId[]).map((id) => (
          <Button
            key={id}
            size="sm"
            variant={effect === id ? undefined : 'ghost'}
            aria-pressed={effect === id}
            onClick={() => applyEffect(id)}
          >
            {id === 'none' ? 'FX off' : id}
          </Button>
        ))}
      </div>

      <div
        role="toolbar"
        aria-label="Call controls"
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
        <Button
          size="icon"
          variant="ghost"
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={muted}
          onClick={() => setMuted((v) => !v)}
        >
          Mic
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
          aria-pressed={cameraOff}
          onClick={() => setCameraOff((v) => !v)}
        >
          Cam
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={avatarOnly ? 'Show camera' : 'Avatar mode'}
          aria-pressed={avatarOnly}
          onClick={toggleAvatar}
        >
          Av
        </Button>
        <Button onClick={() => void next()} aria-label="Next person">
          Next
        </Button>
        <Button size="icon" variant="ghost" aria-label="Open chat">
          Chat
        </Button>
        <Button variant="danger" onClick={() => void end()} aria-label="End call">
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
        footer={<Button onClick={() => navigate('/lobby')}>Back to lobby</Button>}
      >
        <p>{cutMessage || 'This call was ended by our safety systems.'}</p>
      </Modal>
    </div>
  );
}
