import { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Newspaper, Search, Loader2, ExternalLink } from 'lucide-react';

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
        model: "gemini-3-flash-preview",
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

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-8 h-full">
      <div className="bg-[#111] p-8 rounded-2xl border border-[#333]">
        <div className="flex items-center gap-3 mb-2">
          <Newspaper className="w-6 h-6 text-[#FFFF00]" />
          <h2 className="text-2xl font-bold uppercase tracking-widest">Racing News & Tips</h2>
        </div>
        <p className="text-gray-400 text-sm mb-6">Stay up to date with the latest drag racing news and pro tips.</p>
        
        <div className="flex gap-4 mb-6">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-[#1a1a1a] border border-[#333] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#FFFF00] transition-colors"
            placeholder="Search for news or tips..."
          />
          <button 
            onClick={handleSearch}
            disabled={isSearching}
            className="px-6 py-3 bg-[#FFFF00] text-black font-bold uppercase tracking-widest rounded-lg hover:bg-[#CCCC00] disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            Search
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500 text-red-400 rounded-lg mb-6">
            {error}
          </div>
        )}
      </div>

      {response && (
        <div className="bg-[#111] p-8 rounded-2xl border border-[#333] flex-1 overflow-y-auto">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Report</h3>
          <div className="prose prose-invert max-w-none mb-8">
            <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{response}</p>
          </div>

          {links.length > 0 && (
            <>
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Sources</h3>
              <div className="flex flex-col gap-2">
                {links.map((link, idx) => (
                  <a 
                    key={idx}
                    href={link.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-[#1a1a1a] border border-[#333] rounded-lg hover:border-[#FFFF00] transition-colors group"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-[#FFFF00] flex-shrink-0" />
                    <span className="font-bold text-sm truncate text-gray-300 group-hover:text-white">{link.title}</span>
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
