
import React, { useRef, useEffect, useState } from 'react';
import { CONFIG, COLORS, STATE_COLORS, WORLD_WIDTH, WORLD_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from '../constants';
import { NPC, NPCState, Player, Enemy, GameStats, TimeScale, Particle, ActiveWave } from '../types';
import { createNPC, createPlayer, createEnemy, updateNPC, updatePlayer, updateEnemy, updateWaves } from '../services/gameLogic';
import { audioService } from '../services/audioService';
import { distance, normalize } from '../services/utils';

interface GameCanvasProps {
  timeScale: TimeScale;
  onStatsUpdate: (stats: GameStats) => void;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  level: number;
  onTutorialComplete?: () => void;
}

enum TutorialStep {
    INIT,
    PROMPT_WAVE,
    WAIT_FOR_HIT,
    EXPLAIN_AWARE,
    AUTO_BEAM_1,
    EXPLAIN_PERSUADED,
    AUTO_BEAM_2,
    EXPLAIN_BELIEVER,
    FINISHED
}

const GameCanvas: React.FC<GameCanvasProps> = ({ timeScale, onStatsUpdate, minimapRef, level, onTutorialComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const playerRef = useRef<Player>(createPlayer());
  const enemyRef = useRef<Enemy | null>(null);
  const npcsRef = useRef<NPC[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const wavesRef = useRef<ActiveWave[]>([]); 
  const timeElapsedRef = useRef<number>(0);
  const statsTimerRef = useRef<number>(0);
  
  const inputRef = useRef({ x: 0, y: 0, aoe: false });

  // Tutorial State
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(TutorialStep.INIT);
  const [tutorialPrompt, setTutorialPrompt] = useState<{ text: string, subtext: string, x: number, y: number, show: boolean }>({
      text: '', subtext: '', x: 0, y: 0, show: false
  });
  const tutorialTimerRef = useRef<number>(0);
  const tutorialPauseRef = useRef<boolean>(false);

  // Init
  useEffect(() => {
    const initialNPCs: NPC[] = [];
    
    if (level === 0) {
        // Tutorial Setup: 1 NPC nearby
        const tNpc = createNPC('npc_tutorial');
        tNpc.position = { x: WORLD_WIDTH/2 + 100, y: WORLD_HEIGHT/2 };
        tNpc.homeCenter = { ...tNpc.position };
        tNpc.wanderTarget = { ...tNpc.position };
        tNpc.moveSpeed = 40; // Slower for tutorial
        initialNPCs.push(tNpc);
        setTutorialStep(TutorialStep.INIT);
        tutorialTimerRef.current = 0;
        tutorialPauseRef.current = false;
        playerRef.current = createPlayer();
        playerRef.current.position = { x: WORLD_WIDTH/2 - 100, y: WORLD_HEIGHT/2 };
    } else {
        // Standard Level Setup
        const count = level === 2 ? CONFIG.NPC_COUNT + 10 : CONFIG.NPC_COUNT;
        for (let i = 0; i < count; i++) {
            initialNPCs.push(createNPC(`npc_${i}`));
        }
        playerRef.current = createPlayer();
    }

    npcsRef.current = initialNPCs;
    
    // Level 2 Enemy
    if (level === 2) {
        enemyRef.current = createEnemy();
    } else {
        enemyRef.current = null;
    }
    
    wavesRef.current = [];
    particlesRef.current = [];
    timeElapsedRef.current = 0;
    setTutorialPrompt(prev => ({ ...prev, show: false }));

  }, [level]);

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tutorial Skip Logic
      if (tutorialPauseRef.current && e.code === 'Space') {
          // Advance tutorial step
           if (tutorialStep === TutorialStep.PROMPT_WAVE) {
               inputRef.current.aoe = true; // Force trigger wave
               tutorialPauseRef.current = false;
               setTutorialStep(TutorialStep.WAIT_FOR_HIT);
               setTutorialPrompt(prev => ({...prev, show: false}));
               return;
           }
           if (tutorialStep === TutorialStep.EXPLAIN_AWARE) {
               tutorialPauseRef.current = false;
               setTutorialStep(TutorialStep.AUTO_BEAM_1);
               setTutorialPrompt(prev => ({...prev, show: false}));
               return;
           }
           if (tutorialStep === TutorialStep.EXPLAIN_PERSUADED) {
               tutorialPauseRef.current = false;
               setTutorialStep(TutorialStep.AUTO_BEAM_2);
               setTutorialPrompt(prev => ({...prev, show: false}));
               return;
           }
           if (tutorialStep === TutorialStep.EXPLAIN_BELIEVER) {
               tutorialPauseRef.current = false;
               setTutorialStep(TutorialStep.FINISHED);
               setTutorialPrompt(prev => ({...prev, show: false}));
               if (onTutorialComplete) onTutorialComplete();
               return;
           }
      }

      switch (e.key.toLowerCase()) {
        case 'w': case 'arrowup': inputRef.current.y = -1; break;
        case 's': case 'arrowdown': inputRef.current.y = 1; break;
        case 'a': case 'arrowleft': inputRef.current.x = -1; break;
        case 'd': case 'arrowright': inputRef.current.x = 1; break;
        case ' ': inputRef.current.aoe = true; break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case 'w': case 'arrowup': if (inputRef.current.y < 0) inputRef.current.y = 0; break;
        case 's': case 'arrowdown': if (inputRef.current.y > 0) inputRef.current.y = 0; break;
        case 'a': case 'arrowleft': if (inputRef.current.x < 0) inputRef.current.x = 0; break;
        case 'd': case 'arrowright': if (inputRef.current.x > 0) inputRef.current.x = 0; break;
        case ' ': inputRef.current.aoe = false; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [tutorialStep, onTutorialComplete]);

  // --- Rendering Helpers ---

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const gridSize = 100;
    ctx.strokeStyle = COLORS.Grid;
    ctx.lineWidth = 1; 
    ctx.beginPath();
    for (let x = 0; x <= width; x += gridSize) {
      ctx.moveTo(x, 0); ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.moveTo(0, y); ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, width, height);
  };

  const drawCharacter = (ctx: CanvasRenderingContext2D, pos: {x:number, y:number}, radius: number, color: string, time: number, isMoving: boolean, cooldown: number, maxCooldown: number, isEnemy: boolean = false) => {
    const visualScale = 0.85; 
    const scaleX = (isMoving ? 1 + Math.sin(time * 15) * 0.1 : 1) * visualScale;
    const scaleY = (isMoving ? 1 - Math.sin(time * 15) * 0.1 : 1) * visualScale;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(scaleX, scaleY);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, radius, Math.PI, 0);
    ctx.rect(-radius, 0, radius * 2, radius * 0.5);
    ctx.fill();

    // Cooldown or Halo
    if (cooldown > 0) {
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 5, 0, (cooldown / maxCooldown) * Math.PI * 2);
      ctx.stroke();
    } else {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    // Enemy Horns?
    if (isEnemy) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-10, -radius+5); ctx.lineTo(-15, -radius-10); ctx.lineTo(-5, -radius);
        ctx.moveTo(10, -radius+5); ctx.lineTo(15, -radius-10); ctx.lineTo(5, -radius);
        ctx.fill();
    }

    ctx.restore();
  };

  const drawNPC = (ctx: CanvasRenderingContext2D, npc: NPC, time: number, allNPCs: NPC[]) => {
    const width = 14;
    const height = 24;
    
    const isMoving = npc.velocity.x !== 0 || npc.velocity.y !== 0;
    
    // Animation Transform Variables
    let drawX = npc.position.x;
    let drawY = npc.position.y;
    let rotation = 0;
    let scaleX = 1;
    let scaleY = 1;
    let zHeight = 0; // Simulated Jump Height (Positive is UP)

    // 1. Calculate Transforms based on State

    // Debate or Idle movement (Bobbing)
    const isDebating = !!npc.debateTargetId;
    if (isDebating) {
        const hopFreq = 20;
        // Supporters hop less intensely
        const hopAmp = npc.debateRole === 'center' ? 6 : 3; 
        zHeight = Math.abs(Math.sin(time * hopFreq + npc.animOffset)) * hopAmp;
    } else if (isMoving) {
        zHeight = Math.abs(Math.sin(time * 10 + npc.animOffset)) * 2;
    }

    // 2. Render Shadow (Always on ground plane)
    ctx.save();
    ctx.translate(npc.position.x, npc.position.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    // Shadow shrinks as entity jumps higher
    const shadowScale = Math.max(0.5, 1 - zHeight / 60);
    ctx.ellipse(0, 10, (width/2) * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Render Body
    ctx.save();
    // Apply position and Jump Height (Y-up is negative in canvas)
    ctx.translate(drawX, drawY - zHeight);
    
    if (rotation !== 0) ctx.rotate(rotation);
    ctx.scale(0.85 * scaleX, 0.85 * scaleY);

    ctx.fillStyle = STATE_COLORS[npc.state];
    if (npc.state.includes('Believer')) {
        ctx.shadowColor = STATE_COLORS[npc.state];
        ctx.shadowBlur = 10;
    }
    
    // Draw Body Rect centered
    ctx.fillRect(-width/2, -height/2, width, height);
    
    // Add Eyes/Band to indicate "Head" direction
    if (npc.state.includes('Aware') || npc.state.includes('Believer') || npc.state.includes('Persuaded')) {
         ctx.fillStyle = 'rgba(255,255,255,0.7)';
         // Eyes near the top
         ctx.fillRect(-4, -height/2 + 4, 3, 3);
         ctx.fillRect(1, -height/2 + 4, 3, 3);
    }

    ctx.shadowBlur = 0;
    ctx.restore();
    
    // 4. Floating Icons (Rendered last to stay upright and above everything)
    ctx.save();
    ctx.translate(drawX, drawY - zHeight); // Follow the head
    
    if (npc.state.includes('Aware')) {
       ctx.fillStyle = '#fff';
       ctx.font = '10px Arial';
       ctx.fillText('?', 6, -12);
    }
    if (npc.debateRole === 'center') {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('!', 0, -20);
    }

    ctx.restore();
  };

  const drawBeam = (ctx: CanvasRenderingContext2D, start: {x: number, y: number}, end: {x: number, y: number}, color: string, time: number, isWeak: boolean = false) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = isWeak ? 1 : 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    const speed = time * 4; 
    ctx.setLineDash([5, 15]);
    ctx.lineDashOffset = -speed * 20;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = isWeak ? 1 : 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  };
  
  const drawDebateDuel = (ctx: CanvasRenderingContext2D, npc: NPC, opponent: NPC, time: number) => {
      const totalDurability = npc.debateDurability + opponent.debateDurability;
      if (totalDurability <= 0.1) return;
      
      const ratio = npc.debateDurability / totalDurability;
      
      // Calculate Vector
      const dx = opponent.position.x - npc.position.x;
      const dy = opponent.position.y - npc.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      
      // Calculate Clash Point
      const clashDist = dist * ratio;
      
      // Jitter (Vibration)
      const jitterAmount = Math.sin(time * 60) * 2.5; // Fast vibration
      
      const clashX = npc.position.x + Math.cos(angle) * clashDist - Math.sin(angle) * jitterAmount;
      const clashY = npc.position.y + Math.sin(angle) * clashDist + Math.cos(angle) * jitterAmount;
      
      ctx.save();
      
      // Arm A (NPC)
      ctx.strokeStyle = npc.state.endsWith('_A') ? '#ffffff' : '#ef4444'; // Believer A (White) vs B (Red)
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(npc.position.x, npc.position.y - 10); // Start from chest/head area
      ctx.lineTo(clashX, clashY);
      ctx.stroke();

      // Fist A
      ctx.fillStyle = npc.state.endsWith('_A') ? '#ffffff' : '#ef4444';
      ctx.beginPath();
      ctx.arc(clashX - Math.cos(angle) * 3, clashY - Math.sin(angle) * 3, 5, 0, Math.PI * 2);
      ctx.fill();

      // Arm B (Opponent)
      ctx.strokeStyle = opponent.state.endsWith('_A') ? '#ffffff' : '#ef4444';
      ctx.beginPath();
      ctx.moveTo(opponent.position.x, opponent.position.y - 10);
      ctx.lineTo(clashX, clashY);
      ctx.stroke();

      // Fist B
      ctx.fillStyle = opponent.state.endsWith('_A') ? '#ffffff' : '#ef4444';
      ctx.beginPath();
      ctx.arc(clashX + Math.cos(angle) * 3, clashY + Math.sin(angle) * 3, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Impact Spark
      ctx.fillStyle = '#fff';
      ctx.translate(clashX, clashY);
      ctx.rotate(time * 10); // Rotate spark
      ctx.beginPath();
      // Draw a simple 4-pointed star/spark
      for(let i=0; i<4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.moveTo(0,0);
          ctx.lineTo(12, 0); // long spike
          ctx.lineTo(3, 3);
      }
      ctx.fill();
      
      ctx.restore();
  };

  const drawParticles = (ctx: CanvasRenderingContext2D, particles: Particle[]) => {
     particles.forEach(p => {
        const x = p.position.x;
        const y = p.position.y;
        const alpha = p.life / p.maxLife;

        ctx.save();
        if (p.type === 'convert_effect') {
             ctx.fillStyle = p.color;
             ctx.globalAlpha = alpha;
             ctx.beginPath();
             ctx.arc(x, y, p.size * alpha, 0, Math.PI * 2);
             ctx.fill();
        } else if (p.type.includes('help_ring')) {
             ctx.strokeStyle = p.color;
             ctx.lineWidth = 2;
             ctx.globalAlpha = alpha;
             const r = p.size * (1 - alpha); 
             ctx.beginPath();
             ctx.arc(x, y, r, 0, Math.PI * 2);
             ctx.stroke();
        } else if (p.type === 'cleansing_shockwave') {
             ctx.strokeStyle = p.color;
             ctx.lineWidth = 4;
             ctx.globalAlpha = alpha;
             const r = p.size * (1 + (1-alpha) * 2); // Expand significantly
             ctx.beginPath();
             ctx.arc(x, y, r, 0, Math.PI * 2);
             ctx.stroke();
        } else if (p.type === 'hit_impact') {
            // Hit Flash / Burst
             ctx.fillStyle = p.color;
             ctx.globalAlpha = alpha;
             ctx.beginPath();
             // Star/Burst shape
             const spikes = 8;
             const outerRadius = p.size;
             const innerRadius = p.size / 3;
             for (let i = 0; i < spikes; i++) {
                 let ang = (Math.PI / spikes) * 2 * i;
                 ctx.lineTo(x + Math.cos(ang) * outerRadius, y + Math.sin(ang) * outerRadius);
                 ang += Math.PI / spikes;
                 ctx.lineTo(x + Math.cos(ang) * innerRadius, y + Math.sin(ang) * innerRadius);
             }
             ctx.fill();
        } else {
             ctx.fillStyle = p.color;
             ctx.globalAlpha = alpha;
             ctx.fillRect(x, y, 2, 2);
        }
        ctx.restore();
     });
  };

  const renderMinimap = (ctx: CanvasRenderingContext2D, mapW: number, mapH: number, npcs: NPC[], player: Player, enemy: Enemy | null, camera: {x: number, y: number}) => {
    ctx.clearRect(0, 0, mapW, mapH);
    ctx.fillStyle = '#0f172a'; 
    ctx.fillRect(0, 0, mapW, mapH);

    const scale = Math.min(mapW / WORLD_WIDTH, mapH / WORLD_HEIGHT);
    const drawW = WORLD_WIDTH * scale;
    const drawH = WORLD_HEIGHT * scale;
    const offsetX = (mapW - drawW) / 2;
    const offsetY = (mapH - drawH) / 2;

    ctx.fillStyle = '#1e293b'; 
    ctx.fillRect(offsetX, offsetY, drawW, drawH);
    
    npcs.forEach(npc => {
        const nx = offsetX + npc.position.x * scale;
        const ny = offsetY + npc.position.y * scale;
        ctx.fillStyle = STATE_COLORS[npc.state];
        ctx.fillRect(Math.round(nx), Math.round(ny), 3, 3);
    });

    const drawDot = (e: {position: {x:number, y:number}}, c: string) => {
        const px = offsetX + e.position.x * scale;
        const py = offsetY + e.position.y * scale;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
    };

    drawDot(player, '#fff');
    if (enemy) drawDot(enemy, '#ef4444');
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX + camera.x * scale, offsetY + camera.y * scale, VIEWPORT_WIDTH * scale, VIEWPORT_HEIGHT * scale);
  };

  const updateTutorial = (dt: number, player: Player, npcs: NPC[]) => {
      const npc = npcs[0];
      if (!npc) return;

      tutorialTimerRef.current += dt;

      // Calculate Screen Pos for prompt
      let camX = playerRef.current.position.x - VIEWPORT_WIDTH / 2;
      let camY = playerRef.current.position.y - VIEWPORT_HEIGHT / 2;
      camX = Math.max(0, Math.min(camX, WORLD_WIDTH - VIEWPORT_WIDTH));
      camY = Math.max(0, Math.min(camY, WORLD_HEIGHT - VIEWPORT_HEIGHT));

      const getPromptPos = (entityPos: {x: number, y: number}) => ({
          x: entityPos.x - camX,
          y: entityPos.y - camY - 60 // Above head
      });

      switch(tutorialStep) {
          case TutorialStep.INIT:
              if (tutorialTimerRef.current > 1.5) {
                  setTutorialStep(TutorialStep.PROMPT_WAVE);
                  tutorialPauseRef.current = true;
                  const pos = getPromptPos(player.position);
                  setTutorialPrompt({
                      text: "Press SPACE to trigger a Wave",
                      subtext: "Waves catch attention.",
                      x: pos.x, y: pos.y, show: true
                  });
              }
              break;
          
          case TutorialStep.PROMPT_WAVE:
              // Paused, waiting for Space (handled in key listener)
              break;

          case TutorialStep.WAIT_FOR_HIT:
              if (npc.state.includes('Aware')) {
                  setTutorialStep(TutorialStep.EXPLAIN_AWARE);
                  tutorialPauseRef.current = true;
                  const pos = getPromptPos(npc.position);
                  setTutorialPrompt({
                      text: "Blue means AWARE",
                      subtext: "They know your theory. Press SPACE.",
                      x: pos.x, y: pos.y, show: true
                  });
              }
              break;

          case TutorialStep.AUTO_BEAM_1:
              // Automatic Beaming
              const d = distance(player.position, npc.position);
              if (d > 180) {
                  // Move player closer if needed? (Physics handles it below, we just force input target)
              }
              if (npc.state.includes('Persuaded')) {
                  setTutorialStep(TutorialStep.EXPLAIN_PERSUADED);
                  tutorialPauseRef.current = true;
                  const pos = getPromptPos(npc.position);
                  setTutorialPrompt({
                      text: "Yellow means PERSUADED",
                      subtext: "They believe, but aren't committed. Press SPACE.",
                      x: pos.x, y: pos.y, show: true
                  });
              }
              break;

          case TutorialStep.AUTO_BEAM_2:
               if (npc.state.includes('Believer')) {
                  setTutorialStep(TutorialStep.EXPLAIN_BELIEVER);
                  tutorialPauseRef.current = true;
                  const pos = getPromptPos(npc.position);
                  setTutorialPrompt({
                      text: "White means BELIEVER",
                      subtext: "They will help you convert others. Press SPACE.",
                      x: pos.x, y: pos.y, show: true
                  });
              }
              break;
      }
  };

  // --- Main Loop ---

  useEffect(() => {
    let lastTime = performance.now();
    let animationFrameId: number;

    const loop = (currentTime: number) => {
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      const effectiveDt = dt * timeScale;
      timeElapsedRef.current += effectiveDt;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (canvas && ctx) {
        
        // --- LOGIC ---
        if (level === 0) {
            // TUTORIAL LOGIC
            updateTutorial(dt, playerRef.current, npcsRef.current);
            
            // Only update physics if not paused
            if (!tutorialPauseRef.current) {
                // Auto Beam Override
                if (tutorialStep === TutorialStep.AUTO_BEAM_1 || tutorialStep === TutorialStep.AUTO_BEAM_2) {
                    // Force look at NPC
                    // Just rely on proximity check in updatePlayer, but ensure beamTargetId isn't cleared by input
                    // We can artificially ensure the player targets the tutorial NPC
                    if (npcsRef.current[0]) {
                        playerRef.current.beamTargetId = npcsRef.current[0].id;
                    }
                }

                updateWaves(wavesRef.current, effectiveDt, npcsRef.current);
                updatePlayer(
                    playerRef.current, 
                    inputRef.current, 
                    effectiveDt, 
                    npcsRef.current,
                    enemyRef.current,
                    (p) => particlesRef.current.push(p),
                    (w) => wavesRef.current.push(w),
                    (type) => audioService.playSfx(type)
                );
                 npcsRef.current.forEach(npc => 
                    updateNPC(
                        npc, 
                        effectiveDt, 
                        npcsRef.current,
                        playerRef.current, 
                        (p) => particlesRef.current.push(p),
                        (w) => wavesRef.current.push(w),
                        (type) => audioService.playSfx(type),
                        enemyRef.current
                    )
                );
            }

        } else {
            // NORMAL LEVEL LOGIC
            updateWaves(wavesRef.current, effectiveDt, npcsRef.current);
            
            updatePlayer(
                playerRef.current, 
                inputRef.current, 
                effectiveDt, 
                npcsRef.current,
                enemyRef.current,
                (p) => particlesRef.current.push(p),
                (w) => wavesRef.current.push(w),
                (type) => audioService.playSfx(type)
            );

            if (enemyRef.current) {
                updateEnemy(
                    enemyRef.current,
                    effectiveDt,
                    npcsRef.current,
                    playerRef.current,
                    (w) => wavesRef.current.push(w)
                );
            }

            npcsRef.current.forEach(npc => 
                updateNPC(
                    npc, 
                    effectiveDt, 
                    npcsRef.current,
                    playerRef.current, 
                    (p) => particlesRef.current.push(p),
                    (w) => wavesRef.current.push(w),
                    (type) => audioService.playSfx(type),
                    enemyRef.current
                )
            );
        }

        particlesRef.current.forEach(p => p.life -= dt);
        particlesRef.current = particlesRef.current.filter(p => p.life > 0);

        // Stats
        statsTimerRef.current += effectiveDt;
        if (statsTimerRef.current > 0.2) { 
            let factionA = 0;
            let factionB = 0;
            let belA = 0;
            let belB = 0;
            let normal = 0;

            npcsRef.current.forEach(n => {
                if (n.state === NPCState.Normal) normal++;
                else if (n.state.endsWith('_A')) { factionA++; if (n.state === NPCState.Believer_A) belA++; }
                else if (n.state.endsWith('_B')) { factionB++; if (n.state === NPCState.Believer_B) belB++; }
            });
            
            onStatsUpdate({
                normal,
                factionA,
                factionB,
                believerA: belA,
                believerB: belB,
                timeElapsed: timeElapsedRef.current
            });
            statsTimerRef.current = 0;
        }

        // --- RENDER ---
        let camX = playerRef.current.position.x - VIEWPORT_WIDTH / 2;
        let camY = playerRef.current.position.y - VIEWPORT_HEIGHT / 2;
        camX = Math.max(0, Math.min(camX, WORLD_WIDTH - VIEWPORT_WIDTH));
        camY = Math.max(0, Math.min(camY, WORLD_HEIGHT - VIEWPORT_HEIGHT));

        ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        ctx.save();
        ctx.translate(-camX, -camY);

        ctx.fillStyle = COLORS.Background;
        ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        drawGrid(ctx, WORLD_WIDTH, WORLD_HEIGHT);

        // Waves
        wavesRef.current.forEach(w => {
           const lifePercent = w.currentRadius / w.maxRadius;
           ctx.save();
           ctx.strokeStyle = w.color;
           ctx.lineWidth = 3;
           ctx.globalAlpha = 1 - Math.pow(lifePercent, 3);
           ctx.beginPath();
           ctx.arc(w.center.x, w.center.y, w.currentRadius, 0, Math.PI * 2);
           ctx.stroke();
           ctx.fillStyle = w.color;
           ctx.globalAlpha *= 0.1;
           ctx.fill();
           ctx.restore();
        });

        // Beams (Player)
        if (playerRef.current.beamTargetId) {
            let t = npcsRef.current.find(n => n.id === playerRef.current.beamTargetId);
            if (!t && enemyRef.current && enemyRef.current.id === playerRef.current.beamTargetId) {
                drawBeam(ctx, playerRef.current.position, enemyRef.current.position, '#38bdf8', timeElapsedRef.current);
            } else if (t) {
                drawBeam(ctx, playerRef.current.position, t.position, '#38bdf8', timeElapsedRef.current);
            }
        }
        // Beams (Enemy)
        if (enemyRef.current && enemyRef.current.beamTargetId) {
            let t = npcsRef.current.find(n => n.id === enemyRef.current!.beamTargetId);
             if (!t && playerRef.current.id === enemyRef.current.beamTargetId) {
                 drawBeam(ctx, enemyRef.current.position, playerRef.current.position, '#ef4444', timeElapsedRef.current);
             } else if (t) {
                drawBeam(ctx, enemyRef.current.position, t.position, '#ef4444', timeElapsedRef.current);
            }
        }

        // NPCs & Debate Duel
        npcsRef.current.forEach(npc => {
            // Draw Beams
            if (npc.beamTargetId) {
                const t = npcsRef.current.find(n => n.id === npc.beamTargetId);
                const col = npc.state.endsWith('_A') ? '#38bdf8' : '#c084fc';
                if (t) drawBeam(ctx, npc.position, t.position, col, timeElapsedRef.current, true);
            }
            
            // Draw Debate Duel Arm
            if (npc.debateRole === 'center' && npc.debateTargetId) {
                const opponent = npcsRef.current.find(n => n.id === npc.debateTargetId);
                if (opponent) {
                     // We only draw once for the pair, avoid double drawing
                     if (npc.id < opponent.id) {
                         drawDebateDuel(ctx, npc, opponent, timeElapsedRef.current);
                     }
                }
            }
        });

        drawParticles(ctx, particlesRef.current);
        
        // Characters
        npcsRef.current.forEach(npc => drawNPC(ctx, npc, timeElapsedRef.current, npcsRef.current));
        drawCharacter(ctx, playerRef.current.position, playerRef.current.radius, COLORS.Player, timeElapsedRef.current, (inputRef.current.x!==0||inputRef.current.y!==0), playerRef.current.aoeCooldown, playerRef.current.maxAoeCooldown);
        if (enemyRef.current) {
            drawCharacter(ctx, enemyRef.current.position, enemyRef.current.radius, COLORS.Enemy, timeElapsedRef.current, true, enemyRef.current.aoeCooldown, enemyRef.current.maxAoeCooldown, true);
        }

        ctx.restore();

        if (minimapRef.current) {
            const mCtx = minimapRef.current.getContext('2d');
            if (mCtx) renderMinimap(mCtx, minimapRef.current.width, minimapRef.current.height, npcsRef.current, playerRef.current, enemyRef.current, { x: camX, y: camY });
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [timeScale, onStatsUpdate, level, tutorialStep]);

  return (
    <div className="relative w-full h-full">
        <canvas ref={canvasRef} width={VIEWPORT_WIDTH} height={VIEWPORT_HEIGHT} className="block w-full h-full" />
        
        {/* Tutorial Overlay */}
        {tutorialPrompt.show && (
            <div 
                className="absolute transform -translate-x-1/2 -translate-y-full bg-slate-900/95 border border-blue-400 p-4 rounded-lg shadow-2xl flex flex-col items-center text-center gap-2 pointer-events-none transition-all duration-300 z-50 min-w-[200px]"
                style={{ 
                    left: Math.max(100, Math.min(VIEWPORT_WIDTH - 100, tutorialPrompt.x)), 
                    top: Math.max(80, Math.min(VIEWPORT_HEIGHT - 80, tutorialPrompt.y)) 
                }}
            >
                <div className="text-white font-bold text-lg">{tutorialPrompt.text}</div>
                <div className="text-blue-300 text-sm">{tutorialPrompt.subtext}</div>
                <div className="mt-2 w-0 h-0 border-l-[10px] border-l-transparent border-t-[10px] border-t-blue-400 border-r-[10px] border-r-transparent"></div>
            </div>
        )}
    </div>
  );
};

export default GameCanvas;
