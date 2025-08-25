import React from 'react';
import { Outlet, Link, } from 'react-router-dom';
import Header from './components/Header';

export default function App() {
  return (
    <div className="  min-h-screen w-full h-full flex flex-col">
      <Header/>
      <Outlet />
    </div>
  );
}
