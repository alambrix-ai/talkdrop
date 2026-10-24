import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { COMPLIMENTS, type SessionSummary, type Vibe } from '@talkdrop/shared';
import { Avatar, Button, Card, Chip, ProgressBar, Tag } from '@talkdrop/ui';
import { api } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import { ClientEvents } from '@talkdrop/shared';
import { connectSocket } from '../../lib/socket';

export default function AfterPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const me = useAppStore((s) => s.me);
  const setToast = useAppStore((s) => s.setToast);
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [compliments, setCompliments] = useState<string[]>([]);
  const [partnerKept, setPartnerKept] = useState(false);

  const session = useQuery({
    queryKey: ['session-after', sessionId],
    queryFn: async () => {
      const s = await api<SessionSummary>(`/sessions/${sessionId}`);
      setPartnerKept(Boolean(s.partnerKept));
      return s;
    },
  });

  async function chooseVibe(next: Vibe) {
    setVibe(next);
    await api(`/sessions/${sessionId}/vibe`, {
      method: 'POST',
      json: { vibe: next, compliments },
    });
  }

  async function keep() {
    const socket = connectSocket();
    socket.emit(ClientEvents.SESSION_KEEP, { sessionId }, (ack: { mutual?: boolean }) => {
      if (ack?.mutual) setToast('You are now connected.');
    });
    const res = await api<{ mutual: boolean }>(`/sessions/${sessionId}/keep`, { method: 'POST' });
    if (res.mutual) {
      setToast('You are now connected.');
      navigate('/connections');
    } else {
      setToast('Kept. Waiting to see if they feel the same.');
    }
  }

  const partner = session.data?.partner;
  const duration = session.data?.durationSec ?? 0;
  const mm = String(Math.floor(duration / 60)).padStart(2, '0');
  const ss = String(duration % 60).padStart(2, '0');
  const nextTrust = Math.max(0, 700 - (me?.trustScore ?? 0));

  return (
    <main
      className="shell page"
      style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 24 }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={partner?.displayName ?? '?'} size={88} />
          <div>
            <Tag>Call ended · {mm}:{ss}</Tag>
            <h1 className="h2" style={{ marginTop: 8 }}>
              That was a good one.
            </h1>
            <p className="mute" style={{ margin: '6px 0 0' }}>
              {partner?.displayName}
              {partner?.city ? ` · ${partner.city}` : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {session.data?.sharedInterests.map((i) => (
            <Tag key={i} variant="rose">
              {i}
            </Tag>
          ))}
        </div>

        <h2 className="h3" style={{ marginTop: 32 }}>
          How was the vibe?
        </h2>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {(
            [
              ['great', 'Great'],
              ['okay', 'Okay'],
              ['not_for_me', 'Not for me'],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              variant={vibe === id ? 'primary' : 'ghost'}
              onClick={() => void chooseVibe(id)}
            >
              {label}
            </Button>
          ))}
        </div>

        <h2 className="h3" style={{ marginTop: 28 }}>
          Say something kind
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {COMPLIMENTS.map((c) => (
            <Chip
              key={c}
              selected={compliments.includes(c)}
              onClick={() =>
                setCompliments((prev) =>
                  prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                )
              }
            >
              {c}
            </Chip>
          ))}
        </div>

        {partnerKept ? (
          <Card tone="cream" style={{ padding: 16, marginTop: 24 }}>
            {partner?.displayName} also wants to keep in touch.
          </Card>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
          <Button onClick={() => void keep()}>Keep in touch</Button>
          <Button variant="ghost" onClick={() => navigate('/lobby')}>
            Next person
          </Button>
          <Link to="/lobby">
            <Button variant="ghost">Back to lobby</Button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <Card style={{ padding: 18 }}>
          <div className="mute" style={{ fontSize: 13 }}>
            Streak
          </div>
          <div className="disp" style={{ fontSize: 36 }}>
            {me?.streakDays ?? 0} days
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div className="mute" style={{ fontSize: 13 }}>
            Trust level
          </div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>{me?.trustTier}</div>
          <div style={{ marginTop: 10 }}>
            <ProgressBar value={Math.min(100, ((me?.trustScore ?? 0) / 700) * 100)} />
          </div>
          <div className="mute" style={{ fontSize: 13, marginTop: 8 }}>
            {nextTrust} points to Platinum
          </div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div className="mute" style={{ fontSize: 13 }}>
            Tonight so far
          </div>
          <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
            <div>Conversations 4</div>
            <div>Time chatting 31 min</div>
            <div>New connections 1</div>
          </div>
        </Card>
      </div>
      <style>{`
        @media (max-width: 768px) {
          main.shell.page { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
