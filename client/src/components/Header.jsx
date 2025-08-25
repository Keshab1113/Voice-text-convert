import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Mic, Users } from "lucide-react";

const Header = () => {
  const nav = useNavigate();
  const [token, setToken] = useState(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("token");
    nav("/login");
    console.log("Logged out successfully");
  };

  const handleLogin = () => {
    nav("/dashboard");
  };

  return (
    <header className="relative p-4 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 shadow-lg h-[8vh]">
      <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
        <div className="absolute -top-1 -left-1 w-8 h-8 bg-white/20 rounded-full animate-pulse"></div>
        <div
          className="absolute top-2 right-20 w-6 h-6 bg-yellow-300/30 rounded-full animate-bounce"
          style={{ animationDelay: "0.5s" }}
        ></div>
        <div
          className="absolute bottom-1 right-40 w-4 h-4 bg-white/25 rounded-full animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>
      </div>

      <div className="relative flex items-center justify-between">
        <div className="flex items-center space-x-3 group cursor-pointer">
          <div className="relative p-2 bg-white/20 rounded-xl backdrop-blur-sm group-hover:bg-white/30 transition-all duration-300">
            <Mic className="w-6 h-6 text-white drop-shadow-md" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-white drop-shadow-lg tracking-wide">
              Voice Room
            </h1>
            <div className="flex items-center space-x-1 text-white/80 text-xs">
              <Users className="w-3 h-3" />
              <span>Connect & Chat</span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {token && (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-white/20 rounded-full backdrop-blur-sm">
              <div className="w-6 h-6 bg-gradient-to-r from-green-400 to-blue-400 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-white">U</span>
              </div>
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            </div>
          )}
          {token ? (
            <button
              onClick={handleLogout}
              className="group relative px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 flex items-center space-x-2"
            >
              <LogOut className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
              <span>Logout</span>
              <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
          ) : (
            <button
              onClick={handleLogin}
              className="group relative px-4 py-2 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 flex items-center space-x-2"
            >
              <span>Login</span>
              <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
