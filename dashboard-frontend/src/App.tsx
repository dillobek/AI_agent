import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, clearToken, getToken } from './api/client';
import {
  IconActivity,
  IconAgent,
  IconChart,
  IconLogout,
  IconLogs,
  IconUsers,
} from './components/Icons';
import './styles/theme.css';
import './styles/shell.css';

interface NavEntry {
  to: string;
  label: string;
  icon: ReactNode;
}

const PRIMARY: NavEntry[] = [{ to: '/agent', label: 'Agent Console', icon: <IconAgent size={17} /> }];

const WORKSPACE: NavEntry[] = [
  { to: '/finance', label: 'Finance', icon: <IconChart size={17} /> },
  { to: '/patients', label: 'Records', icon: <IconUsers size={17} /> },
];

const SYSTEM: NavEntry[] = [
  { to: '/status', label: 'System Status', icon: <IconActivity size={17} /> },
  { to: '/logs', label: 'Activity Log', icon: <IconLogs size={17} /> },
];

/** Decodes the JWT payload for display only — never for authorization decisions. */
function readTokenClaims(): { role?: string; sub?: string } {
  try {
    const token = getToken();
    if (!token) return {};
    const payload = token.split('.')[1];
    if (!payload) return {};
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const claims = readTokenClaims();

  useEffect(() => {
    if (!getToken()) navigate('/login', { replace: true });
  }, [navigate]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Lightweight liveness poll so the sidebar reflects real API reachability.
  useEffect(() => {
    let cancelled = false;

    const ping = () =>
      api
        .get('/health/live')
        .then(() => !cancelled && setApiOnline(true))
        .catch(() => !cancelled && setApiOnline(false));

    void ping();
    const timer = window.setInterval(ping, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort: clearing the local token is what ends this session either way.
    } finally {
      clearToken();
      navigate('/login', { replace: true });
    }
  };

  const renderNav = (entries: NavEntry[]) =>
    entries.map((entry) => (
      <NavLink
        key={entry.to}
        to={entry.to}
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
      >
        {entry.icon}
        <span>{entry.label}</span>
      </NavLink>
    ));

  const initial = (claims.role ?? 'U').charAt(0).toUpperCase();

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <button
        className="menu-btn"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={menuOpen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
        </svg>
      </button>

      <div className={`scrim ${menuOpen ? 'show' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <IconAgent size={18} />
          </div>
          <div>
            <div className="brand-name">Assistant</div>
            <div className="brand-sub">AI Ecosystem</div>
          </div>
        </div>

        <nav className="nav" aria-label="Main navigation">
          {renderNav(PRIMARY)}
          <div className="nav-section">Workspace</div>
          {renderNav(WORKSPACE)}
          <div className="nav-section">System</div>
          {renderNav(SYSTEM)}
        </nav>

        <div className="sidebar-footer">
          <div className="conn" role="status" aria-live="polite">
            <span
              className={`dot ${apiOnline === null ? '' : apiOnline ? 'dot-live' : 'dot-danger'}`}
            />
            <span>
              {apiOnline === null ? 'Connecting…' : apiOnline ? 'API connected' : 'API unreachable'}
            </span>
          </div>

          <div className="user-row">
            <div className="user-avatar" aria-hidden="true">
              {initial}
            </div>
            <div className="grow" style={{ lineHeight: 1.3 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>Signed in</div>
              <div className="tiny muted">{claims.role ?? 'Authenticated'}</div>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={logout} aria-label="Log out" title="Log out">
              <IconLogout size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main" id="main">
        <Outlet />
      </main>
    </div>
  );
}
