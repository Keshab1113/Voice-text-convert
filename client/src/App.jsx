import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';

export default function App() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="p-3 bg-white shadow flex items-center justify-between">
        <Link to="/dashboard" className="font-semibold">Voice Room</Link>
        <button
          className="px-3 py-1 bg-gray-900 text-white rounded"
          onClick={() => { localStorage.clear(); nav('/login'); }}>
          Logout
        </button>
      </header>
      <main className="p-4"><Outlet /></main>
    </div>
  );
}
