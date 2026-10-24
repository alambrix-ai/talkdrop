import type { HTMLAttributes, ReactNode } from 'react';

export type TagVariant = 'default' | 'mint' | 'rose' | 'deep';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
  children: ReactNode;
}

export function Tag({ variant = 'default', className = '', children, ...rest }: TagProps) {
  return (
    <span
      className={['tag', variant !== 'default' ? variant : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
