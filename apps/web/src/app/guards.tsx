import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Me } from '@talkdrop/shared';
import { api, getAccessToken } from '../lib/api';
import { useAppStore } from '../lib/store';
import { connectSocket } from '../lib/socket';
import { useEffect } from 'react';

export function RequireAuth({ verified = false }: { verified?: boolean }) {
  const location = useLocation();
  const setMe = useAppStore((s) => s.setMe);
  const token = getAccessToken();

  const meQuery = useQuery({
    queryKey: ['me'],
    enabled: Boolean(token),
    queryFn: async () => {
      const me = await api<Me>('/me');
      setMe(me);
      return me;
    },
  });

  useEffect(() => {
    if (meQuery.data?.ageVerified) connectSocket();
  }, [meQuery.data?.ageVerified]);

  if (!token) {
    return <Navigate to="/verify" replace state={{ from: location }} />;
  }

  if (meQuery.isLoading) {
    return (
      <div className="shell page">
        <p className="mute">Loading your session…</p>
      </div>
    );
  }

  if (meQuery.isError || !meQuery.data) {
    return <Navigate to="/verify" replace />;
  }

  const me = meQuery.data;
  if (me.status === 'banned' || me.status === 'suspended') {
    return (
      <div className="shell page">
        <h1 className="h2">Account {me.status}</h1>
        <p className="mute" style={{ marginTop: 12, maxWidth: 480 }}>
          Your account cannot join matching right now. You can appeal from settings once an
          enforcement notice is issued.
        </p>
      </div>
    );
  }

  if (verified && !me.ageVerified) {
    return <Navigate to="/verify" replace />;
  }

  if (verified && me.ageVerified && !me.onboardingComplete && !location.pathname.startsWith('/onboarding')) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
