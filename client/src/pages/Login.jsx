import React, { useState } from "react";
import { api, setAuth } from "../api";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [isProcess, setIsProcess] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async () => {
    setIsProcess(true);
    if (isRegister) {
      await api.post("/auth/register", form);
    }
    const { data } = await api.post("/auth/login", {
      email: form.email,
      password: form.password,
    });
    localStorage.setItem("token", data.token);
    setIsProcess(false);
    setAuth(data.token);
    nav("/dashboard");
  };

  return (
    <div className=" h-[92vh] bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black opacity-20"></div>
      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {isRegister ? "Create Account" : "Welcome Back"}
            </h1>
            <p className="text-white/70">
              {isRegister
                ? "Join us today and get started"
                : "Sign in to your account"}
            </p>
          </div>

          <div className="space-y-6">
            {isRegister && (
              <div className="group">
                <input
                  className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                  name="name"
                  placeholder="Full Name"
                  onChange={onChange}
                />
              </div>
            )}

            <div className="group">
              <input
                className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                name="email"
                type="email"
                placeholder="Email Address"
                onChange={onChange}
              />
            </div>

            <div className="group">
              <input
                className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm"
                name="password"
                type="password"
                placeholder="Password"
                onChange={onChange}
              />
            </div>

            <button
              onClick={submit}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-4 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent"
            >
              {isRegister ? "Create Account" : "Sign In"}
            </button>
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={() => setIsRegister(!isRegister)}
              disabled={isProcess}
              className="text-white/70 hover:text-white transition-colors duration-200 text-sm disabled:opacity-50"
            >
              {isRegister
                ? "Already have an account? "
                : "Don't have an account? "}
              <span className="font-semibold text-purple-300 hover:text-purple-200">
                {isRegister
                  ? isProcess
                    ? "Processing..."
                    : "Sign In"
                  : isProcess
                  ? "Processing..."
                  : "Sign Up"}
              </span>
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="flex items-center justify-center space-x-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-lg rounded-full flex items-center justify-center hover:bg-white/20 transition-all duration-300 cursor-pointer">
              <svg
                className="w-5 h-5 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6.29 18.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0020 3.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.073 4.073 0 01.8 7.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 010 16.407a11.616 11.616 0 006.29 1.84" />
              </svg>
            </div>
            <div className="w-12 h-12 bg-white/10 backdrop-blur-lg rounded-full flex items-center justify-center hover:bg-white/20 transition-all duration-300 cursor-pointer">
              <svg
                className="w-5 h-5 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M20 10c0-5.523-4.477-10-10-10S0 4.477 0 10c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V10h2.54V7.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V10h2.773l-.443 2.89h-2.33v6.988C16.343 19.128 20 14.991 20 10z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="w-12 h-12 bg-white/10 backdrop-blur-lg rounded-full flex items-center justify-center hover:bg-white/20 transition-all duration-300 cursor-pointer">
              <svg
                className="w-5 h-5 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M10.394 2.608a.75.75 0 00-.788 0L1.394 7.396a.75.75 0 000 1.208L5.25 10.5l-3.856 1.896a.75.75 0 000 1.208l8.212 4.788a.75.75 0 00.788 0l8.212-4.788a.75.75 0 000-1.208L14.75 10.5l3.856-1.896a.75.75 0 000-1.208L10.394 2.608zM10 9.707l5.704-3.325L10 3.057 4.296 6.382 10 9.707z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
