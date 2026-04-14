import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Image as ImageIcon, Video, Loader2, Car, Wrench, PaintBucket, Zap, Settings2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

interface CarStats {
  engine: number;
  engineName?: string;
  engineDesc?: string;
  tires: number;
  tiresName?: string;
  tiresDesc?: string;
  transmission: number;
  transmissionName?: string;
  transmissionDesc?: string;
  color: string;
  spoiler: boolean;
}

export default function Garage() {
  const { user, currency, updateProfile } = useAuth();
  const [prompt, setPrompt] = useState('A cyberpunk drag racing car, neon green accents, dark background, highly detailed, 4k');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  
  const [stats, setStats] = useState<CarStats>({
    engine: 1,
    engineName: 'Stock Engine',
    engineDesc: 'Standard factory engine.',
    tires: 1,
    tiresName: 'Stock Tires',
    tiresDesc: 'Standard factory tires.',
    transmission: 1,
    transmissionName: 'Stock Transmission',
    transmissionDesc: 'Standard factory transmission.',
    color: '#00ffcc',
    spoiler: false
  });
  const [isSaving, setIsSaving] = useState(false);
  
  const [partPrompt, setPartPrompt] = useState('');
  const [selectedPartType, setSelectedPartType] = useState<'engine' | 'tires' | 'transmission'>('engine');
  const [isGeneratingPart, setIsGeneratingPart] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetchCar = async () => {
      const docRef = doc(db, 'cars', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStats({
          engine: data.engine || 1,
          engineName: data.engineName || 'Stock Engine',
          engineDesc: data.engineDesc || 'Standard factory engine.',
          tires: data.tires || 1,
          tiresName: data.tiresName || 'Stock Tires',
          tiresDesc: data.tiresDesc || 'Standard factory tires.',
          transmission: data.transmission || 1,
          transmissionName: data.transmissionName || 'Stock Transmission',
          transmissionDesc: data.transmissionDesc || 'Standard factory transmission.',
          color: data.color || '#00ffcc',
          spoiler: data.spoiler || false
        });
        if (data.imageUrl) setImageUrl(data.imageUrl);
      }
    };
    fetchCar();
  }, [user]);

  const saveCar = async (newStats: CarStats) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'cars', user.uid), {
        ...newStats,
        imageUrl,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setStats(newStats);
    } catch (e) {
      console.error("Failed to save car", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleVisualMod = async (color: string, spoiler: boolean, cost: number) => {
    if (currency < cost || isSaving) return;
    
    try {
      await updateProfile({ currency: currency - cost });
      await saveCar({ ...stats, color, spoiler });
    } catch (e) {
      console.error("Mod failed", e);
    }
  };

  const PART_GEN_COST = 500;

  const handleGeneratePart = async () => {
    if (currency < PART_GEN_COST) {
      setError(`Not enough credits. Need $${PART_GEN_COST}.`);
      return;
    }
    
    setIsGeneratingPart(true);
    setError(null);
    
    try {
      await updateProfile({ currency: currency - PART_GEN_COST });
      
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key not found");
      
      const ai = new GoogleGenAI({ apiKey });
      
      const promptText = `Generate a cyberpunk drag racing car part.
      Type: ${selectedPartType}
      User Preference: "${partPrompt || 'Make it cool and fast'}"
      Current Level: ${stats[selectedPartType]}
      
      Return ONLY a valid JSON object with the following structure. Do not include markdown formatting like \`\`\`json.
      {
        "name": "Cool Cyberpunk Name",
        "description": "A short, punchy description of what this part does.",
        "levelBonus": 1 // An integer between 1 and 3 representing the stat increase
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        config: { temperature: 0.7 }
      });

      const text = response.text || '';
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanText);
      
      const newLevel = stats[selectedPartType] + (result.levelBonus || 1);
      
      const newStats = {
        ...stats,
        [selectedPartType]: newLevel,
        [`${selectedPartType}Name`]: result.name,
        [`${selectedPartType}Desc`]: result.description
      };
      
      await saveCar(newStats);
      setPartPrompt('');
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate part");
      await updateProfile({ currency: currency + PART_GEN_COST });
    } finally {
      setIsGeneratingPart(false);
    }
  };

  const IMAGE_GEN_COST = 500;
  const VIDEO_GEN_COST = 1500;

  const handleGenerateImage = async () => {
    if (currency < IMAGE_GEN_COST) {
      setError(`Not enough credits. Need $${IMAGE_GEN_COST}.`);
      return;
    }
    
    setIsGeneratingImage(true);
    setError(null);
    setImageUrl(null);
    setVideoUrl(null);
    
    try {
      await updateProfile({ currency: currency - IMAGE_GEN_COST });
      
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key not found");
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "1K"
          }
        },
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64 = part.inlineData.data;
          setBase64Image(base64);
          const newImageUrl = `data:image/png;base64,${base64}`;
          setImageUrl(newImageUrl);
          
          if (user) {
            await setDoc(doc(db, 'cars', user.uid), {
              imageUrl: newImageUrl,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
          
          foundImage = true;
          break;
        }
      }
      if (!foundImage) throw new Error("No image returned from model");
    } catch (err: any) {
      setError(err.message || "Failed to generate image");
      // Refund on failure
      await updateProfile({ currency: currency + IMAGE_GEN_COST });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!base64Image) return;
    if (currency < VIDEO_GEN_COST) {
      setError(`Not enough credits. Need $${VIDEO_GEN_COST}.`);
      return;
    }
    
    setIsGeneratingVideo(true);
    setError(null);
    
    try {
      await updateProfile({ currency: currency - VIDEO_GEN_COST });
      
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key not found");
      
      const ai = new GoogleGenAI({ apiKey });
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-lite-generate-preview',
        prompt: 'The car revs its engine, neon lights glowing, ready to race',
        image: {
          imageBytes: base64Image,
          mimeType: 'image/png',
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!downloadLink) throw new Error("No video URI returned");

      const response = await fetch(downloadLink, {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
        },
      });
      
      const blob = await response.blob();
      setVideoUrl(URL.createObjectURL(blob));
    } catch (err: any) {
      setError(err.message || "Failed to generate video");
      // Refund on failure
      await updateProfile({ currency: currency + VIDEO_GEN_COST });
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 h-full overflow-y-auto">
      
      {/* Left Column: Customization */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        <div className="bg-[#111] p-6 rounded-2xl border-4 border-[#1a1a1a]">
          <h2 className="text-2xl font-black uppercase tracking-tighter italic -skew-x-[10deg] mb-6 text-[#00ffcc]">Performance</h2>
          
          <div className="space-y-4 mb-6">
            <div className="bg-[#1a1a1a] p-4 border border-[#333] -skew-x-[5deg]">
              <div className="skew-x-[5deg]">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-5 h-5 text-[#ffcc00]" />
                  <span className="font-bold uppercase tracking-widest text-[#ffcc00]">{stats.engineName}</span>
                  <span className="text-xs bg-[#333] px-2 py-1 rounded ml-auto">Lvl {stats.engine}</span>
                </div>
                <p className="text-xs text-gray-400">{stats.engineDesc}</p>
              </div>
            </div>

            <div className="bg-[#1a1a1a] p-4 border border-[#333] -skew-x-[5deg]">
              <div className="skew-x-[5deg]">
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="w-5 h-5 text-[#00ffcc]" />
                  <span className="font-bold uppercase tracking-widest text-[#00ffcc]">{stats.tiresName}</span>
                  <span className="text-xs bg-[#333] px-2 py-1 rounded ml-auto">Lvl {stats.tires}</span>
                </div>
                <p className="text-xs text-gray-400">{stats.tiresDesc}</p>
              </div>
            </div>

            <div className="bg-[#1a1a1a] p-4 border border-[#333] -skew-x-[5deg]">
              <div className="skew-x-[5deg]">
                <div className="flex items-center gap-2 mb-1">
                  <Settings2 className="w-5 h-5 text-[#ff00ff]" />
                  <span className="font-bold uppercase tracking-widest text-[#ff00ff]">{stats.transmissionName}</span>
                  <span className="text-xs bg-[#333] px-2 py-1 rounded ml-auto">Lvl {stats.transmission}</span>
                </div>
                <p className="text-xs text-gray-400">{stats.transmissionDesc}</p>
              </div>
            </div>
          </div>

          <div className="border-t-2 border-[#333] pt-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">AI Part Fabrication</h3>
            <div className="flex gap-2 mb-4">
              {(['engine', 'tires', 'transmission'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setSelectedPartType(type)}
                  className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest transition-colors border-2 ${selectedPartType === type ? 'border-[#00ffcc] text-[#00ffcc] bg-[#00ffcc]/10' : 'border-[#333] text-gray-500 hover:border-gray-500'}`}
                >
                  {type}
                </button>
              ))}
            </div>
            <textarea
              value={partPrompt}
              onChange={(e) => setPartPrompt(e.target.value)}
              placeholder="e.g., I want a high-torque engine for quick acceleration..."
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00ffcc] transition-colors resize-none text-sm mb-4"
              rows={2}
            />
            <button 
              onClick={handleGeneratePart}
              disabled={isGeneratingPart || currency < PART_GEN_COST || isSaving}
              className="w-full py-3 bg-[#00ffcc] text-black font-black uppercase tracking-widest rounded-lg hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2 -skew-x-[10deg] transition-colors"
            >
              {isGeneratingPart ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wrench className="w-5 h-5" />}
              Fabricate Part (${PART_GEN_COST})
            </button>
          </div>
        </div>

        <div className="bg-[#111] p-6 rounded-2xl border-4 border-[#1a1a1a]">
          <h2 className="text-2xl font-black uppercase tracking-tighter italic -skew-x-[10deg] mb-6 text-[#ff00ff]">Visuals</h2>
          
          <div className="space-y-6">
            <div className="bg-[#1a1a1a] p-4 border border-[#333] -skew-x-[5deg]">
              <div className="skew-x-[5deg]">
                <div className="flex items-center gap-2 mb-4">
                  <PaintBucket className="w-5 h-5 text-[#ff00ff]" />
                  <span className="font-bold uppercase tracking-widest">Paint Job ($200)</span>
                </div>
                <div className="flex gap-2 mb-4">
                  {['#00ffcc', '#ff00ff', '#ffcc00', '#ff4444', '#ffffff', '#000000'].map(c => (
                    <button 
                      key={c}
                      onClick={() => handleVisualMod(c, stats.spoiler, 200)}
                      disabled={currency < 200 || isSaving}
                      className={`w-8 h-8 rounded-full border-2 ${stats.color === c ? 'border-white scale-110' : 'border-[#333]'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#1a1a1a] p-4 border border-[#333] -skew-x-[5deg]">
              <div className="skew-x-[5deg]">
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase tracking-widest">Spoiler ($500)</span>
                  <button 
                    onClick={() => handleVisualMod(stats.color, !stats.spoiler, 500)}
                    disabled={currency < 500 || isSaving}
                    className={`px-4 py-2 font-bold uppercase tracking-widest text-xs transition-colors ${stats.spoiler ? 'bg-[#ff00ff] text-white' : 'bg-[#333] text-gray-400'}`}
                  >
                    {stats.spoiler ? 'Remove' : 'Install'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: AI Generation & Preview */}
      <div className="w-full lg:w-2/3 flex flex-col gap-6">
        <div className="bg-[#111] p-6 rounded-2xl border-4 border-[#1a1a1a]">
          <h2 className="text-2xl font-black uppercase tracking-tighter italic -skew-x-[10deg] mb-2">AI Design Studio</h2>
          <p className="text-gray-400 text-sm mb-6">Generate a custom look for your car using AI.</p>
          
          <div className="flex gap-4 mb-6">
            <input 
              type="text" 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00ffcc] transition-colors"
              placeholder="Describe your car..."
            />
            <button 
              onClick={handleGenerateImage}
              disabled={isGeneratingImage || isGeneratingVideo || currency < IMAGE_GEN_COST}
              className="px-6 py-3 bg-white text-black font-black uppercase tracking-widest rounded-lg hover:bg-gray-200 disabled:opacity-50 flex items-center gap-2 -skew-x-[10deg]"
            >
              {isGeneratingImage ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
              Generate (${IMAGE_GEN_COST})
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-500/20 border border-red-500 text-red-400 rounded-lg mb-6">
              {error}
            </div>
          )}
        </div>

        <div className="flex-1 bg-[#111] rounded-2xl border-4 border-[#1a1a1a] overflow-hidden relative flex items-center justify-center min-h-[400px]">
          {!imageUrl && !isGeneratingImage && (
            <div className="text-gray-600 flex flex-col items-center gap-4">
              <Car className="w-24 h-24 opacity-50" />
              <span className="uppercase tracking-widest text-sm font-bold">Your car will appear here</span>
            </div>
          )}

          {isGeneratingImage && (
            <div className="text-[#00ffcc] flex flex-col items-center gap-4">
              <Loader2 className="w-16 h-16 animate-spin" />
              <span className="uppercase tracking-widest text-sm font-bold animate-pulse">Designing vehicle...</span>
            </div>
          )}

          {imageUrl && !videoUrl && !isGeneratingImage && (
            <div className="relative w-full h-full">
              <img src={imageUrl} alt="Generated Car" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute bottom-6 right-6">
                <button 
                  onClick={handleGenerateVideo}
                  disabled={isGeneratingVideo || currency < VIDEO_GEN_COST}
                  className="px-6 py-4 bg-[#00ffcc] text-black font-black uppercase tracking-widest rounded-full shadow-[0_0_20px_rgba(0,255,204,0.4)] hover:scale-105 transition-transform disabled:opacity-50 flex items-center gap-2 -skew-x-[10deg]"
                >
                  {isGeneratingVideo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
                  {isGeneratingVideo ? 'Animating...' : `Animate Car ($${VIDEO_GEN_COST})`}
                </button>
              </div>
            </div>
          )}

          {videoUrl && (
            <video src={videoUrl} autoPlay loop controls className="w-full h-full object-cover" />
          )}
        </div>
      </div>
    </div>
  );
}
