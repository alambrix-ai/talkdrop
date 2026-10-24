import { useState } from 'react';
import { COUNTRIES, GENDERS, LANGUAGES, type Me } from '@talkdrop/shared';
import { Button, Chip, Tag } from '@talkdrop/ui';
import { api } from '../../lib/api';
import { useAppStore } from '../../lib/store';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export function MatchFiltersPanel({ me }: { me: Me }) {
  const setMe = useAppStore((s) => s.setMe);
  const setToast = useAppStore((s) => s.setToast);
  const [countries, setCountries] = useState<string[]>(me.matchFilters?.countries ?? []);
  const [genders, setGenders] = useState<string[]>(me.matchFilters?.genders ?? []);
  const [languages, setLanguages] = useState<string[]>(me.matchFilters?.languages ?? []);
  const [saving, setSaving] = useState(false);
  const isPlus = me.plan === 'plus';

  async function save() {
    if (!isPlus) {
      setToast('Talkdrop Plus required for match filters');
      return;
    }
    setSaving(true);
    try {
      await api('/me/filters', {
        method: 'PUT',
        json: { countries, genders, languages },
      });
      const next = await api<Me>('/me');
      setMe(next);
      setToast('Match filters saved');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not save filters');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
      <p className="mute" style={{ margin: 0 }}>
        Prefer who you meet by country, gender, and language. Leave empty for anyone.
        {isPlus ? null : ' Requires Talkdrop Plus.'}
      </p>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Preferred countries</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {COUNTRIES.map((c) => (
            <Chip
              key={c.code}
              selected={countries.includes(c.code)}
              disabled={!isPlus}
              onClick={() => setCountries((prev) => toggle(prev, c.code))}
            >
              {c.label}
            </Chip>
          ))}
        </div>
        {!countries.length ? <Tag style={{ marginTop: 8 }}>Any country</Tag> : null}
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Preferred genders</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {GENDERS.filter((g) => g.id !== 'prefer_not').map((g) => (
            <Chip
              key={g.id}
              selected={genders.includes(g.id)}
              disabled={!isPlus}
              onClick={() => setGenders((prev) => toggle(prev, g.id))}
            >
              {g.label}
            </Chip>
          ))}
        </div>
        {!genders.length ? <Tag style={{ marginTop: 8 }}>Any gender</Tag> : null}
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Preferred languages</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {LANGUAGES.map((l) => (
            <Chip
              key={l.code}
              selected={languages.includes(l.code)}
              disabled={!isPlus}
              onClick={() => setLanguages((prev) => toggle(prev, l.code))}
            >
              {l.label}
            </Chip>
          ))}
        </div>
        {!languages.length ? <Tag style={{ marginTop: 8 }}>Any language</Tag> : null}
      </div>

      <Button disabled={!isPlus} loading={saving} onClick={() => void save()}>
        {isPlus ? 'Save match filters' : 'Upgrade to unlock filters'}
      </Button>
    </div>
  );
}
