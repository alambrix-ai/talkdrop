import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  COUNTRIES,
  GENDERS,
  INTERESTS,
  LANGUAGES,
  MOODS,
  MAX_INTERESTS,
  MIN_INTERESTS,
  type Gender,
} from '@talkdrop/shared';
import { Button, Card, Chip, Switch, Tag } from '@talkdrop/ui';
import { api } from '../../lib/api';
import { useAppStore } from '../../lib/store';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const setMe = useAppStore((s) => s.setMe);
  const me = useAppStore((s) => s.me);
  const [selected, setSelected] = useState<string[]>(
    me?.interests.map((i) => i.slug) ?? ['jazz', 'night-walks', 'street-food', 'film', 'startups', 'football'],
  );
  const [mood, setMood] = useState(me?.profile.defaultMood ?? 'curious');
  const [languages, setLanguages] = useState<string[]>(me?.profile.languages ?? ['en', 'hi']);
  const [gender, setGender] = useState<Gender | ''>(me?.profile.gender ?? '');
  const [country, setCountry] = useState(me?.country ?? 'IN');
  const [blurFirst, setBlurFirst] = useState(me?.profile.blurFirst ?? true);
  const [avatarFirst, setAvatarFirst] = useState(me?.profile.avatarFirst ?? false);
  const [captions, setCaptions] = useState(me?.profile.captions ?? true);
  const [saving, setSaving] = useState(false);

  const estimate = useQuery({
    queryKey: ['estimate', selected, mood, languages],
    queryFn: () =>
      api<{ onlineMatching: number; estimatedWaitMs: number }>('/matching/estimate'),
  });

  const canContinue = useMemo(
    () =>
      selected.length >= MIN_INTERESTS &&
      selected.length <= MAX_INTERESTS &&
      languages.length >= 1 &&
      Boolean(mood) &&
      Boolean(gender) &&
      Boolean(country),
    [selected, languages, mood, gender, country],
  );

  function toggleInterest(slug: string) {
    setSelected((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_INTERESTS) return prev;
      return [...prev, slug];
    });
  }

  async function submit() {
    setSaving(true);
    try {
      await api('/me', {
        method: 'PATCH',
        json: {
          defaultMood: mood,
          languages,
          gender: gender || undefined,
          country,
          region: 'global',
          blurFirst,
          avatarFirst,
          captions,
        },
      });
      await api('/me/interests', {
        method: 'PUT',
        json: { interestSlugs: selected },
      });
      const next = await api('/me');
      setMe(next as never);
      navigate('/lobby');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      className="shell page"
      style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: 28 }}
    >
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Tag>Step 1 · Verify</Tag>
          <Tag variant="mint">Step 2 of 3 · Interests</Tag>
          <Tag>3 · Meet</Tag>
        </div>
        <h1 className="h1" style={{ fontSize: 'clamp(34px, 4vw, 52px)' }}>
          What are you into?
        </h1>
        <p className="mute" style={{ marginTop: 8 }}>
          {selected.length} selected · pick {MIN_INTERESTS}–{MAX_INTERESTS}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
          {INTERESTS.map((i) => (
            <Chip
              key={i.slug}
              selected={selected.includes(i.slug)}
              onClick={() => toggleInterest(i.slug)}
            >
              {i.label}
            </Chip>
          ))}
        </div>

        <h2 className="h3" style={{ marginTop: 36 }}>
          Mood
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            marginTop: 12,
          }}
        >
          {MOODS.map((m) => (
            <Card
              key={m.id}
              tone={mood === m.id ? 'cream' : 'white'}
              style={{
                padding: 16,
                cursor: 'pointer',
                borderColor: mood === m.id ? 'var(--charcoal)' : undefined,
              }}
              onClick={() => setMood(m.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setMood(m.id)}
            >
              <strong>{m.label}</strong>
              <div className="mute" style={{ fontSize: 14, marginTop: 4 }}>
                {m.description}
              </div>
            </Card>
          ))}
        </div>

        <h2 className="h3" style={{ marginTop: 36 }}>
          Languages
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {LANGUAGES.slice(0, 5).map((l) => (
            <Chip
              key={l.code}
              selected={languages.includes(l.code)}
              onClick={() =>
                setLanguages((prev) =>
                  prev.includes(l.code)
                    ? prev.filter((x) => x !== l.code)
                    : [...prev, l.code],
                )
              }
            >
              {l.label}
            </Chip>
          ))}
        </div>

        <h2 className="h3" style={{ marginTop: 36 }}>
          Gender
        </h2>
        <p className="mute" style={{ marginTop: 4, fontSize: 14 }}>
          Shown only for matching preferences — keep it honest.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {GENDERS.map((g) => (
            <Chip key={g.id} selected={gender === g.id} onClick={() => setGender(g.id)}>
              {g.label}
            </Chip>
          ))}
        </div>

        <h2 className="h3" style={{ marginTop: 36 }}>
          Country
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {COUNTRIES.map((c) => (
            <Chip
              key={c.code}
              selected={country === c.code}
              onClick={() => setCountry(c.code)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      <Card style={{ padding: 24, alignSelf: 'start', position: 'sticky', top: 24 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          {(estimate.data?.onlineMatching ?? 2184).toLocaleString()} people online match your vibe
          right now. Typical wait about{' '}
          {Math.round((estimate.data?.estimatedWaitMs ?? 3000) / 1000)} seconds.
        </p>
        <div style={{ display: 'grid', gap: 14, marginTop: 20 }}>
          <Switch
            label="Blur my first 15 seconds"
            checked={blurFirst}
            onChange={setBlurFirst}
            disabled={me?.trustTier === 'new'}
          />
          <Switch label="Avatar first, camera by consent" checked={avatarFirst} onChange={setAvatarFirst} />
          <Switch label="Live captions" checked={captions} onChange={setCaptions} />
        </div>
        <Button
          style={{ width: '100%', marginTop: 24 }}
          disabled={!canContinue}
          loading={saving}
          onClick={() => void submit()}
        >
          Enter the lobby
        </Button>
      </Card>
      <style>{`
        @media (max-width: 768px) {
          main.shell.page { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
