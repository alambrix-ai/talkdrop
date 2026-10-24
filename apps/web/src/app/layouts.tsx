import { NavLink, Outlet, Link } from 'react-router-dom';
import { Avatar, Logo, Tag } from '@talkdrop/ui';
import { useAppStore } from '../lib/store';

export function PublicLayout() {
  return (
    <div className="app">
      <header className="shell" style={{ paddingTop: 24, paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" aria-label="Talkdrop home">
            <Logo height={32} />
          </Link>
          <Link to="/admin" className="mute" style={{ fontSize: 14, fontWeight: 600 }}>
            For teams
          </Link>
        </div>
      </header>
      <Outlet />
    </div>
  );
}

export function AppLayout() {
  const me = useAppStore((s) => s.me);
  return (
    <div className="app">
      <header className="shell" style={{ paddingTop: 20, paddingBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Link to="/lobby" aria-label="Talkdrop home">
            <Logo height={28} />
          </Link>
          <nav
            className="desktop-nav"
            style={{ display: 'flex', gap: 6 }}
            aria-label="Primary"
          >
            <NavPill to="/lobby">Meet</NavPill>
            <NavPill to="/connections">Connections</NavPill>
            <NavPill to="/profile">Profile</NavPill>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {me?.ageVerified ? <Tag variant="mint">Verified 18+</Tag> : null}
            <Avatar name={me?.displayName ?? 'You'} size={44} />
          </div>
        </div>
      </header>
      <Outlet />
      <nav className="mobile-tabbar" aria-label="Mobile">
        <NavPill to="/lobby">Meet</NavPill>
        <NavPill to="/connections">Connections</NavPill>
        <NavPill to="/profile">Profile</NavPill>
      </nav>
      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export function AdminLayout() {
  return (
    <div className="app" style={{ background: 'var(--white)' }}>
      <div
        className="shell"
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          gap: 24,
          paddingBlock: 24,
          minHeight: '100vh',
        }}
      >
        <aside>
          <Logo height={28} />
          <nav style={{ display: 'grid', gap: 6, marginTop: 28 }} aria-label="Admin">
            <AdminLink to="/admin">Overview</AdminLink>
            <AdminLink to="/admin/moderation">Moderation queue</AdminLink>
            <AdminLink to="/admin/audit">Audit log</AdminLink>
            <span className="mute" style={{ marginTop: 16, fontSize: 13 }}>
              Coming in v2
            </span>
            <span className="navlink" style={{ opacity: 0.5 }}>
              Live sessions
            </span>
            <span className="navlink" style={{ opacity: 0.5 }}>
              Policies
            </span>
            <span className="navlink" style={{ opacity: 0.5 }}>
              Members and SSO
            </span>
          </nav>
        </aside>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavPill({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => ['navlink', isActive ? 'on' : ''].filter(Boolean).join(' ')}
      style={{ justifyContent: 'center' }}
    >
      {children}
    </NavLink>
  );
}

function AdminLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/admin'}
      className={({ isActive }) => ['navlink', isActive ? 'on' : ''].filter(Boolean).join(' ')}
    >
      {children}
    </NavLink>
  );
}
