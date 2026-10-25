import type { ReactNode } from 'react';
import { useEffect } from 'react';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'grid',
        placeItems: 'end center',
        background: 'rgba(38, 38, 38, 0.45)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card white"
        style={{
          width: 'min(520px, 100%)',
          padding: 24,
          marginBottom: 8,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 99,
            background: 'var(--grey)',
            margin: '0 auto 16px',
          }}
          aria-hidden
        />
        <h2 className="disp" style={{ fontSize: 24, marginBottom: 8 }}>
          {title}
        </h2>
        <div>{children}</div>
        {footer ? <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>{footer}</div> : null}
      </div>
    </div>
  );
}
