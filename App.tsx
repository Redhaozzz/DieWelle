
import React, { useState, useCallback, useRef, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import GameUI from './components/GameUI';
import LevelSelectScreen from './components/LevelSelectScreen';
import { GameStats, TimeScale } from './types';
import { CONFIG, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './constants';

const App: React.FC = () => {
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);

  const [timeScale, setTimeScale] = useState<TimeScale>(TimeScale.x1);
  const [stats, setStats] = useState<GameStats>({
    normal: CONFIG.NPC_COUNT,
    factionA: 0,
    factionB: 0,
    believerA: 0,
    believerB: 0,
    timeElapsed: 0,
  });
  
  const [scale, setScale] = useState(1);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    setStats(newStats);
  }, []);

  const handleTutorialComplete = useCallback(() => {
    setCurrentLevel(1);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const scaleX = window.innerWidth / VIEWPORT_WIDTH;
      const scaleY = window.innerHeight / VIEWPORT_HEIGHT;
      const newScale = Math.min(scaleX, scaleY);
      setScale(newScale);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-black flex items-center justify-center select-none">
      <div 
        style={{
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 0 50px rgba(0,0,0,0.5)' 
        }}
      >
        {currentLevel === null && (
            <LevelSelectScreen onSelectLevel={setCurrentLevel} />
        )}

        {(currentLevel !== null) && (
            <>
                <GameCanvas 
                    timeScale={timeScale}
                    onStatsUpdate={handleStatsUpdate}
                    minimapRef={minimapRef}
                    level={currentLevel}
                    onTutorialComplete={handleTutorialComplete}
                />
                {currentLevel !== 0 && (
                  <GameUI 
                      stats={stats} 
                      timeScale={timeScale} 
                      setTimeScale={setTimeScale}
                      minimapRef={minimapRef}
                  />
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default App;
