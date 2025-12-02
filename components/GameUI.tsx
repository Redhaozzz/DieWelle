
import React, { useState, useEffect, useRef } from 'react';
import { GameStats } from '../types';
import { STATE_COLORS, CONFIG, WORLD_WIDTH, WORLD_HEIGHT, LEVEL_4_WIDTH, LEVEL_4_HEIGHT, LEVEL_5_WIDTH, LEVEL_5_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from '../constants';
import { audioService } from '../services/audioService';

interface GameUIProps {
  stats: GameStats;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  onRestart: () => void;
  onNextLevel: () => void;
  onBackToMenu: () => void;
  hasNextLevel: boolean;
  level: number;
  isTutorialCompleted: boolean;
  onUnlockNextLevel: () => void;
}

const ConfettiCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<any[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Init confetti
        const colors = ['#38bdf8', '#fbbf24', '#ffffff', '#f472b6', '#4ade80'];
        for(let i=0; i<150; i++) {
            particlesRef.current.push({
                x: Math.random() * VIEWPORT_WIDTH,
                y: Math.random() * VIEWPORT_HEIGHT - VIEWPORT_HEIGHT,
                vx: Math.random() * 2 - 1,
                vy: Math.random() * 5 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                size: Math.random() * 6 + 4,
                rotation: Math.random() * Math.PI * 2,
                vr: Math.random() * 0.2 - 0.1
            });
        }

        let animId: number;
        const loop = () => {
            ctx.clearRect(0,0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
            
            particlesRef.current.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.vr;
                
                // Sway
                p.x += Math.sin(p.y * 0.01) * 0.5;

                // Reset
                if (p.y > VIEWPORT_HEIGHT) {
                    p.y = -20;
                    p.x = Math.random() * VIEWPORT_WIDTH;
                }

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
                ctx.restore();
            });

            animId = requestAnimationFrame(loop);
        };
        loop();

        return () => cancelAnimationFrame(animId);
    }, []);

    return <canvas ref={canvasRef} width={VIEWPORT_WIDTH} height={VIEWPORT_HEIGHT} className="absolute inset-0 pointer-events-none z-0" />;
};

const GameUI: React.FC<GameUIProps> = ({ stats, minimapRef, onRestart, onNextLevel, onBackToMenu, hasNextLevel, level, isTutorialCompleted, onUnlockNextLevel }) => {
  const [bgmOn, setBgmOn] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);
  
  // Default minimap off
  const [showMinimap, setShowMinimap] = useState(false);
  
  // Exit Menu State
  const [showExitMenu, setShowExitMenu] = useState(false);
  
  // Audio Lock Ref
  const hasTriggeredVictory = useRef(false);

  // Determine Map Dimensions
  let currentWorldWidth = WORLD_WIDTH;
  let currentWorldHeight = WORLD_HEIGHT;

  if (level === 4) {
      currentWorldWidth = LEVEL_4_WIDTH;
      currentWorldHeight = LEVEL_4_HEIGHT;
  } else if (level === 5) {
      currentWorldWidth = LEVEL_5_WIDTH;
      currentWorldHeight = LEVEL_5_HEIGHT;
  }

  // Calculate dynamic total population
  const totalPopulation = stats.normal + stats.factionA + stats.factionB;
  
  // Bar percentages based on BELIEVERS only
  const pctBelieverA = totalPopulation > 0 ? (stats.believerA / totalPopulation) * 100 : 0;
  const pctBelieverB = totalPopulation > 0 ? (stats.believerB / totalPopulation) * 100 : 0;
  
  // Game Over Logic
  let isVictory = false;
  let isDefeat = false;

  if (level === 0) {
      // Tutorial: Victory strictly controlled by script completion
      isVictory = isTutorialCompleted;
  } else if (level === 1) {
      // Level 1: Single Propagation (No Enemy Leader). Win when 100% are Believers.
      isVictory = totalPopulation > 0 && stats.believerA >= totalPopulation;
      isDefeat = false; 
  } else {
      // Level 2+: Boss Levels. Win when Enemy Leader is Dead.
      isVictory = stats.enemyLeaderDead;
      isDefeat = totalPopulation > 0 && pctBelieverB > 90;
  }

  const isGameOver = isVictory || isDefeat;

  // Reset audio trigger when level starts/restarts
  useEffect(() => {
      hasTriggeredVictory.current = false;
  }, [level, stats.timeElapsed]); // reset on restart (time resets)

  // Trigger unlock when victory is detected
  useEffect(() => {
      if (isVictory && !hasTriggeredVictory.current) {
          hasTriggeredVictory.current = true;
          onUnlockNextLevel();
          audioService.playVictory();
      }
  }, [isVictory]); // Removed onUnlockNextLevel dependency to avoid re-firing on prop recreation

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

  const handleToggleMinimap = () => {
    setShowMinimap(prev => !prev);
    audioService.playSfx('ui_click');
  };
  
  const handleHomeClick = () => {
      audioService.playSfx('ui_click');
      setShowExitMenu(true);
  };

  const onBtnClick = (fn: () => void) => {
      audioService.playSfx('ui_click');
      fn();
  };

  const minimapWidth = 160;
  const minimapHeight = minimapWidth * (currentWorldHeight / currentWorldWidth);

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
      
      {/* HUD - Only show for non-tutorial levels */}
      {level !== 0 && (
          <>
            {/* TOP ROW */}
            <div className="flex justify-between items-start w-full">
                
                {/* Stats Panel */}
                <div className="bg-slate-900/80 backdrop-blur-sm p-3 rounded-xl border border-slate-700 shadow-xl pointer-events-auto w-56">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-sm font-bold text-white">Influence</h2>
                    <div className="text-sm font-bold text-cyan-400">{stats.believerA} / {totalPopulation}</div>
                </div>
                
                {/* Balance Bar (Believers Only) */}
                <div className="relative w-full h-4 bg-slate-700 rounded-full overflow-hidden mb-2 border border-slate-600">
                    {/* Believer A (Left) */}
                    <div 
                        className="absolute left-0 top-0 h-full bg-blue-500 transition-all duration-300" 
                        style={{ width: `${pctBelieverA}%` }} 
                    />
                    {/* Believer B (Right) */}
                    <div 
                        className="absolute right-0 top-0 h-full bg-red-500 transition-all duration-300" 
                        style={{ width: `${pctBelieverB}%` }} 
                    />
                </div>

                <div className="flex justify-between items-center text-xs">
                    <div className="text-slate-400 font-mono">Time: {formatTime(stats.timeElapsed)}</div>
                    <div className="text-slate-400">Neutral: <span className="text-slate-200 font-bold">{stats.normal}</span></div>
                </div>
                </div>

                {/* Controls */}
                <div className="flex gap-2">
                    <div className="bg-slate-900/80 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700 shadow-xl pointer-events-auto flex gap-1 h-fit">
                        <button onClick={handleToggleBgm} title="Toggle Music" className={`h-8 w-8 rounded-lg font-bold flex items-center justify-center ${bgmOn ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'}`}>🎵</button>
                        <button onClick={handleToggleSfx} title="Toggle SFX" className={`h-8 w-8 rounded-lg font-bold flex items-center justify-center ${sfxOn ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-500'}`}>🔊</button>
                        <button onClick={handleToggleMinimap} title="Toggle Minimap" className={`h-8 w-8 rounded-lg font-bold flex items-center justify-center ${showMinimap ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-500'}`}>🗺️</button>
                        <button onClick={handleHomeClick} title="Home / Restart" className="h-8 w-8 rounded-lg font-bold flex items-center justify-center bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700">🏠</button>
                    </div>
                </div>
            </div>

            {/* BOTTOM ROW */}
            <div className="flex justify-between items-end w-full">
                {/* Minimap - Conditionally Rendered */}
                {showMinimap ? (
                <div className="bg-slate-900/80 backdrop-blur-sm p-2 rounded-xl border border-slate-700 shadow-xl pointer-events-auto flex flex-col">
                    <div className="bg-black/50 border border-slate-600 rounded overflow-hidden" style={{ width: minimapWidth, height: minimapHeight }}>
                        <canvas ref={minimapRef} width={minimapWidth} height={minimapHeight} className="w-full h-full block"/>
                    </div>
                </div>
                ) : (
                <div /> /* Spacer */
                )}

                <div className="text-right text-slate-400 text-xs bg-slate-900/50 p-2 rounded-lg backdrop-blur-sm">
                    <div><span className="text-white font-bold">WASD</span> Move</div>
                    <div><span className="text-white font-bold">SPACE</span> Wave</div>
                </div>
            </div>
          </>
      )}

        {/* Exit Menu Modal */}
        {showExitMenu && !isGameOver && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-40 pointer-events-auto">
                 <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 shadow-2xl w-64 text-center">
                     <h2 className="text-xl font-bold text-white mb-4">Paused</h2>
                     <div className="flex flex-col gap-3">
                         <button 
                            onClick={() => { onBtnClick(onRestart); setShowExitMenu(false); }}
                            className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-medium border border-slate-600"
                         >
                             Restart Level
                         </button>
                         <button 
                            onClick={() => { onBtnClick(onBackToMenu); setShowExitMenu(false); }}
                            className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium border border-slate-700"
                         >
                             Home Page
                         </button>
                         <button 
                            onClick={() => { audioService.playSfx('ui_click'); setShowExitMenu(false); }}
                            className="w-full py-2 rounded-lg text-slate-400 hover:text-white text-sm"
                         >
                             Cancel
                         </button>
                     </div>
                 </div>
             </div>
        )}

        {/* Victory / Defeat Screen */}
        {isGameOver && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 pointer-events-auto">
                
                {/* Confetti - Behind the card, but above the black background */}
                {isVictory && <ConfettiCanvas />}

                {/* Main Card - Relative with z-10 to stay above Confetti */}
                <div className="relative z-10 text-center p-8 bg-slate-900/90 rounded-2xl border border-slate-700 shadow-2xl max-w-sm w-full">
                    {isVictory ? (
                        <>
                            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-2 animate-bounce">VICTORY</h1>
                            <p className="text-xl text-slate-300 mb-6">{level === 0 ? "Tutorial Complete" : "Order prevails."}</p>
                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={() => onBtnClick(onRestart)}
                                    className="w-full py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold transition-colors border border-slate-600"
                                >
                                    Restart Level
                                </button>
                                <button 
                                    onClick={() => onBtnClick(onBackToMenu)}
                                    className="w-full py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors border border-slate-700"
                                >
                                    Home Page
                                </button>
                                {hasNextLevel && (
                                    <button 
                                        onClick={() => onBtnClick(onNextLevel)}
                                        className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold shadow-lg transition-all transform hover:scale-105"
                                    >
                                        Next Level
                                    </button>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-purple-600 mb-2 animate-pulse">DEFEAT</h1>
                            <p className="text-xl text-slate-300 mb-6">Chaos reigns.</p>
                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={() => onBtnClick(onRestart)}
                                    className="w-full py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold transition-colors border border-slate-600"
                                >
                                    Restart Level
                                </button>
                                <button 
                                    onClick={() => onBtnClick(onBackToMenu)}
                                    className="w-full py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors border border-slate-700"
                                >
                                    Home Page
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};

export default GameUI;
