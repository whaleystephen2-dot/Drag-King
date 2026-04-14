import { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Play, Square, Loader2, Music } from 'lucide-react';

export default function Radio() {
  const [prompt, setPrompt] = useState('A high-energy cyberpunk synthwave track with a fast driving beat, perfect for a drag race');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleGenerateMusic = async () => {
    setIsGenerating(true);
    setError(null);
    setAudioUrl(null);
    setLyrics(null);
    
    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key not found");
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContentStream({
        model: "lyria-3-clip-preview",
        contents: prompt,
        config: {
          responseModalities: ['AUDIO']
        }
      });

      let audioBase64 = "";
      let generatedLyrics = "";
      let mimeType = "audio/wav";

      for await (const chunk of response) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!audioBase64 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioBase64 += part.inlineData.data;
          }
          if (part.text && !generatedLyrics) {
            generatedLyrics = part.text;
          }
        }
      }

      if (generatedLyrics) setLyrics(generatedLyrics);

      if (audioBase64) {
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        setAudioUrl(URL.createObjectURL(blob));
      } else {
        throw new Error("No audio returned from model");
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate music");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-8 h-full">
      <div className="bg-[#111] p-8 rounded-2xl border-4 border-[#1a1a1a] shadow-2xl relative overflow-hidden">
        {/* Cyberpunk background accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF00FF] opacity-5 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-2 relative z-10">
          <Music className="w-8 h-8 text-[#FF00FF] drop-shadow-[0_0_8px_rgba(255,0,255,0.8)]" />
          <h2 className="text-4xl font-black uppercase tracking-tighter italic -skew-x-[10deg] text-white">Neon Radio</h2>
        </div>
        <p className="text-gray-400 text-sm mb-8 uppercase tracking-widest font-bold relative z-10">Generate the perfect soundtrack for your next race</p>
        
        <div className="flex flex-col gap-4 mb-6 relative z-10">
          <textarea 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full bg-[#0a0a0a] border-2 border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#FF00FF] transition-colors resize-none font-mono text-sm shadow-inner"
            placeholder="Describe the track..."
          />
          <button 
            onClick={handleGenerateMusic}
            disabled={isGenerating}
            className="py-4 bg-[#FF00FF] text-black font-black uppercase tracking-widest rounded-lg hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all -skew-x-[10deg] shadow-[0_0_15px_rgba(255,0,255,0.4)] hover:shadow-[0_0_25px_rgba(255,255,255,0.6)]"
          >
            <div className="skew-x-[10deg] flex items-center gap-2">
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
              {isGenerating ? 'Composing...' : 'Generate Track'}
            </div>
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-500/20 border-l-4 border-red-500 text-red-400 -skew-x-[5deg] relative z-10">
            <p className="skew-x-[5deg] font-bold uppercase tracking-widest">{error}</p>
          </div>
        )}
      </div>

      {audioUrl && (
        <div className="bg-[#111] p-8 rounded-2xl border-4 border-[#1a1a1a] flex flex-col items-center shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#FF00FF] to-transparent opacity-50" />
           
          <div className="w-full mb-8 relative z-10">
            <div className="h-32 w-full bg-[#0a0a0a] rounded-lg border-2 border-[#333] flex items-center justify-center overflow-hidden relative shadow-inner">
              {/* Fake visualizer */}
              <div className="flex items-end gap-1 h-24 px-4 w-full">
                {[...Array(40)].map((_, i) => (
                  <div 
                    key={i} 
                    className="flex-1 bg-[#FF00FF] rounded-t-sm opacity-80"
                    style={{ 
                      height: `${Math.max(10, Math.random() * 100)}%`,
                      animation: `pulse ${0.3 + Math.random() * 0.5}s infinite alternate ease-in-out`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          
          <audio ref={audioRef} src={audioUrl} controls autoPlay className="w-full mb-6 relative z-10" />
          
          {lyrics && (
            <div className="w-full mt-4 p-6 bg-[#0a0a0a] rounded-lg border-2 border-[#333] relative z-10 shadow-inner">
              <h3 className="text-xs font-black uppercase tracking-widest text-[#FF00FF] mb-4">Metadata / Lyrics</h3>
              <p className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">{lyrics}</p>
            </div>
          )}
        </div>
      )}
      
      <style>{`
        @keyframes pulse {
          0% { transform: scaleY(0.8); opacity: 0.6; }
          100% { transform: scaleY(1.2); opacity: 1; }
        }
        audio::-webkit-media-controls-panel {
          background-color: #1a1a1a;
        }
        audio::-webkit-media-controls-play-button,
        audio::-webkit-media-controls-mute-button {
          background-color: #FF00FF;
          border-radius: 50%;
        }
        audio::-webkit-media-controls-current-time-display,
        audio::-webkit-media-controls-time-remaining-display {
          color: #fff;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
}
