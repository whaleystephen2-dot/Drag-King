import { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Newspaper, Search, Loader2, ExternalLink, Zap } from 'lucide-react';

export default function News() {
  const [query, setQuery] = useState('Latest NHRA drag racing news and tips for beginners');
  const [response, setResponse] = useState<string | null>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    setResponse(null);
    setLinks([]);
    
    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key not found");
      
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: query,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      setResponse(res.text);

      const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        const extractedLinks = chunks
          .filter((chunk: any) => chunk.web?.uri)
          .map((chunk: any) => ({
            uri: chunk.web.uri,
            title: chunk.web.title || 'Source Link',
          }));
        
        // Deduplicate links
        const uniqueLinks = Array.from(new Map(extractedLinks.map(item => [item.uri, item])).values());
        setLinks(uniqueLinks);
      }
    } catch (err: any) {
      setError(err.message || "Failed to search news");
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-fetch on load
  useEffect(() => {
    handleSearch();
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-8 h-full overflow-y-auto">
      <div className="bg-[#111] p-8 border-4 border-[#1a1a1a]">
        <div className="flex items-center gap-4 mb-4">
          <Newspaper className="w-10 h-10 text-[#00ffcc]" />
          <h2 className="text-4xl font-black uppercase tracking-tighter italic -skew-x-[10deg]">Racing News & Intel</h2>
        </div>
        <p className="text-gray-400 font-mono text-sm mb-8 uppercase tracking-widest">Stay up to date with the latest drag racing news and pro tips.</p>
        
        <div className="flex gap-4 mb-2">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-[#1a1a1a] border-2 border-[#333] px-6 py-4 text-white font-mono focus:outline-none focus:border-[#00ffcc] transition-colors -skew-x-[5deg]"
            placeholder="Search for news or tips..."
          />
          <button 
            onClick={handleSearch}
            disabled={isSearching}
            className="px-8 py-4 bg-[#00ffcc] text-black font-black uppercase tracking-widest text-xl -skew-x-[10deg] hover:scale-105 disabled:opacity-50 flex items-center gap-2 transition-transform"
          >
            {isSearching ? <Loader2 className="w-6 h-6 animate-spin" /> : <Search className="w-6 h-6" />}
            Search
          </button>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-500/20 border-l-4 border-red-500 text-red-400 -skew-x-[5deg]">
            <div className="skew-x-[5deg] font-mono">{error}</div>
          </div>
        )}
      </div>

      {isSearching && !response && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-16 h-16 text-[#00ffcc] animate-spin mb-6" />
          <p className="text-2xl font-black uppercase tracking-widest text-[#00ffcc] animate-pulse -skew-x-[10deg]">FETCHING INTEL...</p>
        </div>
      )}

      {response && (
        <div className="bg-[#111] p-8 border-4 border-[#1a1a1a] flex-1">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="w-6 h-6 text-[#ff00ff]" />
            <h3 className="text-xl font-black uppercase tracking-widest text-[#ff00ff] -skew-x-[10deg]">Analysis Report</h3>
          </div>
          
          <div className="prose prose-invert max-w-none mb-12 font-mono text-gray-300 leading-relaxed">
            <p className="whitespace-pre-wrap">{response}</p>
          </div>

          {links.length > 0 && (
            <>
              <h3 className="text-xl font-black uppercase tracking-widest text-[#00ffcc] mb-6 -skew-x-[10deg] border-b-2 border-[#333] pb-2">Verified Sources</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {links.map((link, idx) => (
                  <a 
                    key={idx}
                    href={link.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 bg-[#1a1a1a] border-l-4 border-[#333] hover:border-[#00ffcc] transition-colors group -skew-x-[5deg]"
                  >
                    <div className="skew-x-[5deg] flex items-center gap-4 w-full overflow-hidden">
                      <ExternalLink className="w-5 h-5 text-gray-500 group-hover:text-[#00ffcc] flex-shrink-0" />
                      <span className="font-bold text-sm truncate text-gray-300 group-hover:text-white uppercase tracking-wider">{link.title}</span>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
