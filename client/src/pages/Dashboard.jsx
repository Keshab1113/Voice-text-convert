import React, { useEffect, useState } from "react";
import { api, setAuth } from "../api";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) nav("/login");
    else setAuth(t);
  }, []);

  const createMeeting = async () => {
    const { data } = await api.post("/meetings", { title });
    nav(`/host/${data.roomId}`);
  };

  return (
    <div className="min-h-screen h-[92vh] bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 flex items-center justify-center p-6">
      <div className="relative max-w-md w-full">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-white/20 to-white/10 p-8">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-tr from-blue-400 to-purple-500 rounded-full flex items-center justify-center shadow-lg">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white text-center mb-8 tracking-wide">
              Create Meeting
            </h2>

            <div className="space-y-6">
              <div className="relative group">
                <input
                  className="w-full bg-white/20 border border-white/30 rounded-xl px-4 py-3 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-300 backdrop-blur-sm group-hover:bg-white/25"
                  placeholder="Meeting title (optional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
              </div>

              <button
                onClick={createMeeting}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-transparent"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Create Meeting
                </span>
              </button>
            </div>
          </div>

          <div className="h-1 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500"></div>
        </div>

        <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-300 -z-10"></div>
      </div>
    </div>
  );
}
