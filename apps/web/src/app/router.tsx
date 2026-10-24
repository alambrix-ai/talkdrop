import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout, AppLayout, PublicLayout } from './layouts';
import { RequireAuth } from './guards';
import { useAppStore } from '../lib/store';

const LandingPage = lazy(() => import('../features/auth/LandingPage'));
const VerifyPage = lazy(() => import('../features/verify/VerifyPage'));
const OnboardingPage = lazy(() => import('../features/onboarding/OnboardingPage'));
const LobbyPage = lazy(() => import('../features/lobby/LobbyPage'));
const MatchPage = lazy(() => import('../features/match/MatchPage'));
const CallPage = lazy(() => import('../features/call/CallPage'));
const AfterPage = lazy(() => import('../features/after/AfterPage'));
const ConnectionsPage = lazy(() => import('../features/connections/ConnectionsPage'));
const ProfilePage = lazy(() => import('../features/profile/ProfilePage'));
const AdminOverview = lazy(() => import('../features/admin/AdminOverview'));
const AdminModeration = lazy(() => import('../features/admin/AdminModeration'));
const AdminAudit = lazy(() => import('../features/admin/AdminAudit'));

function Fallback() {
  return (
    <div className="shell page">
      <p className="mute">Loading…</p>
    </div>
  );
}

function Toast() {
  const toast = useAppStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 88,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--charcoal)',
        color: 'var(--cream)',
        padding: '12px 18px',
        borderRadius: 999,
        zIndex: 60,
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      {toast}
    </div>
  );
}

export function AppRouter() {
  return (
    <>
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<LandingPage />} />
          </Route>

          <Route path="/verify" element={<VerifyPage />} />

          <Route element={<RequireAuth verified />}>
            <Route element={<AppLayout />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/lobby" element={<LobbyPage />} />
              <Route path="/match" element={<MatchPage />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/connections/:id" element={<ConnectionsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route path="/call/:sessionId" element={<CallPage />} />
            <Route path="/after/:sessionId" element={<AfterPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="moderation" element={<AdminModeration />} />
              <Route path="audit" element={<AdminAudit />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toast />
    </>
  );
}
