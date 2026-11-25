import React, { useState } from 'react';
import axios from 'axios';
import { Upload, ShieldCheck, AlertTriangle, Compass, Cpu, Layers, Play, Pause } from 'lucide-react';
import LunarScene from './components/LunarScene';

const API_URL = 'http://127.0.0.1:8000/api/analyze';

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Mission parameters
  const [pixelScale, setPixelScale] = useState(0.5);
  const [sunElevation, setSunElevation] = useState(12.0);
  const [maxBoulderH, setMaxBoulderH] = useState(0.5);
  const [maxSlope, setMaxSlope] = useState(12.0);

  // 3D viewport toggles
  const [showHazardOverlay, setShowHazardOverlay] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [animateDescent, setAnimateDescent] = useState(true);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('pixel_scale_m', pixelScale);
      formData.append('sun_elevation_deg', sunElevation);
      formData.append('max_boulder_height_m', maxBoulderH);
      formData.append('max_slope_deg', maxSlope);

      const res = await axios.post(API_URL, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setData(res.data);
    } catch (err) {
      setError('Backend connection failed. Ensure FastAPI is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#05080f] text-slate-200 select-none overflow-hidden">
      {/* Top Telemetry Bar */}
      <header className="h-12 px-4 border-b border-slate-800/80 bg-slate-950/90 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold tracking-widest text-sm text-white">MAPX</span>
          <span className="text-xs text-slate-400 font-mono hidden sm:inline">
            | SW-1 LUNAR BOULDER HAZARD MAPPER • TEAM 24/4
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHazardOverlay((v) => !v)}
            className={`px-2.5 py-1 rounded text-xs font-mono border transition ${showHazardOverlay
              ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300'
              : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
          >
            <Layers className="w-3.5 h-3.5 inline mr-1" />
            HAZARD GRID
          </button>
          <button
            onClick={() => setWireframe((v) => !v)}
            className={`px-2.5 py-1 rounded text-xs font-mono border transition ${wireframe
              ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300'
              : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
          >
            MESH
          </button>
          <button
            onClick={() => setAnimateDescent((v) => !v)}
            className="px-2.5 py-1 rounded text-xs font-mono border bg-slate-900 border-slate-700 text-slate-300 hover:border-cyan-400"
          >
            {animateDescent ? <Pause className="w-3.5 h-3.5 inline mr-1" /> : <Play className="w-3.5 h-3.5 inline mr-1" />}
            DESCENT
          </button>
        </div>
      </header>

      {/* Main 3-Column Mission Control Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Control Panel */}
        <aside className="w-72 border-r border-slate-800/80 bg-slate-950/85 p-4 flex flex-col gap-4 overflow-y-auto z-10">
          <div>
            <h2 className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-2">
              1. Orbital Image Ingestion
            </h2>
            <label className="flex flex-col items-center justify-center border border-dashed border-cyan-500/50 bg-cyan-950/20 hover:bg-cyan-950/40 rounded-lg p-4 cursor-pointer transition">
              <Upload className="w-6 h-6 text-cyan-400 mb-1.5" />
              <span className="text-xs font-medium text-cyan-200">
                {loading ? 'Analyzing Terrain...' : 'Upload LRO / OHRC Image'}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">PNG, JPG (Max 1024px auto-scale)</span>
              <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </label>
            {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">
              2. Physics & Lander Limits
            </h2>

            <div className="text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">Pixel Scale (m/px)</span>
                <span className="font-mono text-cyan-300">{pixelScale}m</span>
              </div>
              <input type="range" min="0.1" max="2.0" step="0.1" value={pixelScale}
                onChange={(e) => setPixelScale(parseFloat(e.target.value))} className="w-full accent-cyan-400" />
            </div>

            <div className="text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">Solar Elevation (θ)</span>
                <span className="font-mono text-amber-300">{sunElevation}°</span>
              </div>
              <input type="range" min="2" max="45" step="1" value={sunElevation}
                onChange={(e) => setSunElevation(parseFloat(e.target.value))} className="w-full accent-amber-400" />
            </div>

            <div className="text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">Max Rock Clearance</span>
                <span className="font-mono text-rose-300">{maxBoulderH}m</span>
              </div>
              <input type="range" min="0.2" max="2.0" step="0.1" value={maxBoulderH}
                onChange={(e) => setMaxBoulderH(parseFloat(e.target.value))} className="w-full accent-rose-400" />
            </div>

            <div className="text-xs">
              <div className="flex justify-between mb-1">
                <span className="text-slate-400">Max Safe Slope</span>
                <span className="font-mono text-emerald-300">{maxSlope}°</span>
              </div>
              <input type="range" min="5" max="25" step="1" value={maxSlope}
                onChange={(e) => setMaxSlope(parseFloat(e.target.value))} className="w-full accent-emerald-400" />
            </div>
          </div>

          {data?.enhanced_image_b64 && (
            <div className="border-t border-slate-800 pt-3">
              <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                CLAHE Enhanced Preview
              </h2>
              <img
                src={data.enhanced_image_b64}
                alt="CLAHE Enhanced"
                className="w-full rounded border border-slate-700 object-cover"
              />
            </div>
          )}
        </aside>

        {/* Center 3D WebGL Viewport */}
        <main className="flex-1 relative bg-[#04070d]">
          <LunarScene
            data={data}
            showHazardOverlay={showHazardOverlay}
            wireframe={wireframe}
            animateDescent={animateDescent}
          />
          <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-400 pointer-events-none">
            Drag to Orbit • Scroll to Zoom • Cyan Line: A* Rover Route • Green Ring: Safe LZ-1
          </div>
        </main>

        {/* Right Telemetry & AI Copilot Panel */}
        <aside className="w-80 border-l border-slate-800/80 bg-slate-950/85 p-4 flex flex-col gap-4 overflow-y-auto z-10">
          {/* Safe Zone Clearance */}
          <div className="p-3 rounded-lg bg-slate-900/90 border border-emerald-500/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> LANDING CLEARANCE
              </span>
              <span className="text-lg font-bold font-mono text-emerald-300">
                {data ? `${data.safe_zone.clearance_pct}%` : '--%'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs font-mono">
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <div className="text-[10px] text-slate-400">SAFE RADIUS</div>
                <div className="text-emerald-300">{data ? `${data.safe_zone.radius_m} m` : '--'}</div>
              </div>
              <div className="bg-slate-950 p-2 rounded border border-slate-800">
                <div className="text-[10px] text-slate-400">LZ SLOPE</div>
                <div className="text-cyan-300">{data ? `${data.safe_zone.slope_deg}°` : '--'}</div>
              </div>
            </div>
          </div>

          {/* Hazard Breakdown */}
          <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
            <div className="text-xs font-mono text-slate-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> TERRAIN HAZARD METRICS
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Boulders Detected</span>
                <span className="text-white font-bold">{data ? data.boulder_count : 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Peak Boulder Height</span>
                <span className="text-rose-400 font-bold">{data ? `${data.max_boulder_height_m} m` : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-400">Safe Terrain</span>
                <span>{data ? `${data.stats.safe_pct}%` : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-400">Caution Terrain</span>
                <span>{data ? `${data.stats.caution_pct}%` : '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-rose-400">Unsafe Terrain</span>
                <span>{data ? `${data.stats.unsafe_pct}%` : '--'}</span>
              </div>
            </div>
          </div>

          {/* Gemini AI Mission Copilot */}
          <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/40 flex-1">
            <div className="text-xs font-mono text-cyan-300 mb-2 flex items-center gap-1.5">
              <Cpu className="w-4 h-4" /> AI MISSION COPILOT
            </div>
            <p className="text-xs leading-relaxed text-slate-200">
              {data
                ? data.mission_briefing
                : 'Upload any lunar orbital image (NASA LRO NAC or Chandrayaan-2 OHRC) to run CLAHE enhancement, YOLOv11 boulder detection, shadow-height physics, and 3D landing simulation.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}