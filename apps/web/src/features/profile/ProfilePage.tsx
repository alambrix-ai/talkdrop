import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COUNTRIES, GENDERS } from '@talkdrop/shared';
import { Avatar, Button, Card, Switch, Tag } from '@talkdrop/ui';
import { api, setAccessToken } from '../../lib/api';
import { disconnectSocket } from '../../lib/socket';
import { useAppStore } from '../../lib/store';
import { MatchFiltersPanel } from './MatchFiltersPanel';

export default function ProfilePage() {
  const me = useAppStore((s) => s.me);
  const setMe = useAppStore((s) => s.setMe);
  const setToast = useAppStore((s) => s.setToast);
  const navigate = useNavigate();
  const [blurFirst, setBlurFirst] = useState(me?.profile.blurFirst ?? true);
  const [avatarFirst, setAvatarFirst] = useState(me?.profile.avatarFirst ?? false);
  const [captions, setCaptions] = useState(me?.profile.captions ?? true);
  const [section, setSection] = useState('profile');

  async function saveToggles(next: {
    blurFirst?: boolean;
    avatarFirst?: boolean;
    captions?: boolean;
  }) {
    const updated = await api('/me', { method: 'PATCH', json: next });
    setMe(updated as never);
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    setAccessToken(null);
    disconnectSocket();
    setMe(null);
    navigate('/');
  }

  if (!me) return null;

  return (
    <main
      className="shell page"
      style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}
    >
      <nav style={{ display: 'grid', gap: 6, alignContent: 'start' }} className="profile-nav">
        {(
          [
            ['profile', 'Profile'],
            ['privacy', 'Privacy and safety'],
            ['verification', 'Verification'],
            ['notifications', 'Notifications'],
            ['plus', 'Talkdrop Plus'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={['navlink', section === id ? 'on' : ''].filter(Boolean).join(' ')}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </nav>

      <div style={{ display: 'grid', gap: 16 }}>
        <Card style={{ padding: 24, display: 'flex', gap: 18, alignItems: 'center' }}>
          <Avatar name={me.displayName} size={104} />
          <div>
            <h1 className="h2">{me.displayName}</h1>
            <p className="mute" style={{ margin: '6px 0 0' }}>
              {me.profile.city ?? 'Somewhere'}
              {me.country ? ` · ${COUNTRIES.find((c) => c.code === me.country)?.label ?? me.country}` : ''}
              {' · '}
              {me.profile.languages.join(', ')}
              {me.profile.gender
                ? ` · ${GENDERS.find((g) => g.id === me.profile.gender)?.label ?? me.profile.gender}`
                : ''}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {me.ageVerified ? <Tag variant="mint">Verified 18+</Tag> : null}
              <Tag variant="deep">Trust: {me.trustTier}</Tag>
              <Tag>{me.streakDays}-day streak</Tag>
            </div>
            <Button
              size="sm"
              variant="ghost"
              style={{ marginTop: 12 }}
              onClick={() => navigate('/onboarding')}
            >
              Edit profile
            </Button>
          </div>
        </Card>

        <Card style={{ padding: 24 }}>
          <h2 className="h3">Interests</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {me.interests.map((i) => (
              <Tag key={i.slug} variant="rose">
                {i.label}
              </Tag>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 24 }}>
          <h2 className="h3">Privacy and safety</h2>
          <p className="mute" style={{ marginTop: 8, fontSize: 14 }}>
            Defaults lean private. Hang out freely — keep control.
          </p>
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <Switch
              label="Blur my first 15 seconds"
              checked={blurFirst}
              onChange={(v) => {
                setBlurFirst(v);
                void saveToggles({ blurFirst: v });
              }}
            />
            <Switch
              label="Avatar first (camera by consent)"
              checked={avatarFirst}
              onChange={(v) => {
                setAvatarFirst(v);
                void saveToggles({ avatarFirst: v });
              }}
            />
            <Switch
              label="Live captions"
              checked={captions}
              onChange={(v) => {
                setCaptions(v);
                void saveToggles({ captions: v });
              }}
            />
            <Switch label="Translate to English (Plus)" checked={false} onChange={() => undefined} disabled />
            <div className="mute">Blocked people — manage from Friends</div>
            <Tag variant="mint">Report and block stay one tap away on every call</Tag>
          </div>
        </Card>

        <Card tone="cream" style={{ padding: 24 }}>
          <h2 className="h3">Talkdrop Plus</h2>
          <p className="mute" style={{ marginTop: 8 }}>
            399 INR / month · country, gender & language match filters, live translation, priority
            matching. Current plan: <strong>{me.plan}</strong>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            <Button
              onClick={() =>
                void api<{ message?: string }>('/billing/checkout', {
                  method: 'POST',
                  json: { provider: 'mock' },
                }).then(async (r) => {
                  setToast(r.message ?? 'Plus activated');
                  const next = await api('/me');
                  setMe(next as never);
                })
              }
            >
              {me.plan === 'plus' ? 'Renew (mock)' : 'Upgrade (mock)'}
            </Button>
          </div>
          <MatchFiltersPanel me={me} />
        </Card>

        <Card style={{ padding: 24 }}>
          <h2 className="h3">Your data</h2>
          <p className="mute" style={{ marginTop: 8 }}>
            Export or delete personal data (GDPR/DPDP).
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void api('/me/data').then((data) => {
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'talkdrop-data-export.json';
                  a.click();
                })
              }
            >
              Export my data
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (confirm('Delete your Talkdrop account data?')) {
                  void api('/me/data', { method: 'DELETE' }).then(() => void signOut());
                }
              }}
            >
              Delete my data
            </Button>
          </div>
        </Card>
      </div>
      <style>{`
        @media (max-width: 768px) {
          main.shell.page { grid-template-columns: 1fr !important; }
          .profile-nav { grid-auto-flow: column; overflow-x: auto; }
        }
      `}</style>
    </main>
  );
}
