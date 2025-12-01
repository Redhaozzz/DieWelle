
import React, { useState } from 'react';
import { GameStats, TimeScale } from '../types';
import { STATE_COLORS, CONFIG, WORLD_WIDTH, WORLD_HEIGHT } from '../constants';
import { audioService } from '../services/audioService';

interface GameUIProps {
  stats: GameStats;
  timeScale: TimeScale;
  setTimeScale: (s: TimeScale) => void;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
}

const GameUI: React.FC<GameUIProps> = ({ stats, timeScale, setTimeScale, minimapRef }) => {
  const [bgmOn, setBgmOn] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);

  // Calculate dynamic total population (Level 1 has 30, Level 2 has 40, etc.)
  // FactionA/B in stats includes Aware + Persuaded + Believer
  const totalPopulation = stats.normal + stats.factionA + stats.factionB;
  
  const pctA = Math.floor((stats.factionA / totalPopulation) * 100) || 0;
  const pctB = Math.floor((stats.factionB / totalPopulation) * 100) || 0;
  
  // Game Over Logic
  // 1. Everyone is a Believer (No Normal, No Aware, No Persuaded)
  const allConverted = (stats.believerA + stats.believerB) === totalPopulation;
  
  // 2. Early Victory: Enemy Faction Eliminated (Level 2 specific context)
  // We use a small threshold to prevent instant win at start (time > 5s)
  const enemyEliminated = stats.timeElapsed > 5 && stats.factionB === 0 && stats.factionA > 0;
  
  // 3. Early Defeat: Player Faction Eliminated
  const playerEliminated = stats.timeElapsed > 5 && stats.factionA === 0 && stats.factionB > 0;

  const isGameOver = allConverted || enemyEliminated || playerEliminated;
  const isVictory = (allConverted && stats.believerA > stats.believerB) || enemyEliminated;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleToggleBgm = async () => {
    const newState = await audioService.toggleBgm();
    setBgmOn(newState);
    if (sfxOn) audioService.playSfx('ui_click');
  };

  const handleToggleSfx = async () => {
    const newState = await audioService.toggleSfx();
    setSfxOn(newState);
    if (newState) audioService.playSfx('ui_click');
  };

  const handleTimeScale = (s: TimeScale) => {
    setTimeScale(s);
    if (sfxOn) audioService.playSfx('ui_click');
  }

  const minimapWidth = 160;
  const minimapHeight = minimapWidth * (WORLD_HEIGHT / WORLD_WIDTH);

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
      
      {/* TOP ROW */}
      <div className="flex justify-between items-start w-full">
        
        {/* Stats Panel */}
        <div className="bg-slate-900/80 backdrop-blur-sm p-3 rounded-xl border border-slate-700 shadow-xl pointer-events-auto w-48">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold text-white">Influence</h2>
            <div className="text-xs text-slate-400 font-mono">T:{formatTime(stats.timeElapsed)}</div>
          </div>
          
          {/* Balance Bar */}
          <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden flex mb-2">
              <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${pctA}%` }} />
              <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${pctB}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-slate-300 mb-2">
              <span className="text-blue-400 font-bold">{pctA}% Order</span>
              <span className="text-red-400 font-bold">{pctB}% Chaos</span>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <div className="text-slate-400">Neutral:</div>
              <div className="text-right text-slate-200">{stats.normal}</div>
              
              <div className="text-blue-400">Believers A:</div>
              <div className="text-right text-white font-bold">{stats.believerA}</div>
              
              <div className="text-red-400">Believers B:</div>
              <div className="text-right text-white font-bold">{stats.believerB}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
            <div className="bg-slate-900/80 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700 shadow-xl pointer-events-auto flex gap-1 h-fit">
            {[1, 2, 4, 8].map((s) => (
                <button key={s} onClick={() => handleTimeScale(s as TimeScale)}
                className={`w-8 h-8 rounded-lg font-bold text-xs transition-all ${timeScale === s ? 'bg-blue-600 text-white shadow-lg scale-105' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                {s}x
                </button>
            ))}
            </div>

            <div className="bg-slate-900/80 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700 shadow-xl pointer-events-auto flex gap-1 h-fit">
                <button onClick={handleToggleBgm} className={`h-8 w-8 rounded-lg font-bold flex items-center justify-center ${bgmOn ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'}`}>🎵</button>
                <button onClick={handleToggleSfx} className={`h-8 w-8 rounded-lg font-bold flex items-center justify-center ${sfxOn ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-500'}`}>🔊</button>
            </div>
        </div>
      </div>

      {/* BOTTOM ROW */}
      <div className="flex justify-between items-end w-full">
        <div className="bg-slate-900/80 backdrop-blur-sm p-2 rounded-xl border border-slate-700 shadow-xl pointer-events-auto flex flex-col">
             <div className="bg-black/50 border border-slate-600 rounded overflow-hidden" style={{ width: minimapWidth, height: minimapHeight }}>
                <canvas ref={minimapRef} width={minimapWidth} height={minimapHeight} className="w-full h-full block"/>
             </div>
        </div>

        <div className="text-right text-slate-400 text-xs bg-slate-900/50 p-2 rounded-lg backdrop-blur-sm">
             <div><span className="text-white font-bold">WASD</span> Move</div>
             <div><span className="text-white font-bold">SPACE</span> Wave</div>
        </div>
      </div>

        {/* Win/Loss Screen */}
        {isGameOver && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 rounded-xl">
                <div className="text-center">
                    {isVictory ? (
                        <>
                        <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-4 animate-bounce">VICTORY</h1>
                        <p className="text-2xl text-white">Order prevails.</p>
                        <div className="mt-4 text-sm text-slate-400">Total Believers: {stats.believerA}</div>
                        </>
                    ) : (
                        <>
                        <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-purple-600 mb-4">DEFEAT</h1>
                        <p className="text-2xl text-white">Chaos reigns.</p>
                        <div className="mt-4 text-sm text-slate-400">Enemy Believers: {stats.believerB}</div>
                        </>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};

export default GameUI;
