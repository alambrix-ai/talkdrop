import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ServerEvents } from '@talkdrop/shared';
import { Avatar, Button, Card, Input, Tag } from '@talkdrop/ui';
import { api } from '../../lib/api';
import { connectSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';

interface Conn {
  id: string;
  peer: {
    id?: string;
    displayName?: string;
    city?: string | null;
    languages?: string[];
    interests?: string[];
    trustTier?: string;
    verified?: boolean;
  };
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  unread: number;
}

interface Msg {
  id: number;
  senderId: string;
  body: string;
  createdAt: string;
}

export default function ConnectionsPage() {
  const { id } = useParams();
  const me = useAppStore((s) => s.me);
  const setToast = useAppStore((s) => s.setToast);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');

  const list = useQuery({
    queryKey: ['connections'],
    queryFn: () => api<Conn[]>('/connections'),
  });

  const selectedId = id ?? list.data?.[0]?.id;
  const selected = list.data?.find((c) => c.id === selectedId);

  const messages = useQuery({
    queryKey: ['messages', selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => api<Msg[]>(`/connections/${selectedId}/messages`),
  });

  useEffect(() => {
    const socket = connectSocket();
    const onMsg = (msg: Msg & { connectionId: string }) => {
      void qc.invalidateQueries({ queryKey: ['messages', msg.connectionId] });
      void qc.invalidateQueries({ queryKey: ['connections'] });
    };
    socket.on(ServerEvents.CHAT_MESSAGE, onMsg);
    return () => {
      socket.off(ServerEvents.CHAT_MESSAGE, onMsg);
    };
  }, [qc]);

  async function send() {
    if (!selectedId || !draft.trim()) return;
    await api(`/connections/${selectedId}/messages`, {
      method: 'POST',
      json: { body: draft.trim() },
    });
    setDraft('');
    void qc.invalidateQueries({ queryKey: ['messages', selectedId] });
    void qc.invalidateQueries({ queryKey: ['connections'] });
  }

  async function callPeer() {
    if (!selectedId) return;
    const res = await api<{ sessionId: string }>(`/connections/${selectedId}/call`, {
      method: 'POST',
    });
    navigate(`/call/${res.sessionId}?connectionId=${selectedId}`);
  }

  const filtered =
    list.data?.filter((c) =>
      (c.peer.displayName ?? '').toLowerCase().includes(search.toLowerCase()),
    ) ?? [];

  return (
    <main
      className="shell page"
      style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr 260px',
        gap: 16,
        minHeight: '70vh',
      }}
    >
      <Card style={{ padding: 12, overflow: 'auto' }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontFamily: 'var(--font-display)' }}>
          Friends you kept
        </div>
        <Input
          placeholder="Find a friend"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search connections"
        />
        <div style={{ marginTop: 12, display: 'grid', gap: 4 }}>
          {filtered.map((c) => (
            <Link
              key={c.id}
              to={`/connections/${c.id}`}
              style={{
                display: 'flex',
                gap: 10,
                padding: 10,
                borderRadius: 16,
                background: c.id === selectedId ? 'var(--cream)' : 'transparent',
              }}
            >
              <Avatar name={c.peer.displayName ?? '?'} size={44} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{c.peer.displayName}</strong>
                  {c.unread ? <Tag variant="mint">{c.unread}</Tag> : null}
                </div>
                <div
                  className="mute"
                  style={{
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.lastMessage?.body ?? 'Say hey — keep the hang going'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 0, display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
        {selected ? (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 16,
                borderBottom: '1px solid var(--line)',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Avatar name={selected.peer.displayName ?? '?'} size={44} />
                <strong>{selected.peer.displayName}</strong>
              </div>
              <Button size="sm" onClick={() => void callPeer()}>
                Hang out live
              </Button>
            </div>
            <div style={{ padding: 16, overflow: 'auto', display: 'grid', gap: 10 }}>
              {messages.isLoading ? (
                <p className="mute">Loading messages…</p>
              ) : messages.isError ? (
                <p className="mute">Could not load messages. Try refreshing.</p>
              ) : (messages.data ?? []).length === 0 ? (
                <p className="mute">Say hello</p>
              ) : (
                (messages.data ?? []).map((m) => {
                  const mine = m.senderId === me?.id;
                  return (
                    <div key={m.id} className={['chat-bubble', mine ? 'mine' : 'theirs'].join(' ')}>
                      {m.body}
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Say something kind…"
                aria-label="Message"
                onKeyDown={(e) => e.key === 'Enter' && void send()}
              />
              <Button onClick={() => void send()}>Send</Button>
            </div>
          </>
        ) : (
          <div className="mute" style={{ padding: 24 }}>
            Pick a friend to keep chatting — or jump back to the lobby for someone new.
          </div>
        )}
      </Card>

      <Card style={{ padding: 18 }} className="peer-card">
        {selected ? (
          <>
            <Avatar name={selected.peer.displayName ?? '?'} size={88} />
            <h2 className="h3" style={{ marginTop: 12 }}>
              {selected.peer.displayName}
            </h2>
            <p className="mute">{selected.peer.city}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {(selected.peer.languages ?? []).map((l) => (
                <Tag key={l}>{l}</Tag>
              ))}
            </div>
            <div style={{ marginTop: 16, fontWeight: 700 }}>You both like</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {(selected.peer.interests ?? []).slice(0, 6).map((i) => (
                <Tag key={i} variant="rose">
                  {i}
                </Tag>
              ))}
            </div>
            <p className="mute" style={{ fontSize: 13, marginTop: 16 }}>
              Safety stays with you — block anytime. Reports go to the moderation queue.
            </p>
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  selected.peer.id &&
                  void api('/blocks', { method: 'POST', json: { userId: selected.peer.id } }).then(
                    () => setToast('Blocked. They cannot reach you.'),
                  )
                }
              >
                Block
              </Button>
            </div>
          </>
        ) : null}
      </Card>

      <style>{`
        @media (max-width: 900px) {
          main.shell.page {
            grid-template-columns: 1fr !important;
          }
          .peer-card { display: none; }
        }
      `}</style>
    </main>
  );
}
