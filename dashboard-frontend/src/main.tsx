import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import LoginPage from './pages/LoginPage';
import StatusPage from './pages/StatusPage';
import PatientsPage from './pages/PatientsPage';
import FinancePage from './pages/FinancePage';
import LogsPage from './pages/LogsPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="/status" replace />} />
          <Route path="status" element={<StatusPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="patients" element={<PatientsPage />} />
          <Route path="logs" element={<LogsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
