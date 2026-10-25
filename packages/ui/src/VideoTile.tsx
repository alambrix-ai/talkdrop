import type { ReactNode } from 'react';

export interface VideoTileProps {
  blurred?: boolean;
  placeholder?: boolean;
  /** Optional still image (Ink-wash portraits, avatars) shown under live media. */
  imageSrc?: string;
  imageAlt?: string;
  children?: ReactNode;
  overlays?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function VideoTile({
  blurred = false,
  placeholder = true,
  imageSrc,
  imageAlt = '',
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
  const showPlaceholder = placeholder && !children && !imageSrc;
  return (
    <div
      className={['vid', showPlaceholder ? 'placeholder' : '', className].filter(Boolean).join(' ')}
      style={{
        ...restStyle,
        filter,
        transition: 'filter 600ms ease-out',
      }}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={imageAlt}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            zIndex: 1,
          }}
          draggable={false}
        />
      ) : null}
      {children}
      {overlays}
    </div>
  );
}
