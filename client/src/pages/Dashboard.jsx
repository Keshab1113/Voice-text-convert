import React, { useEffect, useState } from 'react';
import { api, setAuth } from '../api';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) nav('/login'); else setAuth(t);
  }, []);
  const createMeeting = async () => {
    const { data } = await api.post('/meetings', { title });
    nav(`/host/${data.roomId}`);
  };
  return (
    <div className="max-w-lg mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-lg font-semibold mb-3">Create Meeting</h2>
      <input className="border p-2 w-full mb-3" placeholder="Title (optional)" value={title} onChange={e=>setTitle(e.target.value)}/>
      <button onClick={createMeeting} className="px-4 py-2 bg-blue-600 text-white rounded">Create</button>
    </div>
  );
}
