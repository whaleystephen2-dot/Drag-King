import React, { useState, useEffect } from 'react';
import { Users, Search, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function Multiplayer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'searching' | 'matched'>('idle');
  const [matchId, setMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !matchId) return;

    const unsubscribe = onSnapshot(doc(db, 'matchmaking', matchId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === 'matched' && data.raceId) {
          setStatus('matched');
          setTimeout(() => {
            navigate(`/race?id=${data.raceId}`);
          }, 2000);
        }
      }
    });

    return unsubscribe;
  }, [matchId, user, navigate]);

  const findMatch = async () => {
    if (!user) return;
    setStatus('searching');

    try {
      // Look for waiting matches
      const q = query(collection(db, 'matchmaking'), where('status', '==', 'waiting'));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // Join existing match
        const matchDoc = querySnapshot.docs[0];
        
        // Create race
        const raceRef = await addDoc(collection(db, 'races'), {
          status: 'countdown',
          player1: matchDoc.data().player1,
          player2: user.uid,
          player1Progress: 0,
          player2Progress: 0,
          createdAt: new Date().toISOString()
        });

        // Update match
        await updateDoc(doc(db, 'matchmaking', matchDoc.id), {
          status: 'matched',
          player2: user.uid,
          raceId: raceRef.id
        });

        setMatchId(matchDoc.id);
      } else {
        // Create new match
        const matchRef = await addDoc(collection(db, 'matchmaking'), {
          status: 'waiting',
          player1: user.uid,
          createdAt: new Date().toISOString()
        });
        setMatchId(matchRef.id);
      }
    } catch (error) {
      console.error('Error finding match:', error);
      setStatus('idle');
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#111] border-4 border-[#1a1a1a] p-8 text-center">
        <Users className="w-24 h-24 mx-auto mb-6 text-[#00ffcc]" />
        <h2 className="text-4xl font-black uppercase tracking-tighter italic -skew-x-[10deg] mb-4">Online Racing</h2>
        
        {status === 'idle' && (
          <>
            <p className="text-gray-400 mb-8">Race head-to-head against other players online. Winner takes all.</p>
            <button 
              onClick={findMatch}
              className="w-full py-4 bg-[#00ffcc] text-black font-black uppercase tracking-widest text-xl -skew-x-[10deg] hover:scale-105 transition-transform"
            >
              Find Match
            </button>
          </>
        )}

        {status === 'searching' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-[#00ffcc] animate-spin mb-4" />
            <p className="text-xl font-mono text-[#00ffcc] animate-pulse">SEARCHING FOR OPPONENT...</p>
          </div>
        )}

        {status === 'matched' && (
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 bg-[#00ffcc] rounded-full flex items-center justify-center mb-4">
              <Users className="w-12 h-12 text-black" />
            </div>
            <p className="text-2xl font-black uppercase tracking-widest text-white -skew-x-[10deg]">OPPONENT FOUND!</p>
            <p className="text-gray-400 mt-2">Starting race...</p>
          </div>
        )}
      </div>
    </div>
  );
}