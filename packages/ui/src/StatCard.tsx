import { Card } from './Card.js';

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <Card style={{ padding: 20 }}>
      <div className="mute" style={{ fontSize: 13, fontWeight: 600 }}>
        {label}
      </div>
      <div className="disp" style={{ fontSize: 32, marginTop: 8 }}>
        {value}
      </div>
      {hint ? (
        <div className="mute" style={{ fontSize: 13, marginTop: 6 }}>
          {hint}
        </div>
      ) : null}
    </Card>
  );
}
