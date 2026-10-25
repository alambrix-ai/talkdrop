import type { HTMLAttributes, ReactNode } from 'react';

export type CardTone = 'white' | 'cream' | 'grey';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  children: ReactNode;
}

export function Card({ tone = 'white', className = '', children, ...rest }: CardProps) {
  const toneClass = tone === 'cream' ? 'mint' : tone === 'grey' ? 'rose' : 'white';
  return (
    <div className={['card', toneClass, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
