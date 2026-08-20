import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, clearToken, getToken } from './api/client';

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort — the client-side token clear below is what actually matters for this session.
    } finally {
      clearToken();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div style={{ fontFamily: 'sans-serif', display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 220, borderRight: '1px solid #eee', padding: 16 }}>
        <h3>AI Assistant</h3>
        <ul style={{ listStyle: 'none', padding: 0, lineHeight: 2 }}>
          <li>
            <NavLink to="/status">Status</NavLink>
          </li>
          <li>
            <NavLink to="/finance">Finance P&amp;L</NavLink>
          </li>
          <li>
            <NavLink to="/patients">Patients / CRM</NavLink>
          </li>
          <li>
            <NavLink to="/logs">Execution Logs</NavLink>
          </li>
          <li>
            <NavLink to="/channels">Kanallar</NavLink>
          </li>
        </ul>
        <button onClick={logout}>Log out</button>
      </nav>
      <main style={{ flex: 1, padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
