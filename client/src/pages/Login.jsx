import React, { useState } from 'react';
import { api, setAuth } from '../api';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const nav = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', password:'' });
  const onChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async () => {
    if (isRegister) {
      await api.post('/auth/register', form);
    }
    const { data } = await api.post('/auth/login', { email: form.email, password: form.password });
    localStorage.setItem('token', data.token);
    setAuth(data.token);
    nav('/dashboard');
  };

  return (
    <div className="max-w-sm mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-xl font-semibold mb-4">{isRegister?'Register':'Login'}</h1>
      {isRegister && (
        <input className="border p-2 w-full mb-2" name="name" placeholder="Name" onChange={onChange}/>
      )}
      <input className="border p-2 w-full mb-2" name="email" placeholder="Email" onChange={onChange}/>
      <input className="border p-2 w-full mb-4" name="password" type="password" placeholder="Password" onChange={onChange}/>
      <button onClick={submit} className="w-full bg-gray-900 text-white py-2 rounded">{isRegister?'Create account':'Login'}</button>
      <button onClick={()=>setIsRegister(!isRegister)} className="w-full mt-3 text-sm underline">
        {isRegister?'Have an account? Login':'No account? Register'}
      </button>
    </div>
  );
}
