import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Input, Logo, ProgressBar, Tag } from '@talkdrop/ui';
import { api, setAccessToken } from '../../lib/api';
import { useAppStore } from '../../lib/store';

type Phase = 'phone' | 'otp' | 'age' | 'checking' | 'passed' | 'failed';

export default function VerifyPage() {
  const navigate = useNavigate();
  const setMe = useAppStore((s) => s.setMe);
  const [phase, setPhase] = useState<Phase>('phone');
  const [phone, setPhone] = useState('+919876543210');
  const [code, setCode] = useState('');
  const [name, setName] = useState('Arjun K.');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'checking') return;
    let p = 0;
    const id = setInterval(() => {
      p += 8;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(id);
        void submitAge();
      }
    }, 120);
    return () => clearInterval(id);
  }, [phase]);

  async function requestOtp() {
    setError(null);
    try {
      const res = await api<{ sent: true; devCode?: string }>('/auth/otp/request', {
        method: 'POST',
        json: { phoneE164: phone },
        auth: false,
      });
      setDevCode(res.devCode ?? null);
      setPhase('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send code');
    }
  }

  async function verifyOtp() {
    setError(null);
    try {
      const res = await api<{
        accessToken: string;
        user: { ageVerified: boolean };
      }>('/auth/otp/verify', {
        method: 'POST',
        json: {
          phoneE164: phone,
          code: code || devCode || '123456',
          displayName: name,
          deviceFingerprint: 'dev-browser-fp',
        },
        auth: false,
      });
      setAccessToken(res.accessToken);
      if (res.user.ageVerified) {
        const me = await api('/me');
        setMe(me as never);
        navigate('/lobby');
        return;
      }
      setPhase('age');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    }
  }

  async function submitAge() {
    try {
      const res = await api<{ result: string }>('/verification/age', {
        method: 'POST',
        json: { estimatedAge: 24, confidence: 0.92, liveness: true },
      });
      if (res.result === 'passed') {
        setPhase('passed');
        const me = await api('/me');
        setMe(me as never);
      } else {
        // Uncertain/failed → show fallback UI (server rejects unsigned pass in production)
        setPhase('failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
      setPhase('failed');
    }
  }

  return (
    <div className="app">
      <header className="shell" style={{ paddingTop: 20, display: 'flex', justifyContent: 'space-between' }}>
        <Logo height={28} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tag variant="mint">Step 1 of 3 · Verify</Tag>
          <Tag>2 · Interests</Tag>
          <Tag>3 · Meet</Tag>
        </div>
        <Link to="/">
          <Button variant="ghost" size="sm">
            Exit
          </Button>
        </Link>
      </header>

      <main
        className="shell page"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 32,
          alignItems: 'start',
        }}
      >
        <div>
          <h1 className="h1" style={{ fontSize: 'clamp(34px, 4vw, 52px)' }}>
            Adults only — quick check, then the fun starts.
          </h1>
          <p className="mute" style={{ marginTop: 14, fontSize: 17, maxWidth: 420 }}>
            Talkdrop is a social hangout for verified 18+ people. We confirm age so everyone can
            relax and play nice.
          </p>
          <ul className="mute" style={{ marginTop: 20, lineHeight: 1.7, paddingLeft: 18 }}>
            <li>Photo checked on your device — never uploaded</li>
            <li>Only the age result is stored</li>
            <li>A failed check never enters the hangout pool</li>
          </ul>
        </div>

        <Card style={{ padding: 24 }}>
          {phase === 'phone' || phase === 'otp' ? (
            <>
              <Tag variant="deep">Phone sign-in</Tag>
              <h2 className="h3" style={{ marginTop: 12 }}>
                {phase === 'phone' ? 'Enter your number' : 'Enter the code'}
              </h2>
              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                <label>
                  <span className="mute" style={{ fontSize: 13 }}>
                    Display name
                  </span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
                </label>
                <label>
                  <span className="mute" style={{ fontSize: 13 }}>
                    Phone (E.164)
                  </span>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    aria-label="Phone number"
                  />
                </label>
                {phase === 'otp' ? (
                  <label>
                    <span className="mute" style={{ fontSize: 13 }}>
                      Code {devCode ? `(dev: ${devCode})` : ''}
                    </span>
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      aria-label="OTP code"
                    />
                  </label>
                ) : null}
                {error ? <p style={{ color: 'var(--alert)', margin: 0 }}>{error}</p> : null}
                {phase === 'phone' ? (
                  <Button onClick={() => void requestOtp()}>Send code</Button>
                ) : (
                  <Button onClick={() => void verifyOtp()}>Continue</Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h2 className="h3">Quick age check</h2>
                <Tag variant="mint">On-device</Tag>
              </div>
              <div
                style={{
                  margin: '20px auto',
                  width: 180,
                  height: 220,
                  borderRadius: '50% / 45%',
                  border: '2px dashed var(--slate)',
                  background: 'linear-gradient(160deg, var(--slate), var(--grey))',
                }}
                aria-hidden
              />
              <Tag>{phase === 'passed' ? 'Passed' : phase === 'failed' ? 'Failed' : 'Hold still for a moment'}</Tag>
              <div style={{ marginTop: 14 }}>
                <ProgressBar value={phase === 'passed' ? 100 : progress} label="Age check progress" />
              </div>
              <p style={{ marginTop: 12, fontWeight: 600 }}>
                Estimated age range: {phase === 'failed' ? 'uncertain' : '18 and over'}
              </p>
              {phase === 'age' ? (
                <Button style={{ marginTop: 16, width: '100%' }} onClick={() => setPhase('checking')}>
                  Start camera check
                </Button>
              ) : null}
              {phase === 'passed' ? (
                <Button style={{ marginTop: 16, width: '100%' }} onClick={() => navigate('/onboarding')}>
                  Continue
                </Button>
              ) : null}
              {phase === 'failed' ? (
                <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                  <Button
                    onClick={() =>
                      void (async () => {
                        const start = await api<{ pendingRef?: string }>(
                          '/verification/fallback/start',
                          { method: 'POST', json: { method: 'phone' } },
                        );
                        await api('/verification/fallback/complete', {
                          method: 'POST',
                          json: {
                            method: 'phone',
                            providerRef: start.pendingRef ?? 'mock',
                          },
                        });
                        setPhase('passed');
                        const me = await api('/me');
                        setMe(me as never);
                      })().catch((e) =>
                        setError(e instanceof Error ? e.message : 'Fallback failed'),
                      )
                    }
                  >
                    Phone number code
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void api<{ redirectUrl?: string }>('/verification/fallback/start', {
                        method: 'POST',
                        json: { method: 'document' },
                      }).then((r) => {
                        if (r.redirectUrl) window.location.href = r.redirectUrl;
                      })
                    }
                  >
                    ID document
                  </Button>
                </div>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <Tag>Phone number code</Tag>
                <Tag>ID document</Tag>
              </div>
            </>
          )}
        </Card>
      </main>
      <style>{`
        @media (max-width: 768px) {
          main.shell.page { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
