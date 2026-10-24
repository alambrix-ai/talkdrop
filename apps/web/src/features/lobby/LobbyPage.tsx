import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClientEvents, ServerEvents, type MatchFound } from '@talkdrop/shared';
import { Button, Card, Orb, Tag } from '@talkdrop/ui';
import { LocalVideo } from '../../components/LocalVideo';
import { connectSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';

export default function LobbyPage() {
  const me = useAppStore((s) => s.me);
  const setMatch = useAppStore((s) => s.setMatch);
  const navigate = useNavigate();
  const [waiting, setWaiting] = useState(false);
  const [waitHint, setWaitHint] = useState<string | null>(null);

  useEffect(() => {
    const socket = connectSocket();
    const onFound = (payload: MatchFound) => {
      setMatch(payload);
      setWaiting(false);
      navigate('/match');
    };
    socket.on(ServerEvents.MATCH_FOUND, onFound);
    return () => {
      socket.off(ServerEvents.MATCH_FOUND, onFound);
    };
  }, [navigate, setMatch]);

  function startMeeting() {
    if (!me) return;
    setWaiting(true);
    const socket = connectSocket();
    socket.emit(
      ClientEvents.QUEUE_JOIN,
      {
        interests: me.interests.map((i) => i.slug),
        mood: me.profile.defaultMood ?? 'chill',
        languages: me.profile.languages,
        region: me.region ?? 'global',
      },
      (ack: { ok?: boolean; estimatedWaitMs?: number; error?: string }) => {
        if (!ack?.ok) {
          setWaiting(false);
          setWaitHint(ack?.error ?? 'Could not join queue');
          return;
        }
        setWaitHint(`Typical wait ~${Math.round((ack.estimatedWaitMs ?? 3000) / 1000)}s`);
      },
    );
  }

  const firstName = me?.displayName?.split(' ')[0] ?? 'friend';

  return (
    <main className="shell page" style={{ textAlign: 'center' }}>
      <div style={{ display: 'grid', placeItems: 'center', gap: 20, paddingTop: 24 }}>
        <Orb size={168} withPulses />
        <h1 className="h1" style={{ fontSize: 'clamp(34px, 4vw, 52px)' }}>
          Ready when you are, {firstName}.
        </h1>
        <p className="mute">
          {waiting
            ? waitHint ?? 'Looking for someone who shares your vibe…'
            : 'People online who match your interests are a few seconds away.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {me?.interests.slice(0, 6).map((i) => (
            <Tag key={i.slug} variant="rose">
              {i.label}
            </Tag>
          ))}
        </div>
        <Button
          style={{ minHeight: 58, minWidth: 220 }}
          loading={waiting}
          onClick={startMeeting}
        >
          Start meeting
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginTop: 48,
          textAlign: 'left',
        }}
        className="lobby-grid"
      >
        <Card style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 72, height: 96, borderRadius: 16, overflow: 'hidden', flex: 'none' }}>
            <LocalVideo muted cameraOff={false} />
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>Camera and mic ready</div>
            <div className="mute" style={{ fontSize: 14 }}>
              Blur first 15 s {me?.profile.blurFirst ? 'on' : 'off'}
            </div>
            <Link to="/onboarding" style={{ fontWeight: 600, fontSize: 14 }}>
              Edit
            </Link>
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Rooms tonight</div>
          {[
            { title: 'Speak Spanish night', time: '8:30 PM', n: 126 },
            { title: 'Startup pitch roulette', time: '9:00 PM', n: 84 },
          ].map((r) => (
            <div
              key={r.title}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 0',
                borderTop: '1px solid var(--line)',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                <div className="mute" style={{ fontSize: 13 }}>
                  {r.time} · {r.n} joined
                </div>
              </div>
              <Button size="sm" variant="ghost" disabled>
                Soon
              </Button>
            </div>
          ))}
        </Card>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .lobby-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
