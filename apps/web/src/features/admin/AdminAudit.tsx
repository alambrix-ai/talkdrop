import { useQuery } from '@tanstack/react-query';
import { Card, DataTable } from '@talkdrop/ui';
import { api } from '../../lib/api';

interface AuditRow {
  id: number;
  action: string;
  actor: string;
  createdAt: string;
}

export default function AdminAudit() {
  const audit = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api<AuditRow[]>('/admin/audit'),
  });

  return (
    <div>
      <h1 className="h2">Audit log</h1>
      <p className="mute">Append-only. Actions cannot be edited from the app.</p>
      <Card style={{ padding: 12, marginTop: 16 }}>
        <DataTable
          rows={audit.data ?? []}
          rowKey={(r) => String(r.id)}
          columns={[
            { key: 'action', header: 'Action', render: (r) => r.action },
            { key: 'actor', header: 'Actor', render: (r) => r.actor },
            {
              key: 'time',
              header: 'Timestamp',
              render: (r) => new Date(r.createdAt).toLocaleString(),
            },
          ]}
        />
      </Card>
    </div>
  );
}
