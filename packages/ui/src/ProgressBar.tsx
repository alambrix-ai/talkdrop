export interface ProgressBarProps {
  value: number;
  label?: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
