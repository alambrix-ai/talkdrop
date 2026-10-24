import type { ReactNode } from 'react';

export interface VideoTileProps {
  blurred?: boolean;
  placeholder?: boolean;
  children?: ReactNode;
  overlays?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function VideoTile({
  blurred = false,
  placeholder = true,
  children,
  overlays,
  className = '',
  style,
}: VideoTileProps) {
  return (
    <div
      className={['vid', placeholder && !children ? 'placeholder' : '', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...style,
        filter: blurred ? 'blur(18px)' : undefined,
        transition: 'filter 600ms ease-out',
      }}
    >
      {children}
      {overlays}
    </div>
  );
}
