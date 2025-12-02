

import React, { useRef, useEffect, useState } from 'react';
import { COLORS, STATE_COLORS, WORLD_WIDTH, WORLD_HEIGHT, LEVEL_4_WIDTH, LEVEL_4_HEIGHT, LEVEL_5_WIDTH, LEVEL_5_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, CONFIG } from '../constants';
import { NPC, NPCState, Player, Enemy, GameStats, Particle, ActiveWave, Wall, Portal } from '../types';
import { createNPC, createPlayer, createEnemy, updateNPC, updatePlayer, updateEnemy, updateWaves, updatePortals } from '../services/gameLogic';
import { audioService } from '../services/audioService';
import { distance, normalize } from '../services/utils';

interface GameCanvasProps {
  onStatsUpdate: (stats: GameStats) => void;
  minimapRef: React.RefObject<HTMLCanvasElement | null>;
  level: number;
  onTutorialComplete?: () => void;
}

enum TutorialStep {
    INIT,
    PROMPT_WAVE,
    WAIT_FOR_HIT,
    AWARE_PHASE,
    PERSUADED_PHASE,
    BELIEVER_PHASE,
    WATCH_PHASE,
    FINISHED
}

const GameCanvas: React.FC<GameCanvasProps> = ({ onStatsUpdate, minimapRef, level, onTutorialComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const playerRef = useRef<Player>(createPlayer());
  const enemyRef = useRef<Enemy | null>(null);
  const npcsRef = useRef<NPC[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const wavesRef = useRef<ActiveWave[]>([]); 
  const timeElapsedRef = useRef<number>(0);
  const statsTimerRef = useRef<number>(0);
  
  const wallsRef = useRef<Wall[]>([]);
  const portalsRef = useRef<Portal[]>([]);
  
  // Use Ref for world size to ensure game loop always accesses current value without re-binding
  const worldSizeRef = useRef({ width: WORLD_WIDTH, height: WORLD_HEIGHT });
  
  const inputRef = useRef({ x: 0, y: 0, aoe: false });

  // Tutorial State
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(TutorialStep.INIT);
  const tutorialTimerRef = useRef<number>(0);
  const hasTriggeredComplete = useRef(false);

  // Init
  useEffect(() => {
    const initialNPCs: NPC[] = [];
    hasTriggeredComplete.current = false;
    let w = WORLD_WIDTH;
    let h = WORLD_HEIGHT;
    
    if (level === 4) {
        w = LEVEL_4_WIDTH;
        h = LEVEL_4_HEIGHT;
    } else if (level === 5) {
        w = LEVEL_5_WIDTH;
        h = LEVEL_5_HEIGHT;
    }
    worldSizeRef.current = { width: w, height: h };
    
    wallsRef.current = [];
    portalsRef.current = [];

    // --- LEVEL SETUP ---
    
    if (level === 0) {
        // Tutorial Setup
        // Position characters lower on screen (0.6) to avoid overlap with top UI
        const startY = h * 0.6;
        
        const tNpc1 = createNPC('npc_tutorial_1');
        tNpc1.position = { x: w/2 + 50, y: startY };
        tNpc1.homeCenter = { ...tNpc1.position };
        tNpc1.wanderTarget = { ...tNpc1.position };
        tNpc1.moveSpeed = 30; 
        tNpc1.homeRadius = 50;
        initialNPCs.push(tNpc1);

        const tNpc2 = createNPC('npc_tutorial_2');
        tNpc2.position = { x: w/2 + 130, y: startY }; 
        tNpc2.homeCenter = { ...tNpc2.position };
        tNpc2.wanderTarget = { ...tNpc2.position };
        tNpc2.moveSpeed = 30;
        tNpc2.homeRadius = 50;
        initialNPCs.push(tNpc2);
        
        setTutorialStep(TutorialStep.INIT);
        tutorialTimerRef.current = 0;
        playerRef.current = createPlayer();
        playerRef.current.position = { x: w/2 - 100, y: startY };
        
    } else if (level === 4) {
        // Level 4 (Islands)
        const boxX = 400; const boxY = 210; const boxW = 400; const boxH = 300; const t = 20; 
        wallsRef.current = [
            { x: boxX, y: boxY, width: boxW, height: t },
            { x: boxX, y: boxY + boxH - t, width: boxW, height: t },
            { x: boxX, y: boxY, width: t, height: 100 },
            { x: boxX, y: boxY + boxH - 100, width: t, height: 100 },
            { x: boxX + boxW - t, y: boxY, width: t, height: 100 },
            { x: boxX + boxW - t, y: boxY + boxH - 100, width: t, height: 100 },
        ];
        
        const count = 50;
        const zoneContainer = { x: 420 + 15, y: 230 + 15, width: 360 - 30, height: 260 - 30 };
        const zoneTopLeft = { x: 50, y: 50, width: 300, height: 200 };
        const zoneBottomRight = { x: 850, y: 470, width: 300, height: 200 };
        
        for (let i = 0; i < count; i++) {
            const isOpinionLeader = Math.random() < 0.15;
            let bounds;
            if (i < 15) bounds = zoneContainer;
            else if (i < 25) bounds = zoneTopLeft;
            else if (i < 35) bounds = zoneBottomRight;
            initialNPCs.push(createNPC(`npc_${i}`, isOpinionLeader ? 'opinion_leader' : 'standard', bounds, bounds));
        }
        playerRef.current = createPlayer();
        playerRef.current.position = { x: 100, y: h/2 };

    } else if (level === 5) {
        // Level 5 (River)
        // 1. River Wall
        const riverW = 80;
        const riverX = w/2 - riverW/2; // 400 - 40 = 360
        wallsRef.current = [
            { x: riverX, y: 0, width: riverW, height: h }
        ];

        // 2. Portals (3 Pairs)
        const portalY = [h * 0.2, h * 0.5, h * 0.8];
        const pRadius = 25;
        const padDist = 60; // Distance from river center
        
        portalY.forEach((py, idx) => {
            const leftId = `p_l_${idx}`;
            const rightId = `p_r_${idx}`;
            
            const leftPos = { x: w/2 - padDist, y: py };
            const rightPos = { x: w/2 + padDist, y: py };
            
            portalsRef.current.push({
                id: leftId,
                position: leftPos,
                targetPosition: rightPos,
                radius: pRadius,
                cooldown: 0,
                maxCooldown: CONFIG.PORTAL_COOLDOWN,
                pairId: rightId
            });

            portalsRef.current.push({
                id: rightId,
                position: rightPos,
                targetPosition: leftPos,
                radius: pRadius,
                cooldown: 0,
                maxCooldown: CONFIG.PORTAL_COOLDOWN,
                pairId: leftId
            });
        });

        // 3. Spawns
        const count = 40;
        for (let i = 0; i < count; i++) {
            const isLeft = i < count/2;
            const bounds = isLeft 
                ? { x: 0, y: 0, width: riverX, height: h } 
                : { x: riverX + riverW, y: 0, width: w - (riverX + riverW), height: h };
            
            const isOpinionLeader = Math.random() < 0.15;
            initialNPCs.push(createNPC(`npc_${i}`, isOpinionLeader ? 'opinion_leader' : 'standard', bounds, undefined)); // Wander bounds undefined implies full map, but physics constrains them until they teleport
        }

        playerRef.current = createPlayer();
        playerRef.current.position = { x: 100, y: h/2 };
        
    } else {
        // Standard Level Setup
        const count = level === 1 ? 15 : 40;
        for (let i = 0; i < count; i++) {
            const isOpinionLeader = level === 3 && Math.random() < 0.15;
            initialNPCs.push(createNPC(`npc_${i}`, isOpinionLeader ? 'opinion_leader' : 'standard'));
        }
        playerRef.current = createPlayer();
    }

    npcsRef.current = initialNPCs;
    
    if (level >= 2) {
        enemyRef.current = createEnemy();
        if (level === 4) {
            enemyRef.current.position = { x: 600, y: 360 }; 
            enemyRef.current.targetPos = { x: 600, y: 360 };
        } else if (level === 5) {
            enemyRef.current.position = { x: 100, y: h * 0.2 }; // Left side
            enemyRef.current.targetPos = { x: 100, y: h * 0.2 };
        }
    } else {
        enemyRef.current = null;
    }
    
    wavesRef.current = [];
    particlesRef.current = [];
    timeElapsedRef.current = 0;

  }, [level]);

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [tutorialStep, onTutorialComplete, level]);

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
  
  const drawWalls = (ctx: CanvasRenderingContext2D, walls: Wall[]) => {
      walls.forEach((w, i) => {
          // Special styling for Level 5 River
          const isRiver = level === 5 && i === 0; // The first wall in L5 is the river
          
          if (isRiver) {
             ctx.fillStyle = COLORS.River;
             ctx.strokeStyle = '#0284c7';
             ctx.lineWidth = 0;
          } else {
             ctx.fillStyle = COLORS.Wall;
             ctx.strokeStyle = '#475569';
             ctx.lineWidth = 2;
          }

          ctx.beginPath();
          ctx.rect(w.x, w.y, w.width, w.height);
          ctx.fill();
          if (!isRiver) ctx.stroke();
          
          if (!isRiver) {
             // 3D effect top
             ctx.fillStyle = '#64748b';
             ctx.fillRect(w.x, w.y - 10, w.width, 10);
             ctx.strokeRect(w.x, w.y - 10, w.width, 10);
          } else {
             // River Waves effect
             ctx.save();
             ctx.beginPath();
             ctx.rect(w.x, w.y, w.width, w.height);
             ctx.clip();
             ctx.strokeStyle = 'rgba(255,255,255,0.2)';
             ctx.lineWidth = 2;
             const time = timeElapsedRef.current;
             for(let y = -50; y < w.height + 50; y+= 40) {
                 const offset = Math.sin(time + y * 0.1) * 10;
                 ctx.beginPath();
                 ctx.moveTo(w.x, y + offset);
                 ctx.lineTo(w.x + w.width, y + offset + 10);
                 ctx.stroke();
             }
             ctx.restore();
          }
      });
  };

  const drawPortals = (ctx: CanvasRenderingContext2D, portals: Portal[]) => {
      // Draw Connections (Bridges)
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 40;
      ctx.lineCap = 'butt';
      for (let i = 0; i < portals.length; i += 2) {
          const p1 = portals[i];
          const p2 = portals[i+1];
          if (p1 && p2) {
              ctx.beginPath();
              ctx.moveTo(p1.position.x, p1.position.y);
              ctx.lineTo(p2.position.x, p2.position.y);
              ctx.stroke();
              
              // Detail
              ctx.strokeStyle = '#334155';
              ctx.lineWidth = 30;
              ctx.stroke();
              
              // Chevrons
              ctx.save();
              ctx.fillStyle = 'rgba(255,255,255,0.1)';
              const cx = (p1.position.x + p2.position.x) / 2;
              const cy = p1.position.y;
              ctx.translate(cx, cy);
              const time = timeElapsedRef.current * 20;
              const offset = time % 40;
              ctx.fillRect(-20 + offset - 20, -10, 5, 20);
              ctx.fillRect(-20 + offset, -10, 5, 20);
              ctx.restore();
          }
      }

      portals.forEach(p => {
          const isActive = p.cooldown <= 0;
          const color = isActive ? '#4ade80' : '#ef4444'; // Green or Red
          
          ctx.save();
          ctx.translate(p.position.x, p.position.y);
          
          // Base
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Ring
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, p.radius - 2, 0, Math.PI * 2);
          ctx.stroke();
          
          // Inner Pulse
          if (isActive) {
              const pulse = Math.sin(timeElapsedRef.current * 5) * 0.2 + 0.8;
              ctx.fillStyle = color;
              ctx.globalAlpha = 0.3 * pulse;
              ctx.beginPath();
              ctx.arc(0, 0, p.radius - 5, 0, Math.PI * 2);
              ctx.fill();
          } else {
              // Cooldown pie
              ctx.fillStyle = color;
              ctx.globalAlpha = 0.5;
              ctx.beginPath();
              ctx.moveTo(0,0);
              ctx.arc(0, 0, p.radius, -Math.PI/2, (p.cooldown / p.maxCooldown) * Math.PI * 2 - Math.PI/2);
              ctx.lineTo(0,0);
              ctx.fill();
          }
          
          ctx.restore();
      });
  };

  const drawCharacter = (
      ctx: CanvasRenderingContext2D, 
      pos: {x:number, y:number}, 
      radius: number, 
      color: string, 
      time: number, 
      isMoving: boolean, 
      cooldown: number, 
      maxCooldown: number, 
      isEnemy: boolean = false, 
      activeDebateId: string | null = null,
      isDead: boolean = false
    ) => {
    
    if (isDead) {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.globalAlpha = 0.5 + Math.sin(time * 2) * 0.2; 
        ctx.fillStyle = '#475569'; 
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
        return;
    }

    const visualScale = 0.85; 
    const scaleX = (isMoving ? 1 + Math.sin(time * 15) * 0.1 : 1) * visualScale;
    const scaleY = (isMoving ? 1 - Math.sin(time * 15) * 0.1 : 1) * visualScale;

    // Leader Debate Hop
    let zHeight = 0;
    if (activeDebateId) {
        const hopFreq = 20;
        const hopAmp = 4;
        zHeight = Math.abs(Math.sin(time * hopFreq)) * hopAmp;
    }

    ctx.save();
    ctx.translate(pos.x, pos.y);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    const shadowScale = Math.max(0.5, 1 - zHeight / 40);
    ctx.ellipse(0, radius/2, radius * shadowScale, radius * 0.3 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(pos.x, pos.y - zHeight);
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
    const isOpinionLeader = npc.role === 'opinion_leader';
    const width = isOpinionLeader ? 18 : 14;
    const height = isOpinionLeader ? 28 : 24;
    
    const isMoving = npc.velocity.x !== 0 || npc.velocity.y !== 0;
    
    let drawX = npc.position.x;
    let drawY = npc.position.y;
    let rotation = 0;
    let scaleX = 1;
    let scaleY = 1;
    let zHeight = 0;

    const isDebating = !!npc.debateTargetId;
    if (isDebating) {
        const hopFreq = 20;
        const hopAmp = npc.debateRole === 'center' ? 6 : 3; 
        zHeight = Math.abs(Math.sin(time * hopFreq + npc.animOffset)) * hopAmp;
    } else if (isMoving) {
        zHeight = Math.abs(Math.sin(time * 10 + npc.animOffset)) * 2;
    }

    ctx.save();
    ctx.translate(npc.position.x, npc.position.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    const shadowScale = Math.max(0.5, 1 - zHeight / 60);
    ctx.ellipse(0, 10, (width/2) * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(drawX, drawY - zHeight);
    
    if (rotation !== 0) ctx.rotate(rotation);
    ctx.scale(0.85 * scaleX, 0.85 * scaleY);

    ctx.fillStyle = STATE_COLORS[npc.state];
    if (npc.state.includes('Believer')) {
        ctx.shadowColor = STATE_COLORS[npc.state];
        ctx.shadowBlur = 10;
    }
    
    // Body Shape
    if (isOpinionLeader) {
        ctx.beginPath();
        ctx.moveTo(-width/2, -height/2 + 5);
        ctx.lineTo(0, -height/2 - 2); 
        ctx.lineTo(width/2, -height/2 + 5);
        ctx.lineTo(width/2, height/2);
        ctx.lineTo(-width/2, height/2);
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.fillRect(-width/2, -height/2, width, height);
    }
    
    if (npc.state.includes('Aware') || npc.state.includes('Believer') || npc.state.includes('Persuaded')) {
         ctx.fillStyle = 'rgba(255,255,255,0.7)';
         ctx.fillRect(-4, -height/2 + (isOpinionLeader ? 6 : 4), 3, 3);
         ctx.fillRect(1, -height/2 + (isOpinionLeader ? 6 : 4), 3, 3);
    }
    
    if (isOpinionLeader) {
        ctx.fillStyle = '#fbbf24'; // Gold
        ctx.beginPath();
        ctx.arc(0, 2, 4, 0, Math.PI*2);
        ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
    
    ctx.save();
    ctx.translate(drawX, drawY - zHeight);
    
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
  
  const drawSupportLine = (ctx: CanvasRenderingContext2D, start: {x: number, y: number}, end: {x: number, y: number}, color: string, time: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      
      // Glow background
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      
      // Moving dashes for energy flow
      const speed = time * 40; 
      ctx.setLineDash([8, 12]);
      ctx.lineDashOffset = -speed;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      
      ctx.restore();
  };

  const drawDebateDuel = (ctx: CanvasRenderingContext2D, npc: NPC, opponentPos: {x: number, y:number}, opponentState: NPCState, opponentDurability: number, time: number) => {
      const totalDurability = npc.debateDurability + opponentDurability; 
      if (totalDurability <= 0.1) return;
      
      // Dynamic ratio based on HP: Higher HP pushes the beam further (ratio > 0.5)
      let ratio = npc.debateDurability / totalDurability;
      
      // Clamp ratio to keep the clash point somewhat visible between units (20% - 80%)
      ratio = Math.max(0.2, Math.min(0.8, ratio));
      
      const dx = opponentPos.x - npc.position.x;
      const dy = opponentPos.y - npc.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      
      const clashDist = dist * ratio;
      const jitterAmount = Math.sin(time * 60) * 2.5; 
      
      const clashX = npc.position.x + Math.cos(angle) * clashDist - Math.sin(angle) * jitterAmount;
      const clashY = npc.position.y + Math.sin(angle) * clashDist + Math.cos(angle) * jitterAmount;
      
      ctx.save();
      
      ctx.strokeStyle = npc.state.endsWith('_A') ? '#ffffff' : '#ef4444'; 
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(npc.position.x, npc.position.y - 10); 
      ctx.lineTo(clashX, clashY);
      ctx.stroke();

      ctx.fillStyle = npc.state.endsWith('_A') ? '#ffffff' : '#ef4444';
      ctx.beginPath();
      ctx.arc(clashX - Math.cos(angle) * 3, clashY - Math.sin(angle) * 3, 5, 0, Math.PI * 2);
      ctx.fill();

      // Opponent Line
      const oppColor = opponentState.endsWith('_A') ? '#ffffff' : '#ef4444'; 
      ctx.strokeStyle = oppColor;
      ctx.beginPath();
      ctx.moveTo(opponentPos.x, opponentPos.y - 10);
      ctx.lineTo(clashX, clashY);
      ctx.stroke();

      ctx.fillStyle = oppColor;
      ctx.beginPath();
      ctx.arc(clashX + Math.cos(angle) * 3, clashY + Math.sin(angle) * 3, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#fff';
      ctx.translate(clashX, clashY);
      ctx.rotate(time * 10); 
      ctx.beginPath();
      for(let i=0; i<4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.moveTo(0,0);
          ctx.lineTo(12, 0); 
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
             const r = p.size * (1 + (1-alpha) * 2);
             ctx.beginPath();
             ctx.arc(x, y, r, 0, Math.PI * 2);
             ctx.stroke();
        } else if (p.type === 'teleport') {
             ctx.strokeStyle = p.color;
             ctx.lineWidth = 2;
             ctx.globalAlpha = alpha;
             const r = p.size * (1 - alpha);
             ctx.beginPath();
             ctx.rect(x - r/2, y - r/2, r, r); // Square expand
             ctx.stroke();
             ctx.globalAlpha = alpha * 0.5;
             ctx.fillRect(x - r/2, y - r/2, r, r);
        } else if (p.type === 'leader_death') {
             ctx.fillStyle = '#ef4444';
             ctx.globalAlpha = alpha;
             const r = p.size * (1 + (2-alpha)*0.5);
             
             ctx.beginPath();
             ctx.arc(x, y, r * 0.5, 0, Math.PI*2);
             ctx.fill();
             
             ctx.strokeStyle = '#fff';
             ctx.lineWidth = 4;
             ctx.beginPath();
             for(let i=0; i<12; i++) {
                 const ang = (Math.PI*2/12)*i;
                 ctx.moveTo(x, y);
                 ctx.lineTo(x + Math.cos(ang)*r*1.5, y + Math.sin(ang)*r*1.5);
             }
             ctx.stroke();
             
        } else if (p.type === 'hit_impact') {
             ctx.fillStyle = p.color;
             ctx.globalAlpha = alpha;
             ctx.beginPath();
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
  
  const drawTutorialPopup = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string, subtext: string) => {
      const padding = 12;
      ctx.font = "bold 16px 'Segoe UI', sans-serif";
      const textWidth = ctx.measureText(text).width;
      ctx.font = "12px 'Segoe UI', sans-serif";
      const subtextWidth = ctx.measureText(subtext).width;
      
      const boxWidth = Math.max(textWidth, subtextWidth) + padding * 2;
      const boxHeight = 60;
      
      const boxX = x - boxWidth / 2;
      const boxY = y - 90; 
      
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'; 
      ctx.strokeStyle = '#38bdf8'; 
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
      ctx.fill();
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x, boxY + boxHeight);
      ctx.lineTo(x - 8, boxY + boxHeight);
      ctx.lineTo(x, boxY + boxHeight + 8);
      ctx.lineTo(x + 8, boxY + boxHeight);
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = "bold 16px 'Segoe UI', sans-serif";
      ctx.fillText(text, x, boxY + 24);
      
      ctx.fillStyle = '#93c5fd'; 
      ctx.font = "12px 'Segoe UI', sans-serif";
      ctx.fillText(subtext, x, boxY + 44);
      
      ctx.restore();
  };
  
  const drawGoalPopup = (ctx: CanvasRenderingContext2D, viewportWidth: number, viewportHeight: number, overrideTitle?: string, overrideSubtitle?: string) => {
      const cx = viewportWidth / 2;
      const cy = viewportHeight * 0.15; // Position at the top (15% height) to allow clear view of center/bottom
      const boxW = 400;
      const boxH = 100;
      
      ctx.save();
      // Box
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 20;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'; 
      ctx.strokeStyle = '#38bdf8'; 
      ctx.lineWidth = 2;
      
      ctx.beginPath();
      ctx.roundRect(cx - boxW/2, cy - boxH/2, boxW, boxH, 12);
      ctx.fill();
      ctx.stroke();
      
      ctx.textAlign = 'center';

      if (overrideTitle) {
          ctx.fillStyle = '#fbbf24'; // Warning color
          ctx.font = "bold 18px 'Segoe UI', sans-serif";
          ctx.fillText(overrideTitle, cx, cy - 10);
          
          ctx.fillStyle = '#fff';
          ctx.font = "16px 'Segoe UI', sans-serif";
          ctx.fillText(overrideSubtitle || "", cx, cy + 20);

      } else {
          ctx.fillStyle = '#38bdf8';
          ctx.font = "bold 24px 'Segoe UI', sans-serif";
          ctx.fillText("OBJECTIVE", cx, cy - 15);
          
          ctx.fillStyle = '#fff';
          ctx.font = "18px 'Segoe UI', sans-serif";
          ctx.fillText("Your goal is to turn everybody", cx, cy + 15);
          ctx.fillText("into your follower.", cx, cy + 35);
      }
      
      ctx.restore();
  };

  const renderMinimap = (ctx: CanvasRenderingContext2D, mapW: number, mapH: number, npcs: NPC[], player: Player, enemy: Enemy | null, camera: {x: number, y: number}, walls: Wall[]) => {
    const currentWorldSize = worldSizeRef.current;
    
    ctx.clearRect(0, 0, mapW, mapH);
    ctx.fillStyle = '#0f172a'; 
    ctx.fillRect(0, 0, mapW, mapH);

    const scale = Math.min(mapW / currentWorldSize.width, mapH / currentWorldSize.height);
    const drawW = currentWorldSize.width * scale;
    const drawH = currentWorldSize.height * scale;
    const offsetX = (mapW - drawW) / 2;
    const offsetY = (mapH - drawH) / 2;

    ctx.fillStyle = '#1e293b'; 
    ctx.fillRect(offsetX, offsetY, drawW, drawH);
    
    // Draw Walls on Minimap
    walls.forEach((w, i) => {
        const isRiver = level === 5 && i === 0;
        ctx.fillStyle = isRiver ? COLORS.River : '#475569';
        ctx.fillRect(offsetX + w.x * scale, offsetY + w.y * scale, w.width * scale, w.height * scale);
    });
    
    npcs.forEach(npc => {
        const nx = offsetX + npc.position.x * scale;
        const ny = offsetY + npc.position.y * scale;
        ctx.fillStyle = STATE_COLORS[npc.state];
        const size = npc.role === 'opinion_leader' ? 5 : 3;
        ctx.fillRect(Math.round(nx - size/2), Math.round(ny - size/2), size, size);
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
    if (enemy && !enemy.isDead) drawDot(enemy, '#ef4444');
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX + camera.x * scale, offsetY + camera.y * scale, VIEWPORT_WIDTH * scale, VIEWPORT_HEIGHT * scale);
  };

  const updateTutorial = (dt: number, player: Player, npcs: NPC[]) => {
      const npc1 = npcs[0];
      const npc2 = npcs[1]; 
      if (!npc1 || !npc2) return;

      switch(tutorialStep) {
          case TutorialStep.INIT:
              tutorialTimerRef.current += dt;
              // SHORTEN INIT so Prompt appears almost immediately
              if (tutorialTimerRef.current > 0.1) setTutorialStep(TutorialStep.PROMPT_WAVE);
              break;
          
          case TutorialStep.PROMPT_WAVE:
              if (inputRef.current.aoe) setTutorialStep(TutorialStep.WAIT_FOR_HIT);
              break;

          case TutorialStep.WAIT_FOR_HIT:
              if (npc1.state.includes('Aware') || npc2.state.includes('Aware')) setTutorialStep(TutorialStep.AWARE_PHASE);
              break;
            
          case TutorialStep.AWARE_PHASE:
               if (npc1.state.includes('Persuaded')) setTutorialStep(TutorialStep.PERSUADED_PHASE);
               break;

          case TutorialStep.PERSUADED_PHASE:
               if (npc1.state.includes('Believer')) {
                  setTutorialStep(TutorialStep.BELIEVER_PHASE);
                  tutorialTimerRef.current = 0;
              }
              break;

          case TutorialStep.BELIEVER_PHASE:
              tutorialTimerRef.current += dt;
              if (tutorialTimerRef.current > 1.5) {
                  setTutorialStep(TutorialStep.WATCH_PHASE);
              }
              break;

          case TutorialStep.WATCH_PHASE:
              if (npc2.state.includes('Believer')) {
                   setTutorialStep(TutorialStep.FINISHED);
                   if (onTutorialComplete && !hasTriggeredComplete.current) {
                       hasTriggeredComplete.current = true;
                       onTutorialComplete();
                   }
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
      
      timeElapsedRef.current += dt;
      
      const currentWorldSize = worldSizeRef.current;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (canvas && ctx) {
        
        // --- LOGIC ---
        if (level === 0) {
            updateTutorial(dt, playerRef.current, npcsRef.current);
            
            updateWaves(wavesRef.current, dt, npcsRef.current);
            updatePlayer(
                playerRef.current, 
                inputRef.current, 
                dt, 
                npcsRef.current,
                enemyRef.current,
                (p) => particlesRef.current.push(p),
                (w) => wavesRef.current.push(w),
                (type) => audioService.playSfx(type),
                currentWorldSize,
                wallsRef.current
            );
                npcsRef.current.forEach(npc => 
                updateNPC(
                    npc, 
                    dt, 
                    npcsRef.current,
                    playerRef.current, 
                    (p) => particlesRef.current.push(p),
                    (w) => wavesRef.current.push(w),
                    (type) => audioService.playSfx(type),
                    enemyRef.current,
                    2.0,
                    currentWorldSize,
                    wallsRef.current,
                    portalsRef.current
                )
            );

        } else {
            // NORMAL LEVEL LOGIC
            updateWaves(wavesRef.current, dt, npcsRef.current);
            updatePortals(portalsRef.current, dt); // Update cooldowns

            updatePlayer(
                playerRef.current, 
                inputRef.current, 
                dt, 
                npcsRef.current,
                enemyRef.current,
                (p) => particlesRef.current.push(p),
                (w) => wavesRef.current.push(w),
                (type) => audioService.playSfx(type),
                currentWorldSize,
                wallsRef.current
            );

            if (enemyRef.current) {
                updateEnemy(
                    enemyRef.current,
                    dt,
                    npcsRef.current,
                    playerRef.current,
                    (w) => wavesRef.current.push(w),
                    (p) => particlesRef.current.push(p),
                    currentWorldSize,
                    wallsRef.current
                );
            }

            npcsRef.current.forEach(npc => 
                updateNPC(
                    npc, 
                    dt, 
                    npcsRef.current,
                    playerRef.current, 
                    (p) => particlesRef.current.push(p),
                    (w) => wavesRef.current.push(w),
                    (type) => audioService.playSfx(type),
                    enemyRef.current,
                    1.0,
                    currentWorldSize,
                    wallsRef.current,
                    portalsRef.current
                )
            );
        }

        particlesRef.current.forEach(p => p.life -= dt);
        particlesRef.current = particlesRef.current.filter(p => p.life > 0);

        statsTimerRef.current += dt;
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
                timeElapsed: timeElapsedRef.current,
                enemyLeaderDead: enemyRef.current ? enemyRef.current.isDead : false
            });
            statsTimerRef.current = 0;
        }

        // --- RENDER ---
        let camX = playerRef.current.position.x - VIEWPORT_WIDTH / 2;
        let camY = playerRef.current.position.y - VIEWPORT_HEIGHT / 2;
        camX = Math.max(0, Math.min(camX, currentWorldSize.width - VIEWPORT_WIDTH));
        camY = Math.max(0, Math.min(camY, currentWorldSize.height - VIEWPORT_HEIGHT));

        ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
        ctx.save();
        ctx.translate(-camX, -camY);

        ctx.fillStyle = COLORS.Background;
        ctx.fillRect(0, 0, currentWorldSize.width, currentWorldSize.height);
        drawGrid(ctx, currentWorldSize.width, currentWorldSize.height);
        
        drawPortals(ctx, portalsRef.current); // Draw Portals under walls (bridges logic)
        drawWalls(ctx, wallsRef.current);

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

        // 1. Draw Support Lines (Before Characters/Main Beams)
        // NPC Supporters
        npcsRef.current.forEach(npc => {
            if (npc.debateRole === 'supporter' && npc.debateTargetId) {
                
                // --- VISUAL RULE: Only Believers draw energy lines ---
                if (!npc.state.includes('Believer')) return;

                // Find who they are supporting (Same debateTargetId, Role is Center, Same Faction)
                const faction = npc.state.endsWith('_A') ? 'A' : 'B';
                const center = npcsRef.current.find(n => 
                    n.debateTargetId === npc.debateTargetId && 
                    n.debateRole === 'center' && 
                    n.id !== npc.id &&
                    (npc.state.endsWith(`_${faction}`) && n.state.endsWith(`_${faction}`))
                );
                
                if (center) {
                    drawSupportLine(ctx, npc.position, center.position, faction === 'A' ? '#38bdf8' : '#c084fc', timeElapsedRef.current);
                }
            }
        });
        
        // Player Supporter
        if (playerRef.current.activeDebateId) {
            const center = npcsRef.current.find(n => n.id === playerRef.current.activeDebateId);
            if (center) {
                 drawSupportLine(ctx, playerRef.current.position, center.position, '#38bdf8', timeElapsedRef.current);
            }
        }
        
        // Enemy Supporter
        if (enemyRef.current && enemyRef.current.activeDebateId && !enemyRef.current.isDead) {
            const center = npcsRef.current.find(n => n.id === enemyRef.current!.activeDebateId);
            if (center) {
                 drawSupportLine(ctx, enemyRef.current.position, center.position, '#c084fc', timeElapsedRef.current);
            }
        }

        // Beams (Player)
        if (playerRef.current.beamTargetId) {
            let t = npcsRef.current.find(n => n.id === playerRef.current.beamTargetId);
            if (!t && enemyRef.current && enemyRef.current.id === playerRef.current.beamTargetId && !enemyRef.current.isDead) {
                drawBeam(ctx, playerRef.current.position, enemyRef.current.position, '#38bdf8', timeElapsedRef.current);
            } else if (t) {
                drawBeam(ctx, playerRef.current.position, t.position, '#38bdf8', timeElapsedRef.current);
            }
        }
        // Beams (Enemy)
        if (enemyRef.current && !enemyRef.current.isDead && enemyRef.current.beamTargetId) {
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
                if (npc.debateTargetId === 'enemy_leader' && enemyRef.current && !enemyRef.current.isDead) {
                    drawDebateDuel(ctx, npc, enemyRef.current.position, NPCState.Believer_B, enemyRef.current.hp, timeElapsedRef.current);
                } else {
                    const opponent = npcsRef.current.find(n => n.id === npc.debateTargetId);
                    if (opponent) {
                         if (npc.id < opponent.id) {
                             drawDebateDuel(ctx, npc, opponent.position, opponent.state, opponent.debateDurability, timeElapsedRef.current);
                         }
                    }
                }
            }
        });

        drawParticles(ctx, particlesRef.current);
        
        npcsRef.current.forEach(npc => drawNPC(ctx, npc, timeElapsedRef.current, npcsRef.current));
        drawCharacter(ctx, playerRef.current.position, playerRef.current.radius, COLORS.Player, timeElapsedRef.current, (inputRef.current.x!==0||inputRef.current.y!==0), playerRef.current.aoeCooldown, playerRef.current.maxAoeCooldown, false, playerRef.current.activeDebateId);
        if (enemyRef.current) {
            drawCharacter(
                ctx, 
                enemyRef.current.position, 
                enemyRef.current.radius, 
                COLORS.Enemy, 
                timeElapsedRef.current, 
                true, 
                enemyRef.current.aoeCooldown, 
                enemyRef.current.maxAoeCooldown, 
                true, 
                enemyRef.current.activeDebateId,
                enemyRef.current.isDead
            );
        }

        // TUTORIAL OVERLAYS
        if (level === 0) {
            ctx.restore(); // Exit camera space for fixed overlays if needed, BUT here logic uses World Space for Popups attached to entities.
            // However, drawGoalPopup should be Screen Space.
            
            // Re-apply camera for entity-attached popups
            ctx.save();
            ctx.translate(-camX, -camY);

            const tNpc1 = npcsRef.current[0];
            const tNpc2 = npcsRef.current[1];
            const player = playerRef.current;
            
            if (tutorialStep === TutorialStep.PROMPT_WAVE) {
                 drawTutorialPopup(ctx, player.position.x, player.position.y, "Cast a Wave to attract attention", "Press SPACE");
            } 
            else if (tutorialStep === TutorialStep.AWARE_PHASE && tNpc1) {
                 drawTutorialPopup(ctx, tNpc1.position.x, tNpc1.position.y, "Blue is AWARE", "Target knows your idea");
            }
            else if (tutorialStep === TutorialStep.PERSUADED_PHASE && tNpc1) {
                 drawTutorialPopup(ctx, tNpc1.position.x, tNpc1.position.y, "Yellow is PERSUADED", "Believes, but not yet a Follower");
            }
            else if (tutorialStep === TutorialStep.BELIEVER_PHASE && tNpc1) {
                 drawTutorialPopup(ctx, tNpc1.position.x, tNpc1.position.y, "White is BELIEVER", "A true follower who will help you");
            }
            else if (tutorialStep === TutorialStep.WATCH_PHASE && tNpc2) {
                 if (tNpc2.state === NPCState.Normal) {
                     // NO-OP here, we draw the prompt in Screen Space below
                 } else {
                     drawTutorialPopup(ctx, tNpc2.position.x, tNpc2.position.y, "Watch!", "Believers convert others automatically");
                 }
            }

            ctx.restore(); 

            // Screen Space Overlays
            // DECOUPLED: Render Goal Popup during first 4 seconds regardless of step to allow Prompt overlap
            if (timeElapsedRef.current < 4.0) {
                drawGoalPopup(ctx, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
            }
            
            if (tutorialStep === TutorialStep.WATCH_PHASE && tNpc2 && tNpc2.state === NPCState.Normal) {
                // SPECIAL WARNING: Believer cannot convert Normal
                drawGoalPopup(ctx, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, "Believers cannot convert Normal people directly.", "The Leader must make them AWARE first.");
            }
        } else {
            ctx.restore();
        }

        if (minimapRef.current) {
            const mCtx = minimapRef.current.getContext('2d');
            if (mCtx) renderMinimap(mCtx, minimapRef.current.width, minimapRef.current.height, npcsRef.current, playerRef.current, enemyRef.current, { x: camX, y: camY }, wallsRef.current);
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [onStatsUpdate, level, tutorialStep]);

  return (
    <div className="relative w-full h-full">
        <canvas ref={canvasRef} width={VIEWPORT_WIDTH} height={VIEWPORT_HEIGHT} className="block w-full h-full" />
    </div>
  );
};

export default GameCanvas;