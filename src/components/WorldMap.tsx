import { useState } from 'react';
import { MapPin, Trophy, Lock, Play, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const LEAGUES = [
  { id: 1, name: 'Amateur Street', req: 0, reward: 500, color: 'text-gray-400' },
  { id: 2, name: 'Underground Circuit', req: 1000, reward: 1500, color: 'text-[#00ffcc]' },
  { id: 3, name: 'Pro Drag Series', req: 5000, reward: 5000, color: 'text-[#ff00ff]' },
  { id: 4, name: 'Neon Apex', req: 20000, reward: 25000, color: 'text-[#ffcc00]' },
];

export default function WorldMap() {
  const { careerLeague, currency, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async (leagueId: number, cost: number) => {
    if (currency < cost || isUnlocking) return;
    setIsUnlocking(true);
    try {
      await updateProfile({
        currency: currency - cost,
        careerLeague: leagueId
      });
    } catch (error) {
      console.error("Failed to unlock league", error);
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-8 h-full">
      <div className="bg-[#111] p-8 rounded-2xl border-4 border-[#1a1a1a]">
        <div className="flex items-center gap-3 mb-2">
          <MapPin className="w-8 h-8 text-[#00ffcc]" />
          <h2 className="text-4xl font-black uppercase tracking-tighter italic -skew-x-[10deg]">Career Mode</h2>
        </div>
        <p className="text-gray-400 text-sm mb-8">Compete in leagues to earn credits and unlock better cars.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {LEAGUES.map((league) => {
            const isUnlocked = careerLeague >= league.id;
            const isNext = careerLeague + 1 === league.id;
            const canUnlock = isNext && currency >= league.req;

            return (
              <div 
                key={league.id}
                className={`relative p-6 border-4 -skew-x-[5deg] transition-all ${
                  isUnlocked 
                    ? 'bg-[#1a1a1a] border-[#333] hover:border-[#00ffcc]' 
                    : 'bg-[#0a0a0a] border-[#111] opacity-75'
                }`}
              >
                <div className="skew-x-[5deg]">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className={`text-2xl font-black uppercase tracking-widest ${league.color}`}>
                        {league.name}
                      </h3>
                      <p className="text-gray-500 font-mono text-sm mt-1">Tier {league.id}</p>
                    </div>
                    {isUnlocked ? (
                      <Trophy className={`w-8 h-8 ${league.color}`} />
                    ) : (
                      <Lock className="w-8 h-8 text-gray-600" />
                    )}
                  </div>

                  <div className="flex justify-between items-end mt-8">
                    <div>
                      <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Prize Pool</p>
                      <p className="text-xl font-mono text-white">${league.reward}</p>
                    </div>
                    
                    {isUnlocked ? (
                      <button 
                        onClick={() => navigate(`/race?league=${league.id}`)}
                        className="px-6 py-3 bg-[#00ffcc] text-black font-black uppercase tracking-widest hover:bg-[#00ccaa] transition-colors flex items-center gap-2"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Race
                      </button>
                    ) : isNext ? (
                      <div className="text-right">
                        <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Unlock Cost</p>
                        <p className={`text-xl font-mono mb-2 ${canUnlock ? 'text-[#00ffcc]' : 'text-red-500'}`}>
                          ${league.req}
                        </p>
                        <button 
                          onClick={() => handleUnlock(league.id, league.req)}
                          disabled={!canUnlock || isUnlocking}
                          className="px-4 py-2 bg-[#333] text-white font-bold uppercase tracking-widest text-xs hover:bg-[#444] disabled:opacity-50 transition-colors flex items-center gap-2"
                        >
                          {isUnlocking && <Loader2 className="w-3 h-3 animate-spin" />}
                          Unlock League
                        </button>
                      </div>
                    ) : (
                      <div className="text-right">
                        <p className="text-gray-600 text-xs uppercase tracking-widest mb-1">Requires</p>
                        <p className="text-gray-500 font-mono text-sm">Tier {league.id - 1}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
