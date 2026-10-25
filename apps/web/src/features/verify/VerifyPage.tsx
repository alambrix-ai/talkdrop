import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Input, Logo, Modal, Tag } from '@talkdrop/ui';
import { api, ensureSession, setAccessToken } from '../../lib/api';
import { useAppStore } from '../../lib/store';

type Phase = 'auth' | 'consent' | 'declined';
type AuthMode = 'signin' | 'signup';
type MeAge = { ageVerified: boolean; ageConsent?: 'pending' | 'accepted' | 'declined' };

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);

  function applyAgeGate(me: MeAge) {
    if (me.ageVerified || me.ageConsent === 'accepted') {
      navigate('/lobby');
      return;
    }
    if (me.ageConsent === 'declined') {
      setPhase('declined');
      return;
    }
    setPhase('consent');
  }

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
        const me = (await api('/me')) as MeAge;
        setMe(me as never);
        applyAgeGate(me);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not finish Google sign-in');
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per OAuth return
  }, [navigate, searchParams, setMe, setSearchParams]);

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
        user: MeAge;
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
      const me = (await api('/me')) as MeAge;
      setMe(me as never);
      applyAgeGate(me);
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
        user: MeAge;
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
      const me = (await api('/me')) as MeAge;
      setMe(me as never);
      applyAgeGate(me);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitConsent(confirmed18Plus: boolean) {
    setConsentBusy(true);
    setError(null);
    try {
      const res = await api<{
        result: string;
        ageVerified: boolean;
        ageConsent: 'accepted' | 'declined';
        message?: string;
      }>('/verification/age', {
        method: 'POST',
        json: { confirmed18Plus },
      });
      const me = (await api('/me')) as MeAge;
      setMe(me as never);
      if (res.ageVerified || res.ageConsent === 'accepted') {
        navigate('/onboarding');
        return;
      }
      setPhase('declined');
      if (res.message) setError(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your answer');
    } finally {
      setConsentBusy(false);
    }
  }

  const showConsentModal = phase === 'consent';

  return (
    <div className="app">
      <header className="shell" style={{ paddingTop: 20, display: 'flex', justifyContent: 'space-between' }}>
        <Logo height={28} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tag variant="mint">Step 1 of 3 · Confirm 18+</Tag>
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
            Adults only — confirm once, then the fun starts.
          </h1>
          <p className="mute" style={{ marginTop: 14, fontSize: 17, maxWidth: 420 }}>
            Talkdrop is a social hangout for people 18 and older. After you sign in, we ask a
            simple Yes / No — no camera age scan, no ID upload.
          </p>
          <ul className="mute" style={{ marginTop: 20, lineHeight: 1.7, paddingLeft: 18 }}>
            <li>Sign in with Google (Gmail) — no phone code</li>
            <li>Confirm you are 18+ with Yes or No</li>
            <li>Your answer is saved so we do not ask again every refresh</li>
            <li>No unlocks matching until you confirm you are 18+</li>
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
          ) : phase === 'declined' ? (
            <>
              <Tag variant="deep">Matching locked</Tag>
              <h2 className="h3" style={{ marginTop: 12 }}>
                You need to be 18 or older
              </h2>
              <p className="mute" style={{ marginTop: 8, fontSize: 14 }}>
                You answered No. Talkdrop hangouts and matching stay locked for this account. If
                you are 18 or older and answered by mistake, you can confirm below.
              </p>
              {error ? <p style={{ color: 'var(--alert)', marginTop: 12 }}>{error}</p> : null}
              <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                <Button disabled={consentBusy} onClick={() => void submitConsent(true)}>
                  Yes — I am 18 or older
                </Button>
                <Button variant="ghost" onClick={() => navigate('/')}>
                  Back to home
                </Button>
              </div>
            </>
          ) : (
            <>
              <Tag variant="mint">Almost there</Tag>
              <h2 className="h3" style={{ marginTop: 12 }}>
                Confirm you are 18+
              </h2>
              <p className="mute" style={{ marginTop: 8, fontSize: 14 }}>
                A short Yes / No popup is open so we can unlock matching for adults only.
              </p>
            </>
          )}
        </Card>
      </main>

      <Modal
        open={showConsentModal}
        title="Are you 18 or older?"
        onClose={() => {
          /* Must answer — Escape/backdrop should not skip consent */
        }}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={consentBusy}
              onClick={() => void submitConsent(false)}
              style={{ flex: 1 }}
            >
              No
            </Button>
            <Button disabled={consentBusy} onClick={() => void submitConsent(true)} style={{ flex: 1 }}>
              Yes
            </Button>
          </>
        }
      >
        <p className="mute" style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
          Talkdrop is only for adults. Tap <strong>Yes</strong> if you are 18 or older to continue.
          Tap <strong>No</strong> if you are under 18 — matching will stay locked.
        </p>
        {error && phase === 'consent' ? (
          <p style={{ color: 'var(--alert)', marginTop: 12, marginBottom: 0 }}>{error}</p>
        ) : null}
      </Modal>

      <style>{`
        @media (max-width: 768px) {
          main.shell.page { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
