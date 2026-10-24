export interface LogoProps {
  variant?: 'mark' | 'wordmark';
  height?: number;
}

export function Logo({ variant = 'wordmark', height = 28 }: LogoProps) {
  if (variant === 'mark') {
    return (
      <img
        src="/brand/logo-mark.svg"
        alt="Talkdrop"
        height={height}
        width={height}
        style={{ display: 'block' }}
      />
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <img
        src="/brand/logo-mark.svg"
        alt=""
        height={height}
        width={height}
        style={{ display: 'block' }}
      />
      <span
        className="disp"
        style={{ fontSize: Math.round(height * 0.78), fontWeight: 800, color: 'var(--ink)' }}
      >
        talkdrop
      </span>
    </span>
  );
}
