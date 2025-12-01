
import React from 'react';
import { audioService } from '../services/audioService';

interface LevelSelectScreenProps {
  onSelectLevel: (level: number) => void;
}

const LevelSelectScreen: React.FC<LevelSelectScreenProps> = ({ onSelectLevel }) => {
  
  const handleSelect = (level: number) => {
    audioService.playSfx('ui_click');
    onSelectLevel(level);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-8 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500 blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-red-500 blur-[100px]"></div>
      </div>

      <div className="z-10 flex flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-2">
            MONOPOLE
          </h1>
          <h2 className="text-2xl font-light tracking-[0.5em] text-blue-400">
            PROPAGATION
          </h2>
        </div>

        <div className="flex gap-6 mt-4 items-center">
           {/* Tutorial Card */}
           <button 
            onClick={() => handleSelect(0)}
            className="group relative w-48 h-32 bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-xl hover:border-green-400 hover:bg-slate-700/80 transition-all duration-300 flex flex-col items-center justify-center gap-2 hover:scale-105 shadow-lg"
          >
            <div className="text-3xl group-hover:scale-110 transition-transform duration-300">🎓</div>
            <div className="text-lg font-bold text-green-400">Tutorial</div>
          </button>

          {/* Level 1 Card */}
          <button 
            onClick={() => handleSelect(1)}
            className="group relative w-64 h-40 bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-xl hover:border-blue-400 hover:bg-slate-700/80 transition-all duration-300 flex flex-col items-center justify-center gap-2 hover:scale-105 shadow-lg"
          >
            <div className="text-4xl group-hover:scale-110 transition-transform duration-300">🏙️</div>
            <div className="text-xl font-bold">Level 1</div>
            <div className="text-xs text-slate-400 group-hover:text-slate-300">The Beginning</div>
          </button>

          {/* Level 2 Card */}
          <button 
            onClick={() => handleSelect(2)}
            className="group relative w-64 h-40 bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-xl hover:border-red-400 hover:bg-slate-700/80 transition-all duration-300 flex flex-col items-center justify-center gap-2 hover:scale-105 shadow-lg"
          >
            <div className="text-4xl group-hover:scale-110 transition-transform duration-300">⚔️</div>
            <div className="text-xl font-bold text-red-400">Level 2</div>
            <div className="text-xs text-slate-400 group-hover:text-slate-300">Schism</div>
          </button>
        </div>

        <div className="mt-8 text-slate-500 text-xs font-mono">
          v1.2.0 • Select a mission to begin
        </div>
      </div>
    </div>
  );
};

export default LevelSelectScreen;
