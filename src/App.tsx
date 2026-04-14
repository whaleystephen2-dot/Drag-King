import React, { useState, useEffect } from 'react';
import { Car, Music, Map, Newspaper, Flag, Users, LogIn, Trophy, Globe } from 'lucide-react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import RaceTrack from './components/RaceTrack';
import Garage from './components/Garage';
import Radio from './components/Radio';
import WorldMap from './components/WorldMap';
import TrackDiscovery from './components/TrackDiscovery';
import News from './components/News';
import Multiplayer from './components/Multiplayer';
import Leaderboard from './components/Leaderboard';
import { AuthProvider, useAuth } from './contexts/AuthContext';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function MainApp() {
  const { user, loading, signIn, currency, careerLeague } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
    } else {
      setHasKey(true);
    }
  };

  if (!hasKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-white font-sans">
        <div className="max-w-md w-full p-8 bg-[#151619] rounded-2xl border border-[#333] text-center shadow-2xl">
          <Flag className="w-16 h-16 mx-auto mb-6 text-[#00ffcc]" />
          <h1 className="text-4xl font-black mb-4 uppercase tracking-tighter italic -skew-x-[10deg]">Neon Drag Racing</h1>
          <p className="mb-8 text-gray-400 text-sm">
            To generate custom cars, music, and access real-world data, please select your Google Cloud API Key.
          </p>
          <button 
            onClick={handleSelectKey} 
            className="w-full py-4 bg-[#00ffcc] hover:bg-[#00ccaa] text-black font-black uppercase tracking-widest rounded-lg transition-colors -skew-x-[10deg]"
          >
            Select API Key
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-[#050505] text-[#00ffcc] font-mono">LOADING...</div>;
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-white font-sans">
        <div className="max-w-md w-full p-8 bg-[#151619] rounded-2xl border border-[#333] text-center shadow-2xl">
          <Flag className="w-16 h-16 mx-auto mb-6 text-[#00ffcc]" />
          <h1 className="text-4xl font-black mb-4 uppercase tracking-tighter italic -skew-x-[10deg]">Neon Drag Racing</h1>
          <p className="mb-8 text-gray-400 text-sm">
            Sign in to access Career Mode, Garage, and Online Multiplayer.
          </p>
          <button 
            onClick={signIn} 
            className="w-full py-4 bg-white hover:bg-gray-200 text-black font-black uppercase tracking-widest rounded-lg transition-colors flex items-center justify-center gap-2 -skew-x-[10deg]"
          >
            <LogIn className="w-5 h-5" />
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#050505] text-white font-sans overflow-hidden">
      {/* Header / Navigation */}
      <header className="flex items-center justify-between px-6 py-4 border-b-4 border-[#1a1a1a] bg-[#0a0a0a] z-10">
        <div className="flex items-center gap-3">
          <Flag className="w-6 h-6 text-[#00ffcc]" />
          <h1 className="text-2xl font-black uppercase tracking-tighter italic -skew-x-[10deg]">Neon Drag Racing</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex gap-4 font-mono text-sm">
            <div className="flex flex-col items-end">
              <span className="text-[#666] uppercase text-[10px]">Credits</span>
              <span className="text-[#00ffcc]">${currency}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[#666] uppercase text-[10px]">League</span>
              <span className="text-[#ffcc00]">Tier {careerLeague}</span>
            </div>
          </div>
          <nav className="flex gap-2">
            <NavButton active={location.pathname === '/'} onClick={() => navigate('/')} icon={<Map className="w-4 h-4" />} label="Career" />
            <NavButton active={location.pathname === '/garage'} onClick={() => navigate('/garage')} icon={<Car className="w-4 h-4" />} label="Garage" />
            <NavButton active={location.pathname === '/multiplayer'} onClick={() => navigate('/multiplayer')} icon={<Users className="w-4 h-4" />} label="Online" />
            <NavButton active={location.pathname === '/leaderboard'} onClick={() => navigate('/leaderboard')} icon={<Trophy className="w-4 h-4" />} label="Ranks" />
            <NavButton active={location.pathname === '/discover'} onClick={() => navigate('/discover')} icon={<Globe className="w-4 h-4" />} label="Discover" />
            <NavButton active={location.pathname === '/race'} onClick={() => navigate('/race')} icon={<Flag className="w-4 h-4" />} label="Race" />
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-y-auto">
        <Routes>
          <Route path="/" element={<WorldMap />} />
          <Route path="/garage" element={<Garage />} />
          <Route path="/multiplayer" element={<Multiplayer />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/discover" element={<TrackDiscovery />} />
          <Route path="/race" element={<RaceTrack />} />
          <Route path="/radio" element={<Radio />} />
          <Route path="/news" element={<News />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <MainApp />
      </BrowserRouter>
    </AuthProvider>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-black uppercase tracking-wider transition-all -skew-x-[10deg] ${
        active 
          ? 'bg-[#00ffcc] text-black shadow-[0_0_15px_rgba(0,255,204,0.4)]' 
          : 'bg-transparent text-gray-400 hover:text-white hover:bg-[#222]'
      }`}
    >
      <div className="skew-x-[10deg] flex items-center gap-2">
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </div>
    </button>
  );
}
