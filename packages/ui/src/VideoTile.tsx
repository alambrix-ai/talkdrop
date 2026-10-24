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
  const extraFilter = typeof style?.filter === 'string' ? style.filter : undefined;
  const filter = [blurred ? 'blur(18px)' : null, extraFilter && extraFilter !== 'none' ? extraFilter : null]
    .filter(Boolean)
    .join(' ') || undefined;
  const { filter: _f, ...restStyle } = style ?? {};
  void _f;
  return (
    <div
      className={['vid', placeholder && !children ? 'placeholder' : '', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...restStyle,
        filter,
        transition: 'filter 600ms ease-out',
      }}
    >
      {children}
      {overlays}
    </div>
  );
}
