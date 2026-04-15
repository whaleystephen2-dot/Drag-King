import React, { useState, useEffect } from 'react';
import { Users, Search, Loader2, Bot, Plus, Play } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc, getDocs, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { GoogleGenAI } from '@google/genai';

interface AIBot {
  id: string;
  name: string;
  difficulty: number;
  imageUrl: string;
  carStats: {
    engine: number;
    tires: number;
    transmission: number;
    chassis: string;
    bodyKit: string;
    color: string;
    spoiler: boolean;
  };
}

export default function Multiplayer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'searching' | 'matched'>('idle');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [bots, setBots] = useState<AIBot[]>([]);
  const [isGeneratingBot, setIsGeneratingBot] = useState(false);

  useEffect(() => {
    // Fetch AI Bots
    const q = query(collection(db, 'ai_bots'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const botsData: AIBot[] = [];
      snapshot.forEach((doc) => {
        botsData.push({ id: doc.id, ...doc.data() } as AIBot);
      });
      setBots(botsData);
    });
    return unsubscribe;
  }, []);

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

  const generateBot = async () => {
    setIsGeneratingBot(true);
    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key not found");
      
      const ai = new GoogleGenAI({ apiKey });
      
      // Generate Bot Profile
      const promptText = `Generate a profile for an AI drag racing opponent.
      Return ONLY a valid JSON object with the following structure. Do not include markdown formatting like \`\`\`json.
      {
        "name": "Cool Cyberpunk Racer Name",
        "difficulty": 2, // integer between 1 and 5
        "carPrompt": "A description of their car for an image generator, e.g., 'A sleek cyberpunk muscle car, matte black with neon red accents, 4k'",
        "carStats": {
          "engine": 2, // integer 1-5
          "tires": 2, // integer 1-5
          "transmission": 2, // integer 1-5
          "chassis": "muscle-classic", // one of: 'street-tuner', 'muscle-classic', 'cyber-supercar'
          "bodyKit": "widebody", // one of: 'stock', 'widebody', 'aero'
          "color": "#ff0000", // hex color
          "spoiler": true // boolean
        }
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        config: { temperature: 0.9 }
      });

      const text = response.text || '';
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const botProfile = JSON.parse(cleanText);

      // Generate Car Image
      const imageResponse = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [{ text: botProfile.carPrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "1K"
          }
        },
      });

      let imageUrl = '';
      for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!imageUrl) throw new Error("Failed to generate bot image");

      // Save Bot to Firestore
      await addDoc(collection(db, 'ai_bots'), {
        name: botProfile.name,
        difficulty: botProfile.difficulty,
        imageUrl: imageUrl,
        carStats: botProfile.carStats,
        createdAt: new Date().toISOString()
      });

    } catch (error) {
      console.error("Failed to generate bot:", error);
    } finally {
      setIsGeneratingBot(false);
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6 p-6 overflow-y-auto">
      {/* Online Multiplayer Section */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#111] border-4 border-[#1a1a1a] p-8 text-center min-h-[400px]">
        <Users className="w-24 h-24 mx-auto mb-6 text-[#00ffcc]" />
        <h2 className="text-4xl font-black uppercase tracking-tighter italic -skew-x-[10deg] mb-4">Online Racing</h2>
        
        {status === 'idle' && (
          <>
            <p className="text-gray-400 mb-8">Race head-to-head against other players online. Winner takes all.</p>
            <button 
              onClick={findMatch}
              className="w-full max-w-sm py-4 bg-[#00ffcc] text-black font-black uppercase tracking-widest text-xl -skew-x-[10deg] hover:scale-105 transition-transform"
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

      {/* AI Roster Section */}
      <div className="flex-1 bg-[#111] border-4 border-[#1a1a1a] p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Bot className="w-8 h-8 text-[#ff00ff]" />
            <h2 className="text-3xl font-black uppercase tracking-tighter italic -skew-x-[10deg]">Practice Bots</h2>
          </div>
          <button 
            onClick={generateBot}
            disabled={isGeneratingBot}
            className="px-4 py-2 bg-[#ff00ff] text-white font-black uppercase tracking-widest text-sm -skew-x-[10deg] hover:bg-white hover:text-black transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isGeneratingBot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate Bot
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {bots.length === 0 && !isGeneratingBot && (
            <div className="text-center text-gray-500 py-8 font-mono text-sm uppercase">
              No practice bots available. Generate one to start racing.
            </div>
          )}
          
          {bots.map((bot) => (
            <div key={bot.id} className="bg-[#1a1a1a] border border-[#333] p-4 flex gap-4 items-center -skew-x-[5deg]">
              <div className="skew-x-[5deg] flex-1 flex gap-4 items-center">
                <div className="w-24 h-16 bg-black border-2 border-[#333] overflow-hidden relative">
                  <img src={bot.imageUrl} alt={bot.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-1">
                    <span className="text-[10px] font-mono text-[#ffcc00]">DIFF: {bot.difficulty}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-black uppercase tracking-widest text-white">{bot.name}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[10px] uppercase tracking-widest bg-[#333] px-2 py-0.5 text-gray-400">
                      {bot.carStats.chassis.replace('-', ' ')}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest bg-[#333] px-2 py-0.5 text-gray-400">
                      LVL {bot.carStats.engine + bot.carStats.tires + bot.carStats.transmission}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => navigate(`/race?botId=${bot.id}`)}
                  className="w-12 h-12 bg-[#00ffcc] text-black flex items-center justify-center hover:scale-110 transition-transform"
                >
                  <Play className="w-6 h-6 fill-current" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}