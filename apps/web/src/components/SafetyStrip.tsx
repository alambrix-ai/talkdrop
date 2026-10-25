import { Tag } from '@talkdrop/ui';

const DEFAULT_TIPS = [
  '18+ verified before matching',
  'Blur-first + report/block one tap away',
  'No call recordings kept by default',
];

export function SafetyStrip({
  tips = DEFAULT_TIPS,
  compact = false,
}: {
  tips?: string[];
  compact?: boolean;
}) {
  return (
    <aside className="safety-strip" aria-label="Safety and privacy">
      <Tag variant="mint">
        <span className="live" aria-hidden /> Safety on
      </Tag>
      {compact ? (
        <span style={{ fontSize: 14 }}>{tips[0]}</span>
      ) : (
        <ul
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px 16px',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            fontSize: 14,
          }}
        >
          {tips.map((tip) => (
            <li key={tip} className="mute">
              {tip}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
