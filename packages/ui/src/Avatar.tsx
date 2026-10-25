import type { HTMLAttributes } from 'react';

const SIZES = { 44: 44, 52: 52, 64: 64, 88: 88, 104: 104 } as const;

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: keyof typeof SIZES;
  tone?: 'white' | 'cream' | 'grey';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function Avatar({ name, size = 52, tone = 'cream', className = '', style, ...rest }: AvatarProps) {
  const bg =
    tone === 'white' ? 'var(--white)' : tone === 'grey' ? 'var(--grey)' : 'var(--cream)';
  return (
    <div
      className={['ava', className].filter(Boolean).join(' ')}
      style={{ width: SIZES[size], height: SIZES[size], fontSize: SIZES[size] * 0.32, background: bg, ...style }}
      aria-hidden={rest['aria-label'] ? undefined : true}
      {...rest}
    >
      {initials(name)}
    </div>
  );
}
