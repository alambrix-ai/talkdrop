export interface BarChartProps {
  values: number[];
  labels?: string[];
}

export function BarChart({ values, labels }: BarChartProps) {
  const max = Math.max(...values, 1);
  return (
    <div
      role="img"
      aria-label="Bar chart"
      style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}
    >
      {values.map((v, i) => {
        const isPeak = v === max;
        return (
          <div key={i} style={{ flex: 1, display: 'grid', gap: 6, justifyItems: 'center' }}>
            <div
              style={{
                width: '100%',
                height: `${(v / max) * 120}px`,
                borderRadius: 8,
                background: isPeak ? 'var(--charcoal)' : 'var(--slate)',
                opacity: isPeak ? 1 : 0.7,
              }}
              title={labels?.[i] ?? String(v)}
            />
            {labels?.[i] ? (
              <span className="mute" style={{ fontSize: 11 }}>
                {labels[i]}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
