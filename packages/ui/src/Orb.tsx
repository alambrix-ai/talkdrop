export interface OrbProps {
  size?: number;
  withPulses?: boolean;
}

export function Orb({ size = 160, withPulses = true }: OrbProps) {
  return (
    <div className="orb" style={{ width: size, height: size }} aria-hidden>
      {withPulses ? (
        <>
          <span className="pulse" />
          <span className="pulse b" />
          <span className="pulse c" />
        </>
      ) : null}
    </div>
  );
}
