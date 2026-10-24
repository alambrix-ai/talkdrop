import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, DataTable, Modal, Tag } from '@talkdrop/ui';
import { api } from '../../lib/api';

interface ReportRow {
  id: number;
  category: string;
  severity: string;
  status: string;
  waitingMinutes: number;
  reporter: string;
  reported: string;
}

export default function AdminModeration() {
  const qc = useQueryClient();
  const [active, setActive] = useState<number | null>(null);

  const reports = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => api<ReportRow[]>('/admin/reports'),
  });

  const detail = useQuery({
    queryKey: ['admin-report', active],
    enabled: active != null,
    queryFn: () => api<{ id: number; details?: string; evidence: unknown[] }>(`/admin/reports/${active}`),
  });

  async function decide(decision: 'dismiss' | 'warn' | 'suspend' | 'ban' | 'escalate') {
    if (active == null) return;
    await api(`/admin/reports/${active}/decision`, {
      method: 'POST',
      json: { decision },
    });
    setActive(null);
    void qc.invalidateQueries({ queryKey: ['admin-reports'] });
  }

  return (
    <div>
      <h1 className="h2">Moderation queue</h1>
      <Card style={{ padding: 12, marginTop: 16 }}>
        <DataTable
          rows={reports.data ?? []}
          rowKey={(r) => String(r.id)}
          columns={[
            { key: 'id', header: 'Case', render: (r) => `#${r.id}` },
            { key: 'category', header: 'Category', render: (r) => r.category },
            {
              key: 'severity',
              header: 'Severity',
              render: (r) => <Tag variant={r.severity === 'high' ? 'deep' : 'default'}>{r.severity}</Tag>,
            },
            { key: 'waiting', header: 'Waiting', render: (r) => `${r.waitingMinutes} min` },
            { key: 'status', header: 'Status', render: (r) => r.status },
            {
              key: 'actions',
              header: '',
              render: (r) => (
                <Button size="sm" variant="ghost" onClick={() => setActive(r.id)}>
                  Open
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={active != null}
        title={active != null ? `Case #${active}` : 'Case'}
        onClose={() => setActive(null)}
        footer={
          <>
            <Button size="sm" onClick={() => void decide('warn')}>
              Warn
            </Button>
            <Button size="sm" onClick={() => void decide('suspend')}>
              Suspend
            </Button>
            <Button size="sm" variant="danger" onClick={() => void decide('ban')}>
              Ban
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void decide('escalate')}>
              Escalate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void decide('dismiss')}>
              Dismiss
            </Button>
          </>
        }
      >
        <p className="mute">{detail.data?.details ?? 'Evidence preview is blurred by default.'}</p>
        <Card tone="grey" style={{ padding: 40, marginTop: 12, textAlign: 'center' }}>
          Blurred evidence preview
        </Card>
      </Modal>
    </div>
  );
}
