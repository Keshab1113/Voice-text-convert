import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import HostMeeting from './pages/HostMeeting.jsx';
import JoinMeeting from './pages/JoinMeeting.jsx';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route element={<App />}>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/host/:roomId" element={<HostMeeting />} />
        <Route path="/join/:roomId" element={<JoinMeeting />} />
      </Route>
    </Routes>
  </BrowserRouter>
);
