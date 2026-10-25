import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ServerEvents, type Me } from '@talkdrop/shared';
import { api, ensureSession, getAccessToken } from '../lib/api';
import { useAppStore } from '../lib/store';
import { connectSocket } from '../lib/socket';
import { useEffect, useState } from 'react';

export function RequireAuth({ verified = false }: { verified?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const setMe = useAppStore((s) => s.setMe);
  const setToast = useAppStore((s) => s.setToast);
  // Always finish bootstrap (success or failure). Setting ready=false on failed
  // refresh used to trap the UI on "Restoring session…" forever after a hard reload.
  const [bootstrapped, setBootstrapped] = useState(() => Boolean(getAccessToken()));

  useEffect(() => {
    let cancelled = false;
    void ensureSession().finally(() => {
      if (!cancelled) setBootstrapped(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const token = getAccessToken();

  const meQuery = useQuery({
    queryKey: ['me'],
    enabled: bootstrapped && Boolean(token),
    queryFn: async () => {
      const me = await api<Me>('/me');
      setMe(me);
      return me;
    },
  });

  useEffect(() => {
    if (!meQuery.data?.ageVerified) return;
    const socket = connectSocket();
    const onIncoming = (payload: {
      sessionId: string;
      connectionId: string;
      from: { displayName: string; userId: string };
    }) => {
      if (!payload?.sessionId) return;
      // Already on this call — ignore duplicate notifies
      if (location.pathname === `/call/${payload.sessionId}`) return;
      setToast(`Incoming call from ${payload.from?.displayName ?? 'a connection'}`);
      navigate(`/call/${payload.sessionId}?connectionId=${payload.connectionId}`);
    };
    socket.on(ServerEvents.CALL_INCOMING, onIncoming);
    return () => {
      socket.off(ServerEvents.CALL_INCOMING, onIncoming);
    };
  }, [meQuery.data?.ageVerified, location.pathname, navigate, setToast]);

  if (!bootstrapped) {
    return (
      <div className="shell page">
        <p className="mute">Restoring session…</p>
      </div>
    );
  }

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
