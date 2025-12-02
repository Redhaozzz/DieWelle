
import React from 'react';
import { audioService } from '../services/audioService';

interface LevelSelectScreenProps {
  onSelectLevel: (level: number) => void;
  maxUnlockedLevel: number;
}

const LevelSelectScreen: React.FC<LevelSelectScreenProps> = ({ onSelectLevel, maxUnlockedLevel }) => {
  
  const handleSelect = (level: number) => {
    if (level <= maxUnlockedLevel) {
        audioService.playSfx('ui_click');
        onSelectLevel(level);
    }
  };

  const LevelCard = ({ level, icon, title, subtitle, colorClass, borderColorClass }: any) => {
      const isLocked = level > maxUnlockedLevel;
      
      return (
        <button 
            onClick={() => handleSelect(level)}
            disabled={isLocked}
            className={`
                group relative w-40 h-28 rounded-xl flex flex-col items-center justify-center gap-1 shadow-lg transition-all duration-300
                ${isLocked 
                    ? 'bg-slate-900 border border-slate-800 opacity-60 cursor-not-allowed grayscale' 
                    : `bg-slate-800/80 backdrop-blur-sm border border-slate-600 ${borderColorClass} hover:bg-slate-700/80 hover:scale-105`
                }
            `}
        >
            {isLocked ? (
                <div className="text-2xl text-slate-600">🔒</div>
            ) : (
                <div className="text-2xl group-hover:scale-110 transition-transform duration-300">{icon}</div>
            )}
            
            <div className={`text-lg font-bold ${isLocked ? 'text-slate-600' : colorClass}`}>
                {title}
            </div>
            
            <div className={`text-[10px] ${isLocked ? 'text-slate-700' : 'text-slate-400 group-hover:text-slate-300'}`}>
                {isLocked ? "Locked" : subtitle}
            </div>
        </button>
      );
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-4 relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-500 blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-red-500 blur-[100px]"></div>
      </div>

      <div className="z-10 flex flex-col items-center gap-2">
        <div className="text-center mt-2">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 mb-0">
            Die Welle
          </h1>
          <h2 className="text-lg font-light tracking-[0.3em] text-blue-400">
            The Wave
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-2 items-center">
           {/* Tutorial Card */}
           <button 
            onClick={() => handleSelect(0)}
            className="group relative w-40 h-28 bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-xl hover:border-green-400 hover:bg-slate-700/80 transition-all duration-300 flex flex-col items-center justify-center gap-1 hover:scale-105 shadow-lg"
          >
            <div className="text-2xl group-hover:scale-110 transition-transform duration-300">🎓</div>
            <div className="text-lg font-bold text-green-400">Tutorial</div>
          </button>

          {/* Level 1 Card */}
          <LevelCard 
            level={1}
            icon="🏙️"
            title="Level 1"
            subtitle="The Beginning"
            colorClass="text-white"
            borderColorClass="hover:border-blue-400"
          />

          {/* Level 2 Card */}
          <LevelCard 
            level={2}
            icon="⚔️"
            title="Level 2"
            subtitle="Schism"
            colorClass="text-red-400"
            borderColorClass="hover:border-red-400"
          />

          {/* Level 3 Card */}
          <LevelCard 
            level={3}
            icon="👑"
            title="Level 3"
            subtitle="Opinion Leaders"
            colorClass="text-yellow-400"
            borderColorClass="hover:border-yellow-400"
          />
          
           {/* Level 4 Card */}
          <LevelCard 
            level={4}
            icon="🏝️"
            title="Level 4"
            subtitle="Islands"
            colorClass="text-purple-400"
            borderColorClass="hover:border-purple-400"
          />

           {/* Level 5 Card */}
          <LevelCard 
            level={5}
            icon="🌉"
            title="Level 5"
            subtitle="The Divide"
            colorClass="text-cyan-400"
            borderColorClass="hover:border-cyan-400"
          />
        </div>

        <div className="mt-4 text-slate-500 text-[10px] font-mono">
          v1.7.0 • Unlocked: {maxUnlockedLevel}/5
        </div>
      </div>
    </div>
  );
};

export default LevelSelectScreen;
