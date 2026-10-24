import { Link, useParams } from 'react-router-dom';
import { Card, Logo } from '@talkdrop/ui';

const COPY: Record<string, { title: string; body: string[] }> = {
  'community-rules': {
    title: 'Community rules',
    body: [
      'Talkdrop is for adults 18+ only. Be kind. No harassment, hate speech, sexual content, scams, or threats.',
      'Do not share illegal content. If something feels unsafe, tap Report — that ends the call for both people and keeps a short encrypted clip for up to 24 hours.',
      'Repeated violations lead to warnings, temporary limits, suspension, or a permanent ban (account + device signals).',
      'Final legal text needs counsel review per launch market.',
    ],
  },
  privacy: {
    title: 'Privacy centre',
    body: [
      'We do not store raw video or audio by default. Evidence for reports is encrypted and expires in 24 hours unless a case is escalated.',
      'Age checks prefer on-device estimation; only the result and age band are stored — never your face image or date of birth.',
      'Phone numbers are protected with field-level encryption. IPs are stored as hashes for abuse prevention.',
      'You can export or delete your data from Profile → Your data (GDPR/DPDP).',
      'Enterprise tenants may process additional policy metadata under their agreement.',
    ],
  },
  transparency: {
    title: 'Transparency report',
    body: [
      'Talkdrop tracks reports per 1,000 calls, time-to-cut for violating streams, reviewer queue age, and appeal outcomes.',
      'Tenant admins see live KPIs and can export CSV from the admin Overview.',
      'Public launch reports will include methodology notes once Phase 6 observability is wired to production exporters.',
    ],
  },
  'age-notice': {
    title: '18+ notice',
    body: [
      'Talkdrop is only for people aged 18 or older. Age verification is required before matching.',
      'Accounts that fail verification cannot enter the matching pool. Suspected under-18 reports are escalated automatically.',
      'Parents/guardians: contact hello@talkdrop.app if you believe a minor has created an account.',
    ],
  },
  terms: {
    title: 'Terms of use',
    body: [
      'By using Talkdrop you agree to the community rules and to keep your account secure.',
      'The service is provided as-is during MVP. Features labelled Soon or v1 may change.',
      'Talkdrop Plus is billed via a payment provider; mock checkout is for development only.',
      'Production terms, arbitration, and regional addenda require legal review before public launch.',
    ],
  },
};

export default function LegalPage() {
  const { slug = 'community-rules' } = useParams();
  const page = COPY[slug] ?? COPY['community-rules']!;

  return (
    <div className="app">
      <header className="shell" style={{ paddingTop: 24 }}>
        <Link to="/" aria-label="Talkdrop home">
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
          <nav aria-label="Legal" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
            {Object.keys(COPY).map((key) => (
              <Link key={key} to={`/legal/${key}`} style={{ fontWeight: 600, fontSize: 14 }}>
                {COPY[key]!.title}
              </Link>
            ))}
          </nav>
          <Link to="/" style={{ display: 'inline-block', marginTop: 20, fontWeight: 700 }}>
            Back home
          </Link>
        </Card>
      </main>
    </div>
  );
}
