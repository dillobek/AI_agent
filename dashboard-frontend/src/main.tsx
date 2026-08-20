import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import AgentPage from './pages/AgentPage';
import FinancePage from './pages/FinancePage';
import LoginPage from './pages/LoginPage';
import LogsPage from './pages/LogsPage';
import PatientsPage from './pages/PatientsPage';
import StatusPage from './pages/StatusPage';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<App />}>
          {/* The agent console is the landing surface — the dashboard pages
              exist to support it, not the other way around. */}
          <Route index element={<Navigate to="/agent" replace />} />
          <Route path="agent" element={<AgentPage />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="patients" element={<PatientsPage />} />
          <Route path="logs" element={<LogsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/agent" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
