import { useQuery } from '@tanstack/react-query';
import { BarChart, Button, Card, StatCard, Tag } from '@talkdrop/ui';
import { api } from '../../lib/api';

export default function AdminOverview() {
  const overview = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () =>
      api<{
        tenant: { name: string; policy: Record<string, unknown> };
        kpis: {
          activeNow: number;
          callsToday: number;
          averageCallLengthSec: number;
          reportsPer1000: number;
        };
        callsPerHour: Array<{ hour: number; count: number }>;
        status: string;
      }>('/admin/overview'),
  });

  if (overview.isError) {
    return (
      <Card style={{ padding: 24 }}>
        <h1 className="h2">Admin access required</h1>
        <p className="mute">Sign in as a tenant admin (seed user Arjun or Priya).</p>
      </Card>
    );
  }

  const data = overview.data;
  const avg = data?.kpis.averageCallLengthSec ?? 0;
  const avgLabel = `${Math.floor(avg / 60)}:${String(avg % 60).padStart(2, '0')}`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="h2">{data?.tenant.name ?? 'Admin'}</h1>
          <Tag variant="mint" style={{ marginTop: 8 }}>
            {data?.status ?? '…'}
          </Tag>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            void import('../../lib/api').then(({ getAccessToken }) => {
              const token = getAccessToken();
              void fetch(
                `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'}/admin/export.csv`,
                {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                  credentials: 'include',
                },
              )
                .then((r) => r.blob())
                .then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'talkdrop-admin-export.csv';
                  a.click();
                });
            });
          }}
        >
          Export report
        </Button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginTop: 24,
        }}
        className="kpi-grid"
      >
        <StatCard label="Active now" value={String(data?.kpis.activeNow ?? '—')} />
        <StatCard label="Calls today" value={(data?.kpis.callsToday ?? 0).toLocaleString()} />
        <StatCard label="Average call length" value={avgLabel} />
        <StatCard
          label="Reports / 1,000 calls"
          value={String(data?.kpis.reportsPer1000 ?? '—')}
        />
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: 16, marginTop: 20 }}
        className="admin-grid"
      >
        <Card style={{ padding: 20 }}>
          <h2 className="h3">Calls per hour today</h2>
          <div style={{ marginTop: 16 }}>
            <BarChart
              values={(data?.callsPerHour ?? []).map((c) => c.count)}
              labels={(data?.callsPerHour ?? []).map((c) => String(c.hour))}
            />
          </div>
        </Card>
        <Card style={{ padding: 20 }}>
          <h2 className="h3">Active policy</h2>
          <ul className="mute" style={{ marginTop: 12, lineHeight: 1.7 }}>
            <li>
              Age band {String(data?.tenant.policy.ageBandMin ?? 18)} to{' '}
              {String(data?.tenant.policy.ageBandMax ?? 25)}
            </li>
            <li>Moderation {String(data?.tenant.policy.moderation ?? 'strict')}</li>
            <li>Camera blur first {data?.tenant.policy.blurFirstDefault ? 'on' : 'off'}</li>
            <li>SAML {data?.tenant.policy.samlEnabled ? 'on' : 'off'}</li>
          </ul>
          <Button size="sm" variant="ghost" style={{ marginTop: 12 }}>
            Edit policy
          </Button>
        </Card>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .kpi-grid, .admin-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
