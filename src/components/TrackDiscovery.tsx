import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GoogleGenAI } from '@google/genai';
import { Search, MapPin, Loader2, Navigation, Flag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Fix Leaflet default icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom neon icon for drag strips
const neonIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface DragStrip {
  id: string;
  name: string;
  lat: number;
  lng: number;
  location: string;
  description: string;
  length: string;
}

// Component to recenter map when results change
function MapUpdater({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function TrackDiscovery() {
  const [searchQuery, setSearchQuery] = useState('California');
  const [isSearching, setIsSearching] = useState(false);
  const [dragStrips, setDragStrips] = useState<DragStrip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([36.7783, -119.4179]); // Default to CA
  const [mapZoom, setMapZoom] = useState(6);
  const navigate = useNavigate();

  const discoverDragStrips = async (query: string) => {
    setIsSearching(true);
    setError(null);
    
    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("API Key not found");
      
      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `Find up to 10 real-world drag racing strips in or near "${query}".
      Return ONLY a valid JSON array of objects with the following structure. Do not include markdown formatting like \`\`\`json. Just the raw JSON array.
      [
        {
          "id": "unique-string",
          "name": "Track Name",
          "lat": 12.34,
          "lng": -56.78,
          "location": "City, State/Country",
          "description": "Short description of the track.",
          "length": "e.g., 1/4 mile"
        }
      ]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.2,
        }
      });

      const text = response.text || '';
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const results: DragStrip[] = JSON.parse(cleanText);
      
      if (results && results.length > 0) {
        setDragStrips(results);
        // Calculate average lat/lng to center map
        const avgLat = results.reduce((sum, track) => sum + track.lat, 0) / results.length;
        const avgLng = results.reduce((sum, track) => sum + track.lng, 0) / results.length;
        setMapCenter([avgLat, avgLng]);
        setMapZoom(6);
      } else {
        setError("No drag strips found in that area.");
        setDragStrips([]);
      }
      
    } catch (err: any) {
      console.error(err);
      setError("Failed to discover drag strips. Try a different location.");
    } finally {
      setIsSearching(false);
    }
  };

  // Initial load
  useEffect(() => {
    discoverDragStrips('California');
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      discoverDragStrips(searchQuery);
    }
  };

  const handleRaceHere = (strip: DragStrip) => {
    navigate(`/race?trackName=${encodeURIComponent(strip.name)}&location=${encodeURIComponent(strip.location)}`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter italic -skew-x-[10deg] text-[#00ffcc] drop-shadow-[0_0_10px_rgba(0,255,204,0.5)]">
            Global Track Discovery
          </h1>
          <p className="text-gray-400 mt-1 uppercase tracking-widest text-sm">
            Locate real-world drag strips via AI satellite uplink
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex w-full md:w-auto gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search region (e.g., Texas, UK)..."
              className="w-full bg-[#111] border-2 border-[#333] rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-[#00ffcc] transition-colors -skew-x-[5deg]"
            />
          </div>
          <button
            type="submit"
            disabled={isSearching}
            className="px-6 py-3 bg-[#00ffcc] text-black font-black uppercase tracking-widest rounded-lg hover:bg-white disabled:opacity-50 flex items-center gap-2 -skew-x-[10deg] transition-colors"
          >
            {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Navigation className="w-5 h-5" />}
            Scan
          </button>
        </form>
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border-l-4 border-red-500 text-red-400 -skew-x-[5deg]">
          <p className="skew-x-[5deg] font-bold uppercase tracking-widest">{error}</p>
        </div>
      )}

      <div className="flex-1 bg-[#111] rounded-2xl border-4 border-[#1a1a1a] overflow-hidden relative min-h-[500px]">
        {isSearching && (
          <div className="absolute inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-[#00ffcc]">
            <Loader2 className="w-16 h-16 animate-spin mb-4" />
            <span className="uppercase tracking-widest font-black text-xl animate-pulse">Scanning Satellite Data...</span>
          </div>
        )}
        
        <MapContainer 
          center={mapCenter} 
          zoom={mapZoom} 
          style={{ height: '100%', width: '100%', zIndex: 1 }}
          className="grayscale invert contrast-125 hue-rotate-180" // Cyberpunk map effect
        >
          <MapUpdater center={mapCenter} zoom={mapZoom} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {dragStrips.map((strip) => (
            <Marker key={strip.id} position={[strip.lat, strip.lng]} icon={neonIcon}>
              <Popup className="cyberpunk-popup">
                <div className="p-1">
                  <h3 className="font-black uppercase tracking-tighter text-lg text-[#8a2be2] mb-1 leading-tight">
                    {strip.name}
                  </h3>
                  <div className="flex items-center gap-1 text-gray-600 text-xs font-bold uppercase tracking-widest mb-2">
                    <MapPin className="w-3 h-3" />
                    {strip.location}
                  </div>
                  <p className="text-sm text-gray-700 mb-2 leading-snug">
                    {strip.description}
                  </p>
                  <div className="flex justify-between items-center mt-3">
                    <div className="inline-block bg-[#8a2be2] text-white text-xs font-bold uppercase tracking-widest px-2 py-1 rounded">
                      Length: {strip.length}
                    </div>
                    <button 
                      onClick={() => handleRaceHere(strip)}
                      className="bg-[#00ffcc] text-black text-xs font-black uppercase tracking-widest px-3 py-1 rounded hover:bg-white transition-colors flex items-center gap-1 -skew-x-[10deg]"
                    >
                      <Flag className="w-3 h-3" />
                      Race Here
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      
      {/* Custom CSS for the Leaflet Popup to match theme */}
      <style>{`
        .cyberpunk-popup .leaflet-popup-content-wrapper {
          background: #ffffff;
          border: 2px solid #8a2be2;
          border-radius: 0;
          transform: skewX(-2deg);
        }
        .cyberpunk-popup .leaflet-popup-tip {
          background: #ffffff;
          border: 2px solid #8a2be2;
        }
        .cyberpunk-popup .leaflet-popup-close-button {
          color: #8a2be2 !important;
        }
      `}</style>
    </div>
  );
}
