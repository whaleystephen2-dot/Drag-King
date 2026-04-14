import { useState, useEffect } from 'react';
import { Trophy, Users, Globe, Clock, Medal, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';

interface LeaderboardRecord {
  id: string;
  userId: string;
  displayName: string;
  leagueId: string;
  timeMs: number;
  createdAt: string;
}

export default function Leaderboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'global' | 'friends'>('global');
  const [selectedLeague, setSelectedLeague] = useState<string>('0');
  const [records, setRecords] = useState<LeaderboardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<string[]>([]);

  // Fetch friends list
  useEffect(() => {
    if (!user) return;
    const fetchFriends = async () => {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFriends(data.friends || []);
      }
    };
    fetchFriends();
  }, [user]);

  // Fetch leaderboard data
  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        let q = query(
          collection(db, 'leaderboards'),
          where('leagueId', '==', selectedLeague),
          orderBy('timeMs', 'asc'),
          limit(100)
        );

        const querySnapshot = await getDocs(q);
        let fetchedRecords: LeaderboardRecord[] = [];
        
        querySnapshot.forEach((doc) => {
          fetchedRecords.push({ id: doc.id, ...doc.data() } as LeaderboardRecord);
        });

        // Filter for friends if active tab is friends
        if (activeTab === 'friends' && user) {
          const friendIds = new Set([...friends, user.uid]);
          fetchedRecords = fetchedRecords.filter(record => friendIds.has(record.userId));
        }

        // Deduplicate: keep only the best time per user
        const bestTimes = new Map<string, LeaderboardRecord>();
        for (const record of fetchedRecords) {
          if (!bestTimes.has(record.userId) || record.timeMs < bestTimes.get(record.userId)!.timeMs) {
            bestTimes.set(record.userId, record);
          }
        }

        // Sort again after deduplication
        const sortedUniqueRecords = Array.from(bestTimes.values()).sort((a, b) => a.timeMs - b.timeMs);
        
        setRecords(sortedUniqueRecords);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [activeTab, selectedLeague, friends, user]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    return `${seconds}.${milliseconds.toString().padStart(3, '0')}s`;
  };

  const leagues = [
    { id: '0', name: 'Amateur Street' },
    { id: '1', name: 'Pro Circuit' },
    { id: '2', name: 'Neon Nights' },
    { id: '3', name: 'Cyber League' },
    { id: '4', name: 'Apex Legends' }
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex items-center gap-4 mb-8">
        <Trophy className="w-10 h-10 text-[#ffcc00]" />
        <h1 className="text-4xl font-black uppercase tracking-tighter italic -skew-x-[10deg]">Hall of Fame</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6 mb-6">
        {/* League Selector */}
        <div className="flex-1 bg-[#111] p-2 rounded-lg border-2 border-[#1a1a1a] flex gap-2 overflow-x-auto">
          {leagues.map((league) => (
            <button
              key={league.id}
              onClick={() => setSelectedLeague(league.id)}
              className={`px-4 py-2 whitespace-nowrap font-bold uppercase tracking-widest text-xs rounded transition-colors -skew-x-[10deg] ${
                selectedLeague === league.id
                  ? 'bg-[#00ffcc] text-black shadow-[0_0_10px_rgba(0,255,204,0.3)]'
                  : 'bg-[#222] text-gray-400 hover:bg-[#333] hover:text-white'
              }`}
            >
              <div className="skew-x-[10deg]">{league.name}</div>
            </button>
          ))}
        </div>

        {/* Tab Selector */}
        <div className="bg-[#111] p-2 rounded-lg border-2 border-[#1a1a1a] flex gap-2">
          <button
            onClick={() => setActiveTab('global')}
            className={`flex items-center gap-2 px-6 py-2 font-bold uppercase tracking-widest text-xs rounded transition-colors -skew-x-[10deg] ${
              activeTab === 'global'
                ? 'bg-[#ff00ff] text-white shadow-[0_0_10px_rgba(255,0,255,0.3)]'
                : 'bg-[#222] text-gray-400 hover:bg-[#333] hover:text-white'
            }`}
          >
            <div className="skew-x-[10deg] flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Global
            </div>
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex items-center gap-2 px-6 py-2 font-bold uppercase tracking-widest text-xs rounded transition-colors -skew-x-[10deg] ${
              activeTab === 'friends'
                ? 'bg-[#ff00ff] text-white shadow-[0_0_10px_rgba(255,0,255,0.3)]'
                : 'bg-[#222] text-gray-400 hover:bg-[#333] hover:text-white'
            }`}
          >
            <div className="skew-x-[10deg] flex items-center gap-2">
              <Users className="w-4 h-4" />
              Friends
            </div>
          </button>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="flex-1 bg-[#111] rounded-2xl border-4 border-[#1a1a1a] overflow-hidden flex flex-col">
        <div className="grid grid-cols-12 gap-4 p-4 bg-[#1a1a1a] border-b-2 border-[#333] font-black uppercase tracking-widest text-xs text-gray-400">
          <div className="col-span-2 text-center">Rank</div>
          <div className="col-span-6">Racer</div>
          <div className="col-span-4 text-right flex items-center justify-end gap-2">
            <Clock className="w-4 h-4" /> Best Time
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-[#00ffcc] gap-4">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="font-mono uppercase tracking-widest text-sm animate-pulse">Loading Records...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
              <Trophy className="w-12 h-12 opacity-20" />
              <span className="font-bold uppercase tracking-widest text-sm">No records found for this league.</span>
            </div>
          ) : (
            records.map((record, index) => (
              <div 
                key={record.id} 
                className={`grid grid-cols-12 gap-4 p-4 items-center rounded-lg border -skew-x-[5deg] transition-all hover:scale-[1.01] ${
                  record.userId === user?.uid 
                    ? 'bg-[#00ffcc]/10 border-[#00ffcc] shadow-[0_0_15px_rgba(0,255,204,0.1)]' 
                    : 'bg-[#151619] border-[#333] hover:border-[#444]'
                }`}
              >
                <div className="col-span-2 flex justify-center skew-x-[5deg]">
                  {index === 0 ? <Medal className="w-6 h-6 text-[#ffcc00]" /> :
                   index === 1 ? <Medal className="w-6 h-6 text-[#c0c0c0]" /> :
                   index === 2 ? <Medal className="w-6 h-6 text-[#cd7f32]" /> :
                   <span className="font-mono text-xl text-gray-500">#{index + 1}</span>}
                </div>
                <div className="col-span-6 font-bold text-lg skew-x-[5deg] truncate">
                  {record.displayName || 'Unknown Racer'}
                  {record.userId === user?.uid && <span className="ml-2 text-[10px] text-[#00ffcc] uppercase tracking-widest border border-[#00ffcc] px-1 rounded">You</span>}
                </div>
                <div className="col-span-4 text-right font-mono text-xl text-[#00ffcc] skew-x-[5deg]">
                  {formatTime(record.timeMs)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
