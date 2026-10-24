import { Link, useParams } from 'react-router-dom';
import { Card, Logo } from '@talkdrop/ui';

const COPY: Record<string, { title: string; body: string[] }> = {
  'community-rules': {
    title: 'Community rules',
    body: [
      'Talkdrop is for adults 18+ only. Be respectful; no harassment, hate, or sexual content.',
      'Do not share illegal content. Report anything that feels unsafe — reports end the call for both people.',
      'Final legal text needs counsel review per launch market.',
    ],
  },
  privacy: {
    title: 'Privacy centre',
    body: [
      'We do not store raw video or audio by default. Evidence clips for reports are encrypted and expire in 24 hours.',
      'Age checks run on-device when possible; only the result is stored.',
      'You can request data export or deletion via account settings (GDPR/DPDP path).',
    ],
  },
  transparency: {
    title: 'Transparency report',
    body: [
      'We publish reports-per-1,000-calls and moderation metrics for enterprise tenants in the admin Overview.',
      'MVP shows seeded KPIs; production reports will ship with Phase 6 observability.',
    ],
  },
  'age-notice': {
    title: '18+ notice',
    body: [
      'Talkdrop is only for people aged 18 or older. Age verification is required before matching.',
      'Accounts that fail verification cannot enter the pool.',
    ],
  },
  terms: {
    title: 'Terms of use',
    body: [
      'By using Talkdrop you agree to community rules and to keep your account secure.',
      'Service is provided as-is during MVP. Production terms require legal review.',
    ],
  },
};

export default function LegalPage() {
  const { slug = 'community-rules' } = useParams();
  const page = COPY[slug] ?? COPY['community-rules']!;

  return (
    <div className="app">
      <header className="shell" style={{ paddingTop: 24 }}>
        <Link to="/">
          <Logo height={28} />
        </Link>
      </header>
      <main className="shell page" style={{ maxWidth: 720 }}>
        <Card style={{ padding: 28 }}>
          <h1 className="h2">{page.title}</h1>
          {page.body.map((p) => (
            <p key={p} className="mute" style={{ marginTop: 14, lineHeight: 1.6 }}>
              {p}
            </p>
          ))}
          <Link to="/" style={{ display: 'inline-block', marginTop: 20, fontWeight: 700 }}>
            Back home
          </Link>
        </Card>
      </main>
    </div>
  );
}
