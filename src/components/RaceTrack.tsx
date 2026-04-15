import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Loader2 } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, getDoc, collection, addDoc } from 'firebase/firestore';

export default function RaceTrack() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, currency, updateProfile } = useAuth();
  
  const leagueId = searchParams.get('league') || '0';
  const matchId = searchParams.get('id');
  const botId = searchParams.get('botId');
  const trackName = searchParams.get('trackName');
  const trackLocation = searchParams.get('location');
  const isMultiplayer = !!matchId;

  const [status, setStatus] = useState<'idle' | 'countdown' | 'racing' | 'finished'>('idle');
  const [countdown, setCountdown] = useState(3);
  const [rpm, setRpm] = useState(1000);
  const [gear, setGear] = useState(1);
  const [speed, setSpeed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [opponentDistance, setOpponentDistance] = useState(0);
  const [isRevving, setIsRevving] = useState(false);
  const [playerWon, setPlayerWon] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [playerRole, setPlayerRole] = useState<'player1' | 'player2' | null>(null);
  const [raceTimeMs, setRaceTimeMs] = useState<number | null>(null);
  
  const [isBoosting, setIsBoosting] = useState(false);
  const [n2oReady, setN2oReady] = useState(true);
  const [n2oCooldownProgress, setN2oCooldownProgress] = useState(100);
  const [damage, setDamage] = useState(0);
  
  const [carStats, setCarStats] = useState({ 
    chassis: 'street-tuner',
    bodyKit: 'stock',
    engine: 1, 
    tires: 1, 
    transmission: 1, 
    color: '#00ffcc', 
    spoiler: false 
  });

  const [botStats, setBotStats] = useState<any>(null);

  const finishLine = 1000; // arbitrary units
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const raceStartTimeRef = useRef<number | null>(null);
  const isBoostingRef = useRef(false);
  const n2oEndTimeRef = useRef(0);
  const n2oCooldownRef = useRef(0);

  // Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineOscRef = useRef<OscillatorNode | null>(null);
  const engineGainRef = useRef<GainNode | null>(null);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Stop existing engine if any
    if (engineOscRef.current) {
      try { engineOscRef.current.stop(); } catch(e) {}
    }

    // Create engine sound
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = ctx.createGain();
    gain.gain.value = 0.05; // very subtle
    
    // Lowpass filter for muffled engine
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    engineOscRef.current = osc;
    engineGainRef.current = gain;
  };

  const stopAudio = () => {
    if (engineOscRef.current) {
      try { engineOscRef.current.stop(); } catch(e) {}
      engineOscRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopAudio();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  // Fetch Car Stats
  useEffect(() => {
    if (!user) return;
    const fetchCar = async () => {
      const docSnap = await getDoc(doc(db, 'cars', user.uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCarStats({
          chassis: data.chassis || 'street-tuner',
          bodyKit: data.bodyKit || 'stock',
          engine: data.engine || 1,
          tires: data.tires || 1,
          transmission: data.transmission || 1,
          color: data.color || '#00ffcc',
          spoiler: data.spoiler || false
        });
      }
    };
    fetchCar();
  }, [user]);

  // Fetch Bot Stats
  useEffect(() => {
    if (!botId) return;
    const fetchBot = async () => {
      const docSnap = await getDoc(doc(db, 'ai_bots', botId));
      if (docSnap.exists()) {
        setBotStats(docSnap.data());
      }
    };
    fetchBot();
  }, [botId]);

  // Determine player role
  useEffect(() => {
    if (!isMultiplayer || !matchId || !user) return;
    const fetchRole = async () => {
      const docSnap = await getDoc(doc(db, 'races', matchId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.player1 === user.uid) setPlayerRole('player1');
        else if (data.player2 === user.uid) setPlayerRole('player2');
      }
    };
    fetchRole();
  }, [isMultiplayer, matchId, user]);

  // Multiplayer sync
  useEffect(() => {
    if (!isMultiplayer || !matchId || !user || !playerRole) return;

    const unsubscribe = onSnapshot(doc(db, 'races', matchId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Sync opponent distance
        if (playerRole === 'player1') {
          setOpponentDistance(data.player2Progress || 0);
        } else {
          setOpponentDistance(data.player1Progress || 0);
        }

        // Handle finish
        if (data.status === 'finished' && status !== 'finished') {
          setStatus('finished');
          setPlayerWon(data.winner === user.uid);
        }
      }
    });

    return unsubscribe;
  }, [isMultiplayer, matchId, user, status, playerRole]);

  // Sync player progress to Firestore
  useEffect(() => {
    if (!isMultiplayer || !matchId || !user || status !== 'racing' || !playerRole) return;

    const syncInterval = setInterval(async () => {
      try {
        const raceRef = doc(db, 'races', matchId);
        const updateData: any = {};
        if (playerRole === 'player1') {
          updateData.player1Progress = distance;
        } else {
          updateData.player2Progress = distance;
        }
        await updateDoc(raceRef, updateData);
      } catch (e) {
        console.error(e);
      }
    }, 500); // Sync every 500ms

    return () => clearInterval(syncInterval);
  }, [distance, isMultiplayer, matchId, user, status, playerRole]);

  const playShiftSound = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  };

  const playFinishSound = (won: boolean) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const osc = ctx.createOscillator();
    osc.type = won ? 'triangle' : 'sawtooth';
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (won) {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(554, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 1);
    }
    
    osc.start();
    osc.stop(ctx.currentTime + 1.5);
  };

  const startGame = () => {
    initAudio();
    setStatus('countdown');
    setCountdown(3);
    setRpm(1000);
    setGear(1);
    setSpeed(0);
    setDistance(0);
    setOpponentDistance(0);
    setIsRevving(false);
    setPlayerWon(false);
    setRewardClaimed(false);
    setRaceTimeMs(null);
    raceStartTimeRef.current = null;
    
    setIsBoosting(false);
    setN2oReady(true);
    setN2oCooldownProgress(100);
    setDamage(0);
    isBoostingRef.current = false;
    n2oEndTimeRef.current = 0;
    n2oCooldownRef.current = 0;
  };

  useEffect(() => {
    if (status === 'countdown') {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        setStatus('racing');
        raceStartTimeRef.current = performance.now();
      }
    }
  }, [status, countdown]);

  const handleRevDown = () => setIsRevving(true);
  const handleRevUp = () => setIsRevving(false);

  const handleShift = () => {
    if (status !== 'racing') return;
    
    playShiftSound();

    // Perfect shift is between 6000 and 8000 RPM
    let speedBoost = 0;
    if (rpm >= 6000 && rpm <= 8000) {
      speedBoost = 20 + (carStats.engine * 2); // Perfect shift + engine bonus
    } else if (rpm > 8000) {
      speedBoost = 5; // Over-revved
    } else {
      speedBoost = 10; // Early shift
    }

    // Transmission bonus: flat speed boost and higher RPM retention
    speedBoost += carStats.transmission * 1.5;

    setGear((prev) => Math.min(prev + 1, 6));
    setSpeed((prev) => prev + speedBoost);
    
    // Better transmission means less RPM drop
    const rpmDrop = 3000 + (carStats.transmission * 200);
    setRpm(rpmDrop); // Drop RPM after shift
  };

  const gameLoop = (time: number) => {
    if (lastTimeRef.current !== null && status === 'racing') {
      const deltaTime = (time - lastTimeRef.current) / 1000;

      // Update RPM
      setRpm((prevRpm) => {
        let newRpm = prevRpm;
        if (isRevving) {
          newRpm += 5000 * deltaTime; // Rev up
        } else {
          newRpm -= 3000 * deltaTime; // Rev down
        }
        
        // Idle RPM is 1000, max is 9000
        newRpm = Math.max(1000, Math.min(newRpm, 9000));
        
        // If racing and revving, increase speed slightly based on gear and tires
        if (isRevving && newRpm < 8500) {
          setSpeed((s) => s + (gear * 2 + carStats.tires) * deltaTime);
        }

        // Damage from redlining
        if (status === 'racing' && newRpm > 8500) {
          setDamage((prev) => Math.min(100, prev + 15 * deltaTime));
        }

        return newRpm;
      });

      // Apply drag (increases with damage)
      setSpeed((prevSpeed) => {
        const drag = 5 + ((damage / 100) * 15);
        return Math.max(0, prevSpeed - drag * deltaTime);
      });

      // Handle N2O
      if (isBoostingRef.current) {
        if (time > n2oEndTimeRef.current) {
          isBoostingRef.current = false;
          setIsBoosting(false);
          n2oCooldownRef.current = time + 5000; // 5 second cooldown
          setN2oReady(false);
          setN2oCooldownProgress(0);
        } else {
          // Apply boost
          setSpeed((s) => s + 150 * deltaTime); // Huge acceleration
          setN2oCooldownProgress(((n2oEndTimeRef.current - time) / 2000) * 100);
        }
      } else if (!n2oReady) {
        if (time > n2oCooldownRef.current) {
          setN2oReady(true);
          setN2oCooldownProgress(100);
        } else {
          setN2oCooldownProgress(100 - ((n2oCooldownRef.current - time) / 5000) * 100);
        }
      }

      // Update distances
      setDistance((prev) => {
        const newDist = prev + speed * deltaTime;
        if (newDist >= finishLine && status !== 'finished') {
          handleFinish(true);
        }
        return newDist;
      });

      // Opponent AI (steady acceleration) if not multiplayer
      if (!isMultiplayer) {
        setOpponentDistance((prev) => {
          // Difficulty based on league or bot
          let difficultyMultiplier = leagueId ? parseInt(leagueId) : 1;
          if (botStats) {
            difficultyMultiplier = botStats.difficulty;
          }
          
          const opponentSpeed = (40 + (time / 1000) * 5) * (1 + (difficultyMultiplier * 0.1));
          const newDist = prev + opponentSpeed * deltaTime;
          if (newDist >= finishLine && status !== 'finished' && distance < finishLine) {
            handleFinish(false);
          }
          return newDist;
        });
      }
    }
    
    // Revving in idle/countdown
    if ((status === 'idle' || status === 'countdown') && lastTimeRef.current !== null) {
      const deltaTime = (time - lastTimeRef.current) / 1000;
      setRpm((prevRpm) => {
        let newRpm = prevRpm;
        if (isRevving) newRpm += 5000 * deltaTime;
        else newRpm -= 3000 * deltaTime;
        return Math.max(1000, Math.min(newRpm, 9000));
      });
    }

    // Update engine sound pitch based on RPM
    if (engineOscRef.current && audioCtxRef.current) {
      // Map RPM (1000-9000) to Frequency (e.g., 40Hz - 150Hz)
      const freq = 40 + (rpm / 9000) * 110;
      engineOscRef.current.frequency.setTargetAtTime(freq, audioCtxRef.current.currentTime, 0.1);
    }

    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const handleFinish = async (won: boolean) => {
    setStatus('finished');
    setPlayerWon(won);
    stopAudio();
    playFinishSound(won);
    
    let finalTimeMs = 0;
    if (raceStartTimeRef.current) {
      finalTimeMs = performance.now() - raceStartTimeRef.current;
      setRaceTimeMs(finalTimeMs);
    }

    // Save to leaderboard
    if (user && finalTimeMs > 0) {
      try {
        await addDoc(collection(db, 'leaderboards'), {
          userId: user.uid,
          displayName: user.displayName || 'Anonymous Racer',
          leagueId: leagueId,
          timeMs: finalTimeMs,
          createdAt: new Date().toISOString()
        });
      } catch (e) {
        console.error("Failed to save to leaderboard", e);
      }
    }
    
    if (isMultiplayer && matchId && user) {
      try {
        await updateDoc(doc(db, 'races', matchId), {
          status: 'finished',
          winner: won ? user.uid : 'opponent'
        });
      } catch (e) {
        console.error("Failed to update race winner", e);
      }
    } else if (won && leagueId && !rewardClaimed) {
      // Career mode rewards
      const rewards = [0, 500, 1500, 5000, 25000]; // Index matches league ID
      const reward = rewards[parseInt(leagueId)] || 100;
      
      try {
        await updateProfile({ currency: currency + reward });
        setRewardClaimed(true);
      } catch (e) {
        console.error("Failed to claim reward", e);
      }
    }
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [status, isRevving, gear, speed, isMultiplayer, leagueId, distance, carStats, n2oReady, damage]);

  const activateN2O = (e?: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (e) e.stopPropagation();
    if (status !== 'racing') return;
    if (isBoostingRef.current || !n2oReady) return;
    
    isBoostingRef.current = true;
    setIsBoosting(true);
    setN2oReady(false);
    n2oEndTimeRef.current = performance.now() + 2000; // 2 seconds of boost
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n' || e.key === ' ') {
        activateN2O();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, n2oReady]);

  const playerProgress = Math.min(100, (distance / finishLine) * 100);
  const opponentProgress = Math.min(100, (opponentDistance / finishLine) * 100);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = Math.floor(ms % 1000);
    return `${seconds}.${milliseconds.toString().padStart(3, '0')}s`;
  };

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-[#111] to-[#050505] border-8 border-[#1a1a1a] overflow-hidden font-['Arial_Black','Helvetica_Bold',sans-serif] text-white">
      <style>{`
        @keyframes smoke-rise {
          0% { transform: translate(0, 0) scale(1); opacity: 0.8; }
          100% { transform: translate(-80px, -150px) scale(4); opacity: 0; }
        }
        .animate-smoke { animation: smoke-rise 1.5s infinite linear; }
        .animate-smoke-delay-1 { animation: smoke-rise 1.5s infinite linear 0.5s; }
        .animate-smoke-delay-2 { animation: smoke-rise 1.5s infinite linear 1.0s; }
        
        @keyframes flicker-neon {
          0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { opacity: 0.9; }
          20%, 24%, 55% { opacity: 0.1; }
        }
        .animate-flicker { animation: flicker-neon 2s infinite; }
        
        @keyframes engine-sputter {
          0%, 100% { transform: translateX(0) translateY(0); }
          25% { transform: translateX(-2px) translateY(1px); }
          50% { transform: translateX(2px) translateY(-1px); }
          75% { transform: translateX(-1px) translateY(2px); }
        }
        .animate-sputter { animation: engine-sputter 0.1s infinite; }
      `}</style>
      
      {/* Background Track Elements */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1200px] h-[400px] bg-[#0f0f0f] border-t-2 border-[#333]" style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)' }}>
        <div className="absolute left-1/2 top-0 w-1 h-full -translate-x-1/2 opacity-30" style={{ background: 'repeating-linear-gradient(to bottom, transparent, transparent 40px, #ffcc00 40px, #ffcc00 80px)' }}></div>
      </div>

      {/* Nitrous Overlay */}
      {isBoosting && (
        <div className="absolute inset-0 pointer-events-none z-0 shadow-[inset_0_0_150px_rgba(0,255,204,0.3)]"></div>
      )}
      
      {/* Car Positions */}
      {botStats ? (
        <div 
          className={`absolute bottom-[120px] right-[150px] h-[80px] shadow-[0_10px_30px_rgba(0,0,0,0.8)] bg-gradient-to-l from-[#222] to-[#333] border-b-4 opacity-80 transition-transform duration-100 ${
            botStats.carStats.chassis === 'muscle-classic' ? 'w-[260px] rounded-tr-sm rounded-tl-3xl' :
            botStats.carStats.chassis === 'cyber-supercar' ? 'w-[280px] rounded-tr-[40px] rounded-tl-[80px] h-[60px]' :
            'w-[240px] rounded-t'
          } ${
            botStats.carStats.bodyKit === 'widebody' ? 'border-l-8 border-r-8' :
            botStats.carStats.bodyKit === 'aero' ? 'border-b-8 shadow-[0_20px_40px_rgba(0,0,0,0.9)]' : ''
          }`}
          style={{ 
            transform: `scale(${1 + opponentProgress/200}) translateY(${-opponentProgress}px)`,
            borderColor: botStats.carStats.color,
            backgroundImage: `url(${botStats.imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 opacity-40 bg-gradient-to-t from-transparent to-current" style={{ color: botStats.carStats.color }}></div>
          {botStats.carStats.spoiler && (
            <div className="absolute -right-4 top-4 w-8 h-16 bg-[#111] border-l-2" style={{ borderColor: botStats.carStats.color, transform: 'skewX(20deg)' }}></div>
          )}
        </div>
      ) : (
        <div className="absolute bottom-[120px] right-[150px] w-[240px] h-[80px] rounded-t shadow-[0_10px_30px_rgba(0,0,0,0.8)] bg-gradient-to-l from-[#222] to-[#333] border-b-4 border-[#ff4444] opacity-80 transition-transform duration-100" style={{ transform: `scale(${1 + opponentProgress/200}) translateY(${-opponentProgress}px)` }}></div>
      )}
      
      {/* Player Car */}
      <div 
        className={`absolute bottom-[120px] left-[150px] h-[80px] shadow-[0_10px_30px_rgba(0,0,0,0.8)] bg-gradient-to-r from-[#222] to-[#444] border-b-4 transition-transform duration-100 ${
          carStats.chassis === 'muscle-classic' ? 'w-[260px] rounded-tl-sm rounded-tr-3xl' :
          carStats.chassis === 'cyber-supercar' ? 'w-[280px] rounded-tl-[40px] rounded-tr-[80px] h-[60px]' :
          'w-[240px] rounded-t'
        } ${
          carStats.bodyKit === 'widebody' ? 'border-l-8 border-r-8' :
          carStats.bodyKit === 'aero' ? 'border-b-8 shadow-[0_20px_40px_rgba(0,0,0,0.9)]' : ''
        } ${damage > 75 ? 'animate-sputter' : ''}`}
        style={{ 
          transform: `scale(${1 + playerProgress/200}) translateY(${-playerProgress}px)`,
          borderColor: carStats.color
        }}
      >
        {/* Paint Job Accent */}
        <div className={`absolute inset-0 opacity-20 bg-gradient-to-t from-transparent to-current ${damage > 50 ? 'animate-flicker' : ''}`} style={{ color: carStats.color }}></div>
        
        {/* Damage Dents */}
        {damage > 25 && (
          <div className="absolute top-2 left-[20%] w-12 h-8 bg-black/50 rounded-full blur-[2px] mix-blend-overlay"></div>
        )}
        {damage > 60 && (
          <div className="absolute top-6 left-[60%] w-16 h-10 bg-black/70 rounded-full blur-[3px] mix-blend-overlay -skew-x-12"></div>
        )}

        {/* Engine Smoke */}
        {damage > 25 && (
          <div className="absolute top-0 left-[80%] z-50 pointer-events-none">
            <div className={`absolute w-6 h-6 rounded-full blur-md animate-smoke ${damage > 75 ? 'bg-gray-900' : 'bg-gray-500'}`}></div>
            {damage > 50 && <div className={`absolute w-8 h-8 rounded-full blur-md animate-smoke-delay-1 ${damage > 75 ? 'bg-gray-900' : 'bg-gray-500'}`}></div>}
            {damage > 75 && <div className={`absolute w-10 h-10 rounded-full blur-md animate-smoke-delay-2 bg-black`}></div>}
          </div>
        )}

        {/* Spoiler */}
        {carStats.spoiler && (
          <div className="absolute -left-4 top-4 w-8 h-16 bg-[#111] border-r-2" style={{ borderColor: carStats.color, transform: 'skewX(-20deg)' }}></div>
        )}
        {/* Nitrous Flames */}
        {isBoosting && (
          <div className="absolute -left-16 top-1/2 -translate-y-1/2 flex gap-1">
            <div className="w-12 h-4 bg-[#00ffcc] rounded-full animate-pulse blur-sm" style={{ transform: 'skewX(-20deg)' }}></div>
            <div className="w-8 h-3 bg-white rounded-full animate-pulse blur-sm" style={{ transform: 'skewX(-20deg)' }}></div>
          </div>
        )}
      </div>

      {/* UI Header */}
      <div className="absolute top-10 left-0 right-0 flex justify-between px-[60px] pointer-events-none z-10">
        <div className="flex flex-col">
          <div className="text-[140px] leading-[0.8] tracking-[-6px] uppercase text-[#00ffcc] italic -skew-x-[15deg] drop-shadow-[0_0_20px_rgba(0,255,204,0.4)]">
            {status === 'finished' ? (playerWon ? 'WIN' : 'LOSE') : `GEAR ${gear}`}
          </div>
          {trackName && (
            <div className="mt-4 -skew-x-[15deg]">
              <div className="text-2xl font-black uppercase tracking-widest text-[#FF00FF] bg-black/50 inline-block px-4 py-1 backdrop-blur-sm border-l-4 border-[#FF00FF]">
                {trackName}
              </div>
              {trackLocation && (
                <div className="text-sm font-bold uppercase tracking-widest text-gray-400 bg-black/50 inline-block px-4 py-1 backdrop-blur-sm ml-2">
                  {trackLocation}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="text-right font-mono tracking-[2px]">
          <div className="text-[12px] text-[#666] uppercase">DISTANCE</div>
          <div className="text-[24px] text-white mb-[10px]">{Math.floor(distance)}m</div>
          <div className="text-[12px] text-[#666] uppercase">{botStats ? botStats.name : 'RIVAL'}</div>
          <div className="text-[24px] text-white mb-[10px]">{Math.floor(opponentDistance)}m</div>
        </div>
      </div>

      {/* Critical Alert */}
      {rpm >= 7500 && rpm <= 8500 && status === 'racing' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -skew-x-[15deg] bg-[#ff4444] text-black px-[40px] py-[10px] text-[48px] font-black tracking-[2px] pointer-events-none z-20">
          SHIFT NOW
        </div>
      )}

      {/* Main HUD Bottom */}
      <div className="absolute bottom-10 left-[60px] w-[120px] h-[120px] border-4 border-white flex items-center justify-center text-[80px] -skew-x-[10deg] pointer-events-none z-10">
        {gear}
      </div>

      <div className="absolute bottom-[180px] left-[60px] flex flex-col gap-[5px] pointer-events-none z-10">
        <div className="text-[12px] text-[#666] uppercase mb-[5px]">NOS</div>
        <div className={`w-[40px] h-[8px] bg-[#00ffcc] transition-opacity ${countdown <= 0 ? 'opacity-100 shadow-[0_0_10px_#00ffcc]' : 'opacity-20'}`}></div>
        <div className={`w-[40px] h-[8px] bg-[#00ffcc] transition-opacity ${countdown <= 1 ? 'opacity-100 shadow-[0_0_10px_#00ffcc]' : 'opacity-20'}`}></div>
        <div className={`w-[40px] h-[8px] bg-[#00ffcc] transition-opacity ${countdown <= 2 ? 'opacity-100 shadow-[0_0_10px_#00ffcc]' : 'opacity-20'}`}></div>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[300px] h-[2px] bg-[#333] pointer-events-none z-10">
        <div className="absolute top-[-20px] left-0 text-[12px] text-[#666] uppercase">START</div>
        <div className="absolute top-[-20px] right-0 text-[12px] text-[#666] uppercase">FINISH</div>
        <div className="absolute top-[-5px] w-[10px] h-[12px] bg-[#ff4444] transition-all" style={{ left: `${opponentProgress}%` }}></div>
        <div className="absolute top-[-5px] w-[10px] h-[12px] bg-[#00ffcc] transition-all" style={{ left: `${playerProgress}%` }}></div>
      </div>

      <div className="absolute bottom-10 right-[60px] text-right flex flex-col items-end pointer-events-none z-10">
        <div className="text-[180px] leading-[0.85] tracking-[-8px] mb-[-10px] -skew-x-[10deg] bg-gradient-to-b from-white to-[#888] bg-clip-text text-transparent">
          {Math.floor(speed)}
        </div>
        <div className="text-[24px] text-[#ffcc00] uppercase tracking-[4px] mr-[10px]">MPH</div>
        <div className="w-[400px] h-[12px] bg-[#1a1a1a] mt-[20px] relative overflow-hidden">
          <div 
            className="h-full transition-all duration-75" 
            style={{ 
              width: `${(rpm / 9000) * 100}%`,
              background: 'linear-gradient(to right, #00ffcc 0%, #00ffcc 70%, #ffcc00 70%, #ffcc00 90%, #ff4444 90%)'
            }}
          ></div>
        </div>
        <div className="text-[12px] text-[#666] uppercase mt-[5px] font-mono">{Math.floor(rpm)} RPM</div>

        {/* Damage Bar */}
        <div className="w-[200px] h-[8px] bg-[#1a1a1a] mt-[15px] relative overflow-hidden">
          <div 
            className="h-full transition-all duration-300" 
            style={{ 
              width: `${damage}%`,
              background: damage > 75 ? '#ff4444' : damage > 50 ? '#ffcc00' : '#00ffcc'
            }}
          ></div>
        </div>
        <div className={`text-[12px] uppercase mt-[5px] font-mono ${damage > 75 ? 'text-[#ff4444] animate-pulse' : 'text-[#666]'}`}>
          DAMAGE {Math.floor(damage)}%
        </div>
      </div>

      {/* Overlays */}
      {status === 'idle' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-30">
          <button onClick={startGame} className="px-8 py-4 bg-[#00ffcc] text-black font-black uppercase tracking-widest text-2xl -skew-x-[10deg] hover:scale-105 transition-transform">
            {isMultiplayer ? 'Ready' : 'Start Race'}
          </button>
        </div>
      )}

      {status === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-none z-30">
          <span className="text-[200px] font-black text-white -skew-x-[15deg] drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">
            {countdown > 0 ? countdown : 'GO!'}
          </span>
        </div>
      )}

      {status === 'finished' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-30">
          <Trophy className={`w-32 h-32 mb-8 ${playerWon ? 'text-[#00ffcc]' : 'text-[#ff4444]'}`} />
          <h2 className="text-[100px] font-black uppercase tracking-tighter mb-4 -skew-x-[10deg]">
            {playerWon ? 'You Win!' : 'You Lose!'}
          </h2>
          {raceTimeMs && (
            <p className="text-4xl text-white font-mono mb-4 -skew-x-[10deg]">
              TIME: <span className="text-[#00ffcc]">{formatTime(raceTimeMs)}</span>
            </p>
          )}
          {playerWon && leagueId && (
            <p className="text-2xl text-[#ffcc00] font-mono mb-8 animate-pulse">
              +${[0, 500, 1500, 5000, 25000][parseInt(leagueId)] || 100} CREDITS
            </p>
          )}
          <div className="flex gap-4">
            <button onClick={startGame} className="px-12 py-6 bg-white text-black font-black uppercase tracking-widest text-2xl -skew-x-[10deg] hover:scale-105 transition-transform">
              Race Again
            </button>
            <button onClick={() => navigate('/')} className="px-12 py-6 bg-[#333] text-white font-black uppercase tracking-widest text-2xl -skew-x-[10deg] hover:scale-105 transition-transform">
              Exit
            </button>
          </div>
        </div>
      )}

      {/* Invisible Controls */}
      <div className="absolute inset-0 flex z-20">
        <button 
          onPointerDown={handleRevDown}
          onPointerUp={handleRevUp}
          onPointerLeave={handleRevUp}
          className="flex-1 outline-none cursor-pointer"
        />
        <button 
          onClick={handleShift}
          disabled={status !== 'racing'}
          className="flex-1 outline-none cursor-pointer disabled:cursor-default"
        />
      </div>

      {/* N2O Button */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
        <button 
          onPointerDown={activateN2O}
          disabled={!n2oReady || status !== 'racing'}
          className={`relative overflow-hidden px-8 py-4 font-black uppercase tracking-widest rounded-full -skew-x-[10deg] transition-all border-4 ${
            isBoosting ? 'bg-[#00ffcc] text-black border-white shadow-[0_0_30px_rgba(0,255,204,0.8)] scale-110' :
            !n2oReady ? 'bg-[#333] text-gray-500 border-[#555]' :
            'bg-[#ff00ff] text-white border-[#ff00ff] hover:bg-[#cc00cc] hover:scale-105 shadow-[0_0_15px_rgba(255,0,255,0.4)]'
          }`}
        >
          <div 
            className="absolute bottom-0 left-0 h-1 bg-white transition-all duration-75"
            style={{ width: `${n2oCooldownProgress}%`, opacity: isBoosting ? 1 : 0.5 }}
          ></div>
          <span className="relative z-10">{isBoosting ? 'BOOSTING!' : !n2oReady ? 'COOLDOWN' : 'NITROUS (N)'}</span>
        </button>
      </div>
      
      {/* Control Hints */}
      <div className="absolute bottom-4 left-4 text-[#666] text-xs uppercase tracking-widest pointer-events-none z-10">Hold Left to Rev</div>
      <div className="absolute bottom-4 right-4 text-[#666] text-xs uppercase tracking-widest pointer-events-none z-10">Tap Right to Shift</div>
    </div>
  );
}
