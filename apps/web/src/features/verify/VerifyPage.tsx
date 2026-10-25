import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, Logo, ProgressBar, Tag } from '@talkdrop/ui';
import { api, ensureSession, setAccessToken } from '../../lib/api';
import { useAppStore } from '../../lib/store';

type Phase = 'auth' | 'age' | 'checking' | 'passed' | 'failed';
type AuthMode = 'signin' | 'signup';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
const GOOGLE_MOCK =
  import.meta.env.DEV || import.meta.env.VITE_GOOGLE_OAUTH_MOCK === 'true';

export default function VerifyPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const setMe = useAppStore((s) => s.setMe);
  const [phase, setPhase] = useState<Phase>('auth');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [email, setEmail] = useState('you@gmail.com');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('Arjun K.');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const authError = searchParams.get('authError');
    if (authError) {
      setError(`Google sign-in failed (${authError}). Try again or use email.`);
      searchParams.delete('authError');
      setSearchParams(searchParams, { replace: true });
      return;
    }

    const signedIn = searchParams.get('signedIn');
    if (signedIn !== 'google') return;

    searchParams.delete('signedIn');
    setSearchParams(searchParams, { replace: true });
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const ok = await ensureSession();
        if (!ok) throw new Error('Session missing after Google sign-in');
        const me = (await api('/me')) as { ageVerified: boolean };
        setMe(me as never);
        if (me.ageVerified) {
          navigate('/lobby');
          return;
        }
        setPhase('age');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not finish Google sign-in');
      } finally {
        setBusy(false);
      }
    })();
  }, [navigate, searchParams, setMe, setSearchParams]);

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

  function continueWithGoogle() {
    setError(null);
    window.location.assign(`${API_URL}/auth/google`);
  }

  async function continueWithGoogleMock() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        accessToken: string;
        user: { ageVerified: boolean };
      }>('/auth/google/mock', {
        method: 'POST',
        json: {
          email: email.trim() || 'dev@gmail.com',
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
      setError(e instanceof Error ? e.message : 'Mock Google sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitEmailAuth() {
    setBusy(true);
    setError(null);
    try {
      const path = authMode === 'signup' ? '/auth/signup' : '/auth/login';
      const res = await api<{
        accessToken: string;
        user: { ageVerified: boolean };
      }>(path, {
        method: 'POST',
        json: {
          email: email.trim(),
          password,
          ...(authMode === 'signup' ? { displayName: name } : {}),
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
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
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
            <li>Sign in with Google (Gmail) — no phone code</li>
            <li>Photo checked on your device — never uploaded</li>
            <li>Only the age result is stored</li>
            <li>A failed check never enters the hangout pool</li>
          </ul>
        </div>

        <Card style={{ padding: 24 }}>
          {phase === 'auth' ? (
            <>
              <Tag variant="deep">Gmail sign-in</Tag>
              <h2 className="h3" style={{ marginTop: 12 }}>
                Continue with Google
              </h2>
              <p className="mute" style={{ marginTop: 8, fontSize: 14 }}>
                Use your Gmail account in one click. Email and password is available as a backup.
              </p>
              <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                <Button onClick={continueWithGoogle} disabled={busy}>
                  Continue with Google
                </Button>
                {GOOGLE_MOCK ? (
                  <Button variant="ghost" onClick={() => void continueWithGoogleMock()} disabled={busy}>
                    Dev: mock Google ({email || 'you@gmail.com'})
                  </Button>
                ) : null}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    margin: '4px 0',
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                  <span className="mute" style={{ fontSize: 12 }}>
                    or email
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="sm"
                    variant={authMode === 'signup' ? 'primary' : 'ghost'}
                    onClick={() => setAuthMode('signup')}
                  >
                    Sign up
                  </Button>
                  <Button
                    size="sm"
                    variant={authMode === 'signin' ? 'primary' : 'ghost'}
                    onClick={() => setAuthMode('signin')}
                  >
                    Sign in
                  </Button>
                </div>

                {authMode === 'signup' ? (
                  <label>
                    <span className="mute" style={{ fontSize: 13 }}>
                      Display name
                    </span>
                    <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
                  </label>
                ) : null}
                <label>
                  <span className="mute" style={{ fontSize: 13 }}>
                    Email (Gmail)
                  </span>
                  <Input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-label="Email"
                  />
                </label>
                <label>
                  <span className="mute" style={{ fontSize: 13 }}>
                    Password
                  </span>
                  <Input
                    type="password"
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-label="Password"
                  />
                </label>
                {error ? <p style={{ color: 'var(--alert)', margin: 0 }}>{error}</p> : null}
                <Button onClick={() => void submitEmailAuth()} disabled={busy || password.length < 8}>
                  {authMode === 'signup' ? 'Create account' : 'Sign in with email'}
                </Button>
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
              {error ? <p style={{ color: 'var(--alert)', marginTop: 12 }}>{error}</p> : null}
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
