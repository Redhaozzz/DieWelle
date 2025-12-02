import React, { useState, useCallback, useRef, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import GameUI from './components/GameUI';
import LevelSelectScreen from './components/LevelSelectScreen';
import { GameStats } from './types';
import { CONFIG, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './constants';

const App: React.FC = () => {
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);
  const [gameKey, setGameKey] = useState(0); // Used to force-reset the game canvas
  const [isTutorialCompleted, setIsTutorialCompleted] = useState(false);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState(1); // 0 (Tutorial) and 1 unlocked by default

  const [stats, setStats] = useState<GameStats>({
    normal: 0,
    factionA: 0,
    factionB: 0,
    believerA: 0,
    believerB: 0,
    timeElapsed: 0,
    enemyLeaderDead: false,
  });
  
  const [scale, setScale] = useState(1);
  const minimapRef = useRef<HTMLCanvasElement>(null);

  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    setStats(newStats);
  }, []);

  const handleTutorialComplete = useCallback(() => {
    setIsTutorialCompleted(true);
    // Tutorial (0) complete -> Unlock 1 (already unlocked) -> Unlock 2?
    // Usually Tutorial doesn't strictly block L1, but let's ensure logic holds
    setMaxUnlockedLevel(prev => Math.max(prev, 1)); 
  }, []);

  // Called when a level is won
  const handleLevelVictory = useCallback((level: number) => {
      // Unlock the next level
      setMaxUnlockedLevel(prev => Math.max(prev, level + 1));
  }, []);

  const handleRestart = useCallback(() => {
    setGameKey(prev => prev + 1);
    setIsTutorialCompleted(false);
    // Reset stats visually immediately to avoid flickering old stats
    setStats({
      normal: 0,
      factionA: 0,
      factionB: 0,
      believerA: 0,
      believerB: 0,
      timeElapsed: 0,
      enemyLeaderDead: false,
    });
  }, []);

  const handleNextLevel = useCallback(() => {
    if (currentLevel !== null) {
      setCurrentLevel(currentLevel + 1);
      setGameKey(0);
      setIsTutorialCompleted(false);
    }
  }, [currentLevel]);

  const handleBackToMenu = useCallback(() => {
    setCurrentLevel(null);
    setGameKey(0);
    setIsTutorialCompleted(false);
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

  const MAX_LEVEL = 5;

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
            <LevelSelectScreen 
                onSelectLevel={setCurrentLevel} 
                maxUnlockedLevel={maxUnlockedLevel}
            />
        )}

        {(currentLevel !== null) && (
            <>
                <GameCanvas 
                    key={`${currentLevel}-${gameKey}`}
                    onStatsUpdate={handleStatsUpdate}
                    minimapRef={minimapRef}
                    level={currentLevel}
                    onTutorialComplete={handleTutorialComplete}
                />
                <GameUI 
                    stats={stats} 
                    minimapRef={minimapRef}
                    onRestart={handleRestart}
                    onNextLevel={handleNextLevel}
                    onBackToMenu={handleBackToMenu}
                    hasNextLevel={currentLevel < MAX_LEVEL}
                    level={currentLevel}
                    isTutorialCompleted={isTutorialCompleted}
                    onUnlockNextLevel={() => handleLevelVictory(currentLevel)}
                />
            </>
        )}
      </div>
    </div>
  );
};

export default App;