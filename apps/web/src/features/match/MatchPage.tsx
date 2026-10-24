import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientEvents } from '@talkdrop/shared';
import { Button, Card, Tag, VideoTile } from '@talkdrop/ui';
import { connectSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';

export default function MatchPage() {
  const match = useAppStore((s) => s.match);
  const setMatch = useAppStore((s) => s.setMatch);
  const me = useAppStore((s) => s.me);
  const navigate = useNavigate();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!match) {
      navigate('/lobby');
      return;
    }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    const auto = setTimeout(() => join(), 5000);
    return () => {
      clearInterval(t);
      clearTimeout(auto);
    };
  }, [match]);

  if (!match) return null;

  function join() {
    if (!match) return;
    const socket = connectSocket();
    socket.emit(ClientEvents.MATCH_ACCEPT, { sessionId: match.sessionId });
    navigate(`/call/${match.sessionId}`);
  }

  function decline() {
    if (!match) return;
    const socket = connectSocket();
    socket.emit(ClientEvents.MATCH_DECLINE, { sessionId: match.sessionId });
    setMatch(null);
    navigate('/lobby');
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <main className="shell page">
      <Tag variant="mint">
        Match found · {mm}:{ss}
      </Tag>
      <h1 className="h2" style={{ marginTop: 12 }}>
        Found someone who likes {match.sharedInterests.slice(0, 2).join(' and ') || 'your vibe'}.
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 0.8fr',
          gap: 20,
          marginTop: 24,
        }}
        className="match-grid"
      >
        <div style={{ position: 'relative' }}>
          <VideoTile
            blurred
            style={{ width: '100%', aspectRatio: '16/11', minHeight: 280 }}
            overlays={
              <div style={{ position: 'absolute', left: 16, bottom: 16, display: 'flex', gap: 8 }}>
                <Tag variant="mint">
                  {match.partner.displayName}
                  {match.partner.city ? ` · ${match.partner.city}` : ''}
                </Tag>
                <Tag>Blur first 15 s</Tag>
              </div>
            }
          />
          <VideoTile
            style={{
              position: 'absolute',
              right: 16,
              bottom: 16,
              width: 120,
              height: 160,
              borderRadius: 16,
              border: '2px solid var(--white)',
            }}
            overlays={<Tag style={{ position: 'absolute', left: 8, bottom: 8 }}>You</Tag>}
          />
        </div>

        <Card style={{ padding: 22 }}>
          <div className="mute" style={{ fontSize: 13, fontWeight: 700 }}>
            YOU BOTH LIKE
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {match.sharedInterests.map((i) => (
              <Tag key={i} variant="rose">
                {i}
              </Tag>
            ))}
          </div>
          <p style={{ marginTop: 18, fontWeight: 700 }}>ICEBREAKER</p>
          <p style={{ marginTop: 6 }}>{match.icebreaker}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {match.partner.verified ? <Tag variant="mint">Verified 18+</Tag> : null}
            <Tag variant="deep">Trust: {match.partner.trustTier}</Tag>
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 24 }}>
            <Button onClick={join}>Join the call</Button>
            <Button variant="ghost" onClick={decline}>
              Find someone else
            </Button>
          </div>
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
        <Tag>Anywhere</Tag>
        <Tag>{me?.profile.languages.join('/').toUpperCase()}</Tag>
        <Tag>{me?.profile.defaultMood}</Tag>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .match-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
