import { NavLink, Outlet, Link } from 'react-router-dom';
import { Avatar, Logo, Tag } from '@talkdrop/ui';
import { useAppStore } from '../lib/store';

export function PublicLayout() {
  return (
    <div className="app">
      <header className="shell" style={{ paddingTop: 24, paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Link to="/" aria-label="Talkdrop home">
            <Logo height={32} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Tag variant="mint">18+ hangouts</Tag>
            <a href="#safety" className="mute" style={{ fontSize: 14, fontWeight: 600 }}>
              Safety
            </a>
            <Link to="/verify" style={{ fontSize: 14, fontWeight: 700 }}>
              Jump in
            </Link>
          </div>
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
            <NavPill to="/lobby">Hang out</NavPill>
            <NavPill to="/connections">Friends</NavPill>
            <NavPill to="/profile">You</NavPill>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {me?.ageVerified ? <Tag variant="mint">Verified 18+</Tag> : null}
            <Tag variant="deep" className="desktop-nav">
              Safety on
            </Tag>
            <Avatar name={me?.displayName ?? 'You'} size={44} />
          </div>
        </div>
      </header>
      <Outlet />
      <nav className="mobile-tabbar" aria-label="Mobile">
        <NavPill to="/lobby">Hang out</NavPill>
        <NavPill to="/connections">Friends</NavPill>
        <NavPill to="/profile">You</NavPill>
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
