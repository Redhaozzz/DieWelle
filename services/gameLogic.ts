

import { CONFIG, WORLD_HEIGHT, WORLD_WIDTH } from "../constants";
import { NPC, NPCState, Player, Enemy, Particle, ActiveWave, Entity, Vector, Wall, Portal } from "../types";
import { distance, normalize, randomRange, getFaction, clamp } from "./utils";

// --- Factory Functions ---

export const createNPC = (
    id: string, 
    role: 'standard' | 'opinion_leader' = 'standard',
    spawnBounds?: { x: number, y: number, width: number, height: number },
    wanderBounds?: { x: number, y: number, width: number, height: number }
): NPC => {
  const margin = 50;
  
  let x, y;
  if (spawnBounds) {
      x = randomRange(spawnBounds.x + 10, spawnBounds.x + spawnBounds.width - 10);
      y = randomRange(spawnBounds.y + 10, spawnBounds.y + spawnBounds.height - 10);
  } else {
      x = randomRange(margin, WORLD_WIDTH - margin);
      y = randomRange(margin, WORLD_HEIGHT - margin);
  }
  
  const isOpinionLeader = role === 'opinion_leader';

  return {
    id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    radius: isOpinionLeader ? CONFIG.OPINION_LEADER_RADIUS : 12,
    state: NPCState.Normal,
    role: role,
    homeCenter: { x: randomRange(x - 100, x + 100), y: randomRange(y - 100, y + 100) },
    homeRadius: randomRange(100, 200),
    wanderTarget: { x, y }, 
    wanderBounds: wanderBounds,
    moveSpeed: randomRange(CONFIG.NPC_BASE_SPEED * 0.8, CONFIG.NPC_BASE_SPEED * 1.2),
    
    awareCenter: null,
    awareSeekTimer: 0,
    awareActionTimer: 0,
    awareIsMoving: false,
    awareLocalTarget: { x, y },
    
    conversionProgressA: 0,
    conversionProgressB: 0,
    
    believerBeamCooldown: randomRange(0, 1),
    beamTargetId: null,
    opinionWaveTimer: randomRange(0, CONFIG.OPINION_LEADER_WAVE_CD),
    
    debateTargetId: null,
    debateRole: 'none',
    debateDurability: CONFIG.DEBATE_DURABILITY_MAX,
    debateSignalTimer: 0,
    
    animOffset: randomRange(0, Math.PI * 2),
    hitWaveIds: [],
  };
};

export const createPlayer = (): Player => ({
  id: 'player',
  position: { x: WORLD_WIDTH / 4, y: WORLD_HEIGHT / 2 },
  velocity: { x: 0, y: 0 },
  radius: 20,
  moveSpeed: CONFIG.PLAYER_SPEED,
  aoeCooldown: 0,
  maxAoeCooldown: CONFIG.PLAYER_AOE_CD,
  aoeRadius: CONFIG.PLAYER_AOE_RADIUS,
  beamRange: CONFIG.PLAYER_BEAM_RANGE,
  beamTargetId: null,
  activeDebateId: null,
});

export const createEnemy = (): Enemy => ({
  id: 'enemy_leader',
  position: { x: WORLD_WIDTH * 0.75, y: WORLD_HEIGHT / 2 },
  velocity: { x: 0, y: 0 },
  radius: 20,
  moveSpeed: CONFIG.ENEMY_SPEED,
  aoeCooldown: 2, // Start with slight cooldown
  maxAoeCooldown: CONFIG.ENEMY_AOE_CD,
  aoeRadius: CONFIG.ENEMY_AOE_RADIUS,
  beamRange: CONFIG.ENEMY_BEAM_RANGE,
  beamTargetId: null,
  decisionTimer: 0,
  pathingTimer: 0,
  chaseTargetId: null,
  targetPos: { x: WORLD_WIDTH * 0.75, y: WORLD_HEIGHT / 2 },
  state: 'wandering',
  activeDebateId: null,
  hp: CONFIG.ENEMY_LEADER_HP,
  maxHp: CONFIG.ENEMY_LEADER_HP,
  isDead: false,
});

// --- Collision Helpers ---
const resolveWallCollision = (entity: Entity, walls: Wall[]) => {
    walls.forEach(wall => {
        // AABB Collision (Entity treated as square for walls for stability)
        const closestX = clamp(entity.position.x, wall.x, wall.x + wall.width);
        const closestY = clamp(entity.position.y, wall.y, wall.y + wall.height);
        
        const dx = entity.position.x - closestX;
        const dy = entity.position.y - closestY;
        const distSq = dx*dx + dy*dy;
        
        if (distSq < entity.radius * entity.radius) {
            const dist = Math.sqrt(distSq);
            const overlap = entity.radius - dist;
            
            if (dist > 0) {
                // Normal resolution
                entity.position.x += (dx / dist) * overlap;
                entity.position.y += (dy / dist) * overlap;
            } else {
                // Inside wall, push out - find minimal push
                // (Simplified: Just push away from center of wall)
                const centerX = wall.x + wall.width/2;
                const centerY = wall.y + wall.height/2;
                const pushDir = normalize({ x: entity.position.x - centerX, y: entity.position.y - centerY });
                entity.position.x += pushDir.x * entity.radius;
                entity.position.y += pushDir.y * entity.radius;
            }
        }
    });
};

// Intersection Helper: Segment (p1-p2) vs Rect (wall)
const lineIntersectsRect = (p1: Vector, p2: Vector, r: Wall): boolean => {
    // 1. Check if both points are on same side of rect (optimization)
    if ((p1.x < r.x && p2.x < r.x) || (p1.x > r.x + r.width && p2.x > r.x + r.width) ||
        (p1.y < r.y && p2.y < r.y) || (p1.y > r.y + r.height && p2.y > r.y + r.height)) {
        return false;
    }

    // 2. Line Intersection Helper
    const intersectLine = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) => {
        const det = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (det === 0) return false;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / det;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / det;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    };

    // 3. Check against 4 sides of rect
    const left   = r.x;
    const right  = r.x + r.width;
    const top    = r.y;
    const bottom = r.y + r.height;

    // Expand rect slightly to catch grazing
    const pad = 5;

    return (
        intersectLine(p1.x, p1.y, p2.x, p2.y, left - pad, top - pad, right + pad, top - pad) ||       // Top
        intersectLine(p1.x, p1.y, p2.x, p2.y, right + pad, top - pad, right + pad, bottom + pad) ||   // Right
        intersectLine(p1.x, p1.y, p2.x, p2.y, right + pad, bottom + pad, left - pad, bottom + pad) || // Bottom
        intersectLine(p1.x, p1.y, p2.x, p2.y, left - pad, bottom + pad, left - pad, top - pad)        // Left
    );
};


// --- Update Logic ---

export const updateWaves = (
    waves: ActiveWave[], 
    dt: number, 
    npcs: NPC[]
) => {
    for (let i = waves.length - 1; i >= 0; i--) {
        const wave = waves[i];
        wave.currentRadius += wave.speed * dt;
        
        npcs.forEach(npc => {
            if (npc.hitWaveIds.includes(wave.id)) return;
            
            if (distance(wave.center, npc.position) <= wave.currentRadius) {
                npc.hitWaveIds.push(wave.id);
                if (npc.hitWaveIds.length > 5) npc.hitWaveIds.shift();

                const waveFaction = wave.sourceType === 'player' ? 'A' : 'B';
                const npcFaction = getFaction(npc.state);
                
                // 1. State Mutation & Flipping
                // Logic: A wave makes Normal -> Aware(Faction).
                // Logic: A wave from Faction A makes Aware_B -> Aware_A (Flip).
                // Logic: A wave from Faction B makes Aware_A -> Aware_B (Flip).

                let didFlip = false;

                if (npc.state === NPCState.Normal) {
                    npc.state = waveFaction === 'A' ? NPCState.Aware_A : NPCState.Aware_B;
                    didFlip = true;
                } 
                else if (npc.state === NPCState.Aware_A && waveFaction === 'B') {
                    npc.state = NPCState.Aware_B;
                    didFlip = true;
                }
                else if (npc.state === NPCState.Aware_B && waveFaction === 'A') {
                    npc.state = NPCState.Aware_A;
                    didFlip = true;
                }

                // Refresh timer if state matches wave or just flipped
                if (didFlip || (npcFaction === waveFaction && (npc.state === NPCState.Aware_A || npc.state === NPCState.Aware_B))) {
                    npc.awareSeekTimer = CONFIG.AWARE_STAY_DURATION;
                }

                // 2. Attraction Logic
                let shouldAttract = false;

                if (didFlip) {
                    shouldAttract = true;
                } else if (wave.sourceType === 'player') {
                    if (npc.state !== NPCState.Believer_B) {
                        shouldAttract = true;
                    }
                } else {
                    if (getFaction(npc.state) === waveFaction) {
                        shouldAttract = true;
                    }
                }

                if (shouldAttract) {
                    npc.awareCenter = { ...wave.center };
                    npc.awareSeekTimer = CONFIG.AWARE_STAY_DURATION;
                    npc.awareIsMoving = false; 
                    npc.awareActionTimer = 0;
                }
            }
        });

        if (wave.currentRadius >= wave.maxRadius) {
            waves.splice(i, 1);
        }
    }
};

export const updatePlayer = (
  player: Player,
  input: { x: number; y: number; aoe: boolean },
  dt: number,
  npcs: NPC[],
  enemy: Enemy | null,
  addParticle: (p: Particle) => void,
  spawnWave: (w: ActiveWave) => void,
  playSfx: (type: 'aoe' | 'convert') => void,
  mapDim: { width: number, height: number },
  walls: Wall[] = []
) => {
  // Movement
  if (input.x !== 0 || input.y !== 0) {
    const dir = normalize({ x: input.x, y: input.y });
    player.position.x += dir.x * player.moveSpeed * dt;
    player.position.y += dir.y * player.moveSpeed * dt;
    
    player.position.x = Math.max(player.radius, Math.min(mapDim.width - player.radius, player.position.x));
    player.position.y = Math.max(player.radius, Math.min(mapDim.height - player.radius, player.position.y));
    
    resolveWallCollision(player, walls);
  }

  // AoE
  if (player.aoeCooldown > 0) {
    player.aoeCooldown -= dt;
  } else if (input.aoe) {
    player.aoeCooldown = player.maxAoeCooldown;
    playSfx('aoe');
    spawnWave({
        id: `wave_p_${Math.random()}`,
        center: { ...player.position },
        currentRadius: 10,
        maxRadius: player.aoeRadius,
        speed: 400,
        color: 'rgba(56, 189, 248, 0.5)', // Cyan
        sourceType: 'player'
    });
  }

  // --- Debate Support Logic (Find Closest) ---
  player.activeDebateId = null;
  let minDebateDist = CONFIG.R_HELP_BIG; // Only support if within help range
  
  for (const n of npcs) {
      if (n.debateRole === 'center' && getFaction(n.state) === 'A') {
          const d = distance(player.position, n.position);
          if (d < minDebateDist) {
              minDebateDist = d;
              player.activeDebateId = n.id;
          }
      }
  }

  // Beam Logic
  let bestTarget: Entity | null = null;
  const candidates: Entity[] = [];

  // Identify IDs locked by NPCs to prevent 2-on-1
  const lockedByNPCs = new Set(npcs.map(n => n.beamTargetId).filter(id => id !== null));

  // 1. Add NPCs
  npcs.forEach(n => {
      // Must not be targeted by a Believer
      if (lockedByNPCs.has(n.id)) return;
      
      // RULE: Beams cannot target Normal NPCs. Must use Wave first.
      if (n.state === NPCState.Normal) return;

      if (distance(player.position, n.position) <= player.beamRange &&
          n.state !== NPCState.Believer_A &&
          n.state !== NPCState.Believer_B) {
          candidates.push(n);
      }
  });

  // 2. Add Enemy Leader
  if (enemy && !enemy.isDead && distance(player.position, enemy.position) <= CONFIG.LEADER_VS_LEADER_RANGE) {
      candidates.push(enemy);
  }

  candidates.sort((a, b) => distance(player.position, a.position) - distance(player.position, b.position));
  if (candidates.length > 0) bestTarget = candidates[0];

  player.beamTargetId = bestTarget ? bestTarget.id : null;

  if (bestTarget && bestTarget.id !== 'enemy_leader') {
    const npcTarget = bestTarget as NPC;
    const isStealing = getFaction(npcTarget.state) === 'B';
    const multiplier = isStealing ? 0.66 : 1.0;
    
    let rate = CONFIG.RATE_PLAYER_AWARE; 
    let threshold = CONFIG.PROGRESS_TO_PERSUADED;

    if (npcTarget.state === NPCState.Aware_A || npcTarget.state === NPCState.Aware_B) {
        rate = CONFIG.RATE_PLAYER_AWARE;
        threshold = CONFIG.PROGRESS_TO_PERSUADED;
    } else {
        rate = CONFIG.RATE_PLAYER_PERSUADED;
        threshold = CONFIG.PROGRESS_TO_BELIEVER;
    }
    
    npcTarget.conversionProgressA += rate * multiplier * dt;
    npcTarget.conversionProgressB = Math.max(0, npcTarget.conversionProgressB - rate * dt);

    if (npcTarget.conversionProgressA >= threshold) {
      addParticle({
        id: Math.random().toString(),
        position: { ...npcTarget.position },
        life: 0.5,
        maxLife: 0.5,
        type: 'convert_effect',
        size: 20,
        color: '#fff'
      });
      playSfx('convert');

      npcTarget.conversionProgressA = 0;
      npcTarget.conversionProgressB = 0;

      // REVERSION LOGIC: If converting Persuaded B -> Normal
      if (npcTarget.state === NPCState.Persuaded_B) {
          npcTarget.state = NPCState.Normal;
      } 
      // STANDARD LOGIC
      else if (npcTarget.state === NPCState.Aware_A || npcTarget.state === NPCState.Aware_B) {
          npcTarget.state = NPCState.Persuaded_A;
      } 
      else if (npcTarget.state === NPCState.Persuaded_A) {
          npcTarget.state = NPCState.Believer_A;
      }
      
      npcTarget.debateTargetId = null;
    }
  }
};

export const updateEnemy = (
    enemy: Enemy,
    dt: number,
    npcs: NPC[],
    player: Player,
    spawnWave: (w: ActiveWave) => void,
    addParticle: (p: Particle) => void,
    mapDim: { width: number, height: number },
    walls: Wall[] = []
) => {
    if (enemy.isDead) return;

    // --- DAMAGE FROM SIEGE ---
    const siegingNPCs = npcs.filter(n => n.debateTargetId === enemy.id && n.state === NPCState.Believer_A);
    if (siegingNPCs.length > 0) {
        let siegeDamage = 0;
        siegingNPCs.forEach(n => {
            const mult = n.role === 'opinion_leader' ? CONFIG.OPINION_LEADER_POWER_MULT : 1;
            siegeDamage += CONFIG.SIEGE_DAMAGE_TICK * mult * dt;
        });
        enemy.hp -= siegeDamage;

        if (enemy.hp <= 0) {
            enemy.isDead = true;
            enemy.hp = 0;
            // Spawn HUGE explosion
            addParticle({
                id: 'enemy_death',
                position: { ...enemy.position },
                life: 2.0,
                maxLife: 2.0,
                type: 'leader_death',
                size: 100,
                color: '#ef4444'
            });
            return; // Stop processing
        }
    }

    // 1. AI Decision (HIGH LEVEL STRATEGY - WHO TO TARGET)
    enemy.decisionTimer -= dt;
    if (enemy.decisionTimer <= 0) {
        enemy.decisionTimer = randomRange(1.0, 3.0);
        
        const nearby = npcs.filter(n => distance(enemy.position, n.position) < 400); 
        
        const upgradeCandidates = nearby.filter(n => n.state === NPCState.Persuaded_B || n.state === NPCState.Aware_B);
        const normalCandidates = nearby.filter(n => n.state === NPCState.Normal);
        const stealCandidates = nearby.filter(n => n.state === NPCState.Persuaded_A || n.state === NPCState.Aware_A);
        
        let target: NPC | null = null;
        
        if (upgradeCandidates.length > 0) {
             target = upgradeCandidates.find(n => n.state === NPCState.Persuaded_B) 
                   || upgradeCandidates.sort((a,b) => distance(enemy.position, a.position) - distance(enemy.position, b.position))[0];
        }
        else if (normalCandidates.length > 0) {
             target = normalCandidates.sort((a,b) => distance(enemy.position, a.position) - distance(enemy.position, b.position))[0];
        }
        else if (stealCandidates.length > 0) {
             target = stealCandidates.sort((a,b) => distance(enemy.position, a.position) - distance(enemy.position, b.position))[0];
        }
        
        if (target) {
            enemy.chaseTargetId = target.id;
            enemy.state = 'converting';
        } else {
            enemy.chaseTargetId = null;
            enemy.state = 'wandering';
        }
        
        // AOE Logic
        if (enemy.aoeCooldown <= 0) {
            const count = nearby.filter(n => distance(enemy.position, n.position) < enemy.aoeRadius && (n.state === NPCState.Normal || n.state.includes('_A'))).length;
            if (count >= 3) {
                 enemy.aoeCooldown = enemy.maxAoeCooldown;
                 spawnWave({
                    id: `wave_e_${Math.random()}`,
                    center: { ...enemy.position },
                    currentRadius: 10,
                    maxRadius: enemy.aoeRadius,
                    speed: 350,
                    color: 'rgba(239, 68, 68, 0.5)', // Red
                    sourceType: 'enemy'
                });
            }
        }
    }
    
    if (enemy.aoeCooldown > 0) enemy.aoeCooldown -= dt;

    // --- Debate Support Logic (Find Closest) ---
    enemy.activeDebateId = null;
    let minDebateDist = CONFIG.R_HELP_BIG;
  
    for (const n of npcs) {
        if (n.debateRole === 'center' && getFaction(n.state) === 'B') {
            const d = distance(enemy.position, n.position);
            if (d < minDebateDist) {
                minDebateDist = d;
                enemy.activeDebateId = n.id;
            }
        }
    }

    // 2. MOVEMENT PATHING (TACTICAL MOVEMENT - HOW TO MOVE)
    enemy.pathingTimer -= dt;
    if (enemy.pathingTimer <= 0) {
        enemy.pathingTimer = randomRange(0.4, 0.8); // Reaction delay (Human-like)

        if (enemy.state === 'converting' && enemy.chaseTargetId) {
            const t = npcs.find(n => n.id === enemy.chaseTargetId);
            
            // Check if target is still valid/useful
            if (t && !t.state.includes('Believer')) {
                const dist = distance(enemy.position, t.position);
                
                // NERF: If within comfortable beam range, STOP chasing to avoid sticking to them
                const comfortableRange = enemy.beamRange * 0.8;
                
                if (dist < comfortableRange) {
                    // Stop moving, just hold position and beam
                    enemy.targetPos = { ...enemy.position };
                } else {
                    enemy.targetPos = { ...t.position };
                }
            } else {
                enemy.chaseTargetId = null;
                enemy.state = 'wandering';
                enemy.targetPos = {
                    x: randomRange(50, mapDim.width - 50),
                    y: randomRange(50, mapDim.height - 50)
                };
            }
        } else if (enemy.state === 'wandering') {
            if (distance(enemy.position, enemy.targetPos) < 20) {
                enemy.targetPos = {
                    x: randomRange(50, mapDim.width - 50),
                    y: randomRange(50, mapDim.height - 50)
                };
            }
        }
    }

    // Execute Move
    const dist = distance(enemy.position, enemy.targetPos);
    if (dist > 5) {
        const dir = normalize({ x: enemy.targetPos.x - enemy.position.x, y: enemy.targetPos.y - enemy.position.y });
        enemy.position.x += dir.x * enemy.moveSpeed * dt;
        enemy.position.y += dir.y * enemy.moveSpeed * dt;
    }
    
    enemy.position.x = Math.max(enemy.radius, Math.min(mapDim.width - enemy.radius, enemy.position.x));
    enemy.position.y = Math.max(enemy.radius, Math.min(mapDim.height - enemy.radius, enemy.position.y));

    resolveWallCollision(enemy, walls);

    // 3. Beam Logic
    let bestTarget: Entity | null = null;
    const targets: Entity[] = [];

    // Identify IDs locked by Believers (Strict 1-to-1 avoidance for AI too)
    const lockedByNPCs = new Set(npcs.map(n => n.beamTargetId).filter(id => id !== null));

    npcs.forEach(n => {
        if (lockedByNPCs.has(n.id)) return;
        
        // RULE: Cannot beam Normal NPCs
        if (n.state === NPCState.Normal) return;

        if (distance(enemy.position, n.position) <= enemy.beamRange &&
            n.state !== NPCState.Believer_B &&
            n.state !== NPCState.Believer_A) {
            targets.push(n);
        }
    });

    if (distance(enemy.position, player.position) <= CONFIG.LEADER_VS_LEADER_RANGE) {
        targets.push(player);
    }

    targets.sort((a, b) => {
        const getScore = (e: Entity) => {
            if (e.id === 'player') return 0;
            const n = e as NPC;
            if (n.state === NPCState.Persuaded_B) return 10; 
            if (n.state === NPCState.Aware_B) return 8;     
            if (n.state === NPCState.Normal) return 0; // Invalid target for beam actually    
            return 2; 
        };

        const scoreA = getScore(a);
        const scoreB = getScore(b);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return distance(enemy.position, a.position) - distance(enemy.position, b.position);
    });

    if (targets.length > 0) bestTarget = targets[0];
    
    enemy.beamTargetId = bestTarget ? bestTarget.id : null;
    
    if (bestTarget && bestTarget.id !== 'player') {
        const npcTarget = bestTarget as NPC;
        const isStealing = getFaction(npcTarget.state) === 'A';
        const multiplier = isStealing ? 0.66 : 1.0;
        const rate = CONFIG.RATE_ENEMY_AWARE * multiplier;
        const threshold = (npcTarget.state.includes('Persuaded')) ? CONFIG.PROGRESS_TO_BELIEVER : CONFIG.PROGRESS_TO_PERSUADED;
        
        npcTarget.conversionProgressB += rate * dt;
        npcTarget.conversionProgressA = Math.max(0, npcTarget.conversionProgressA - rate * dt);
        
        if (npcTarget.conversionProgressB >= threshold) {
             npcTarget.conversionProgressB = 0;
             npcTarget.conversionProgressA = 0;
             
             // REVERSION LOGIC: If converting Persuaded A -> Normal
             if (npcTarget.state === NPCState.Persuaded_A) {
                 npcTarget.state = NPCState.Normal;
             }
             // STANDARD LOGIC
             else if (npcTarget.state.includes('Aware')) {
                 npcTarget.state = NPCState.Persuaded_B;
             }
             else if (npcTarget.state.includes('Persuaded')) {
                 npcTarget.state = NPCState.Believer_B;
             }
             
             npcTarget.debateTargetId = null;
        }
    }
};

export const updatePortals = (portals: Portal[], dt: number) => {
    portals.forEach(p => {
        if (p.cooldown > 0) {
            p.cooldown -= dt;
        }
    });
};

export const updateNPC = (
    npc: NPC, 
    dt: number, 
    allNPCs: NPC[], 
    player: Player,
    addParticle: (p: Particle) => void,
    spawnWave: (w: ActiveWave) => void,
    playSfx: (type: 'aoe' | 'convert') => void,
    enemy: Enemy | null,
    conversionRateMultiplier: number = 1.0,
    mapDim: { width: number, height: number },
    walls: Wall[] = [],
    portals: Portal[] = []
) => {

  const myFaction = getFaction(npc.state);
  const isBeliever = npc.state === NPCState.Believer_A || npc.state === NPCState.Believer_B;
  const isOpinionLeader = npc.role === 'opinion_leader';
  const npcIdNum = parseInt(npc.id.split('_')[1] || '0', 10);

  // --- 0. Clean Up Invalid Targets ---
  if (npc.debateTargetId) {
      if (npc.debateTargetId === 'enemy_leader') {
          // Special Case: Sieging Enemy Leader
          if (enemy && (enemy.isDead || distance(npc.position, enemy.position) > CONFIG.R_HELP_BIG * 2)) {
               npc.debateTargetId = null;
               npc.debateRole = 'none';
          }
      } else {
           const t = allNPCs.find(n => n.id === npc.debateTargetId);
           // If target gone, or no longer believer, or switched sides
           if (!t || !t.state.includes('Believer') || getFaction(t.state) === myFaction) {
               npc.debateTargetId = null;
               npc.debateRole = 'none';
           }
      }
  }

  // --- MUTUAL EXCLUSIVITY ---
  if (npc.debateTargetId) {
      npc.beamTargetId = null;
  }
  
  // --- SPECIAL: OPINION LEADER WAVE ---
  if (isBeliever && isOpinionLeader) {
      npc.opinionWaveTimer -= dt;
      if (npc.opinionWaveTimer <= 0) {
          npc.opinionWaveTimer = CONFIG.OPINION_LEADER_WAVE_CD;
          
          spawnWave({
            id: `wave_ol_${npc.id}_${Math.random()}`,
            center: { ...npc.position },
            currentRadius: 5,
            maxRadius: CONFIG.OPINION_LEADER_WAVE_RADIUS, // 50% of Player Wave
            speed: 300,
            color: myFaction === 'A' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(239, 68, 68, 0.4)',
            sourceType: myFaction === 'A' ? 'player' : 'enemy' // Mimics leader wave logic
          });
          playSfx('aoe');
      }
  }

  // --- TOTAL WAR LOGIC (Player Believers > 80%) ---
  const totalPop = allNPCs.length + 2; // + player + enemy
  const believerACount = allNPCs.filter(n => n.state === NPCState.Believer_A).length;
  const isTotalWar = (believerACount / totalPop) >= CONFIG.TOTAL_WAR_THRESHOLD;

  // New TOTAL WAR Priority: 
  // 1. Hunt down ANY Non-Believer (Normal, Aware, Persuaded, Enemy Believer)
  // 2. Only if ALL NPCs are Believer_A, then Siege Leader.

  if (isTotalWar && myFaction === 'A' && isBeliever && !npc.debateTargetId && enemy && !enemy.isDead) {
      
      // Find nearest non-believer
      let nearestNonBeliever: NPC | null = null;
      let minDst = Infinity;
      
      allNPCs.forEach(n => {
          if (n.state !== NPCState.Believer_A) {
              const d = distance(npc.position, n.position);
              if (d < minDst) {
                  minDst = d;
                  nearestNonBeliever = n;
              }
          }
      });
      
      if (nearestNonBeliever) {
          // If we found a non-believer, go for them
          
          if (nearestNonBeliever.state === NPCState.Believer_B) {
              // Priority: DEBATE Enemy Believers
              if (distance(npc.position, nearestNonBeliever.position) < CONFIG.R_DETECT_BELIEVER) {
                   addParticle({
                      id: `ring_big_${Math.random()}`,
                      position: { ...npc.position },
                      life: 0.8,
                      maxLife: 0.8,
                      type: 'help_ring_big',
                      size: CONFIG.R_HELP_BIG,
                      color: '#fff'
                  });
                  npc.debateTargetId = nearestNonBeliever.id;
                  npc.debateRole = 'center';
                  npc.debateDurability = CONFIG.DEBATE_DURABILITY_MAX;
                  npc.debateSignalTimer = 0;
                  
                  if (!nearestNonBeliever.debateTargetId) {
                      nearestNonBeliever.debateTargetId = npc.id;
                      nearestNonBeliever.debateRole = 'center';
                      nearestNonBeliever.debateDurability = CONFIG.DEBATE_DURABILITY_MAX;
                  }
              }
          } else {
              // It's a Normal, Aware, or Persuaded.
              // Standard Believers can only BEAM Aware/Persuaded.
              // If it's Normal, they can't do anything but wait for a wave.
              // But we should move them closer to "Siege" the potential convert.
              // Logic is handled in MOVEMENT override below.
          }
          
      } else {
          // 2. If NO Non-Believers remain (All are Believers), Siege the Leader
          if (distance(npc.position, enemy.position) < CONFIG.R_HELP_BIG) {
              npc.debateTargetId = enemy.id;
              npc.debateRole = 'center'; // Attacker
          }
      }
  }


  // --- 1. ADVERSARIAL SCAN (Debate Only) ---
  if (isBeliever && !npc.debateTargetId) {
      
      const enemyFaction = myFaction === 'A' ? 'B' : 'A';
      
      // Check for Debate (Believer vs Believer)
      const enemyBeliever = allNPCs.find(n => 
          n.state === (myFaction === 'A' ? NPCState.Believer_B : NPCState.Believer_A) &&
          distance(npc.position, n.position) < CONFIG.R_DETECT_BELIEVER &&
          !n.debateTargetId 
      );

      if (enemyBeliever) {
          addParticle({
              id: `ring_big_${Math.random()}`,
              position: { ...npc.position },
              life: 0.8,
              maxLife: 0.8,
              type: 'help_ring_big',
              size: CONFIG.R_HELP_BIG,
              color: myFaction === 'A' ? '#fff' : '#ef4444'
          });
          
          npc.debateTargetId = enemyBeliever.id;
          npc.debateRole = 'center';
          npc.debateDurability = CONFIG.DEBATE_DURABILITY_MAX;
          npc.debateSignalTimer = 0; // Call for help IMMEDIATELY
          
          enemyBeliever.debateTargetId = npc.id;
          enemyBeliever.debateRole = 'center';
          enemyBeliever.debateDurability = CONFIG.DEBATE_DURABILITY_MAX;
          enemyBeliever.debateSignalTimer = 0; // Call for help IMMEDIATELY
          
          npc.beamTargetId = null;
          enemyBeliever.beamTargetId = null;
      }
  }


  // --- 2. MOVEMENT & ACTION ---
  
  let target = npc.wanderTarget;
  let speed = npc.moveSpeed;
  const SAFE_MARGIN = 20;

  // SPECIAL MOVEMENT OVERRIDE FOR TOTAL WAR (Hunt down enemies)
  if (isTotalWar && myFaction === 'A' && isBeliever && !npc.debateTargetId && enemy && !enemy.isDead) {
      
      // Find nearest non-believer to siege
      let nearestNonBeliever: NPC | null = null;
      let minDst = Infinity;
      allNPCs.forEach(n => {
          if (n.state !== NPCState.Believer_A) {
              const d = distance(npc.position, n.position);
              if (d < minDst) {
                  minDst = d;
                  nearestNonBeliever = n;
              }
          }
      });

      if (nearestNonBeliever) {
          target = nearestNonBeliever.position;
          speed = npc.moveSpeed * 1.2;
      } else {
          // If no non-believers, attack boss
          target = enemy.position;
          speed = npc.moveSpeed * 1.2;
      }
  }

  // PRIORITY 1: DEBATE / SIEGE
  if (npc.debateTargetId) {
      // Check if target is NPC or Enemy Leader
      let debateOpponentPos: Vector | null = null;
      let debateOpponentRole: 'standard' | 'opinion_leader' | 'leader' = 'standard';

      if (npc.debateTargetId === 'enemy_leader' && enemy) {
          debateOpponentPos = enemy.position;
          debateOpponentRole = 'leader';
      } else {
          const t = allNPCs.find(n => n.id === npc.debateTargetId);
          if (t) {
              debateOpponentPos = t.position;
              debateOpponentRole = t.role;
          }
      }

      if (debateOpponentPos) {
          if (npc.debateRole === 'center') {
             // Center Position
             const midX = (npc.position.x + debateOpponentPos.x) / 2;
             const midY = (npc.position.y + debateOpponentPos.y) / 2;
             const dir = normalize({ x: npc.position.x - debateOpponentPos.x, y: npc.position.y - debateOpponentPos.y });
             
             target = {
                 x: midX + dir.x * 30,
                 y: midY + dir.y * 30
             };
             
             // Periodic Help Signal
             npc.debateSignalTimer -= dt;
             if (npc.debateSignalTimer <= 0) {
                 npc.debateSignalTimer = CONFIG.DEBATE_SIGNAL_INTERVAL;
                 addParticle({
                    id: `ring_big_${Math.random()}`,
                    position: { ...npc.position },
                    life: 0.8,
                    maxLife: 0.8,
                    type: 'help_ring_big',
                    size: CONFIG.R_HELP_BIG,
                    color: myFaction === 'A' ? '#fff' : '#ef4444'
                 });
                 
                 // RECRUITMENT LOGIC UPDATE: Recruit Believers AND Persuaded
                 const potentialAllies = allNPCs.filter(n => 
                    n.id !== npc.id && 
                    getFaction(n.state) === myFaction && // Same Faction
                    (n.state.includes('Believer') || n.state.includes('Persuaded')) && // Believer or Persuaded
                    !n.debateTargetId &&
                    distance(npc.position, n.position) < CONFIG.R_HELP_BIG
                );
                
                potentialAllies.forEach(ally => {
                    ally.debateTargetId = npc.debateTargetId; // Target the same enemy (NPC or Leader)
                    ally.debateRole = 'supporter';
                    ally.beamTargetId = null; // PRIORITY: Drop beam immediately
                });
             }
             
             // Damage Calculation (NPC vs NPC only, Leader dmg handled in updateEnemy)
             if (debateOpponentRole !== 'leader') {
                 const debateOpponent = allNPCs.find(n => n.id === npc.debateTargetId);
                 if (debateOpponent) {
                     const range = CONFIG.R_HELP_BIG;
                     
                     // Count Supporters (ONLY Believers contribute power) + Leader Buff
                     const calculatePower = (supporters: NPC[], mainLeaderId: string | null) => {
                         let power = 0;
                         supporters.forEach(s => {
                             power += (s.role === 'opinion_leader' ? CONFIG.OPINION_LEADER_POWER_MULT : 1);
                         });
                         // Leader Buff
                         if (mainLeaderId && mainLeaderId === npc.id) power += CONFIG.LEADER_DEBATE_WEIGHT; 
                         else if (mainLeaderId && mainLeaderId === debateOpponent.id) power += CONFIG.LEADER_DEBATE_WEIGHT;
                         
                         return power;
                     };

                     const mySupporters = allNPCs.filter(n => 
                         n.debateTargetId === debateOpponent.id && 
                         getFaction(n.state) === myFaction && 
                         n.state.includes('Believer') && 
                         distance(npc.position, n.position) < range
                     );

                     const enemySupporters = allNPCs.filter(n => 
                         n.debateTargetId === npc.id && 
                         getFaction(n.state) !== myFaction && 
                         n.state.includes('Believer') && 
                         distance(debateOpponent.position, n.position) < range
                     );

                     // Base power
                     let myPower = (isOpinionLeader ? CONFIG.OPINION_LEADER_POWER_MULT : 1);
                     let enemyPower = (debateOpponent.role === 'opinion_leader' ? CONFIG.OPINION_LEADER_POWER_MULT : 1);

                     // Add supporter power
                     mySupporters.forEach(s => myPower += (s.role === 'opinion_leader' ? CONFIG.OPINION_LEADER_POWER_MULT : 1));
                     enemySupporters.forEach(s => enemyPower += (s.role === 'opinion_leader' ? CONFIG.OPINION_LEADER_POWER_MULT : 1));

                     // Leader Buff
                     if (myFaction === 'A') {
                         if (player.activeDebateId === npc.id) myPower += CONFIG.LEADER_DEBATE_WEIGHT;
                         if (enemy && enemy.activeDebateId === debateOpponent.id) enemyPower += CONFIG.LEADER_DEBATE_WEIGHT;
                     } else {
                         if (enemy && enemy.activeDebateId === npc.id) myPower += CONFIG.LEADER_DEBATE_WEIGHT;
                         if (player.activeDebateId === debateOpponent.id) enemyPower += CONFIG.LEADER_DEBATE_WEIGHT;
                     }
                     
                     const delta = myPower - enemyPower;
                     
                     // DAMAGE UPDATE: Opinion Leaders deal double damage
                     const dmgMultiplier = (isOpinionLeader && delta > 0) || (debateOpponent.role === 'opinion_leader' && delta < 0) ? CONFIG.OPINION_LEADER_POWER_MULT : 1.0;
                     const damage = CONFIG.DEBATE_DAMAGE_BASE * Math.abs(delta) * dmgMultiplier * dt;

                     if (delta > 0) {
                         debateOpponent.debateDurability -= damage;
                     } else if (delta < 0) {
                         npc.debateDurability -= damage;
                     }
                     
                     // Resolve Defeat
                     if (npc.debateDurability <= 0) {
                         // Cleanse ALL supporters
                         const allMyFollowers = allNPCs.filter(n => n.debateTargetId === debateOpponent.id && getFaction(n.state) === myFaction);
                         
                         [npc, ...allMyFollowers].forEach(loser => {
                             loser.state = NPCState.Normal;
                             loser.debateTargetId = null;
                             loser.debateRole = 'none';
                             addParticle({
                                id: `cleanse_${Math.random()}`,
                                position: { ...loser.position },
                                life: 1.0,
                                maxLife: 1.0,
                                type: 'cleansing_shockwave',
                                size: 30,
                                color: myFaction === 'A' ? '#ffffff' : '#ef4444' 
                             });
                         });
                         // Opponent wins
                         debateOpponent.debateTargetId = null;
                         debateOpponent.debateRole = 'none';
                         const enemyAllies = allNPCs.filter(n => n.debateTargetId === npc.id); 
                         enemyAllies.forEach(win => {
                             win.debateTargetId = null;
                             win.debateRole = 'none';
                         });
                         playSfx('convert'); 
                     }
                 }
             }
             
          } else {
              // Supporter Logic
              const center = allNPCs.find(n => n.debateTargetId === npc.debateTargetId && n.debateRole === 'center' && n.id !== npc.id);
              
              if (center) {
                  const dirToEnemy = normalize({ x: debateOpponentPos.x - center.position.x, y: debateOpponentPos.y - center.position.y });
                  const baseAngle = Math.atan2(dirToEnemy.y, dirToEnemy.x) + Math.PI;
                  const offsetAngle = (npcIdNum % 5 - 2) * 0.4;
                  const standDist = CONFIG.DEBATE_SUPPORT_RADIUS + (npcIdNum % 3) * 10;
                  
                  target = {
                      x: center.position.x + Math.cos(baseAngle + offsetAngle) * standDist,
                      y: center.position.y + Math.sin(baseAngle + offsetAngle) * standDist
                  };
              } else if (npc.debateTargetId === 'enemy_leader') {
                  npc.debateRole = 'center'; // Promote to attacker
              } else {
                  npc.debateTargetId = null;
                  npc.debateRole = 'none';
              }
          }
          speed = npc.moveSpeed * 1.5; 
          if (distance(npc.position, target) < 5) speed = 0;
      }
  }
  // PRIORITY 2: Standard Beam & Wander
  else {
      
      // Strict 1-on-1 Yield Check
      if (npc.beamTargetId) {
          if (player.beamTargetId === npc.beamTargetId || (enemy && enemy.beamTargetId === npc.beamTargetId)) {
              npc.beamTargetId = null;
          }
      }

      // Believer Beam Selection
      if (isBeliever && !npc.beamTargetId) {
          const range = CONFIG.BELIEVER_BEAM_RANGE;
          const restrictedIds = new Set<string>();
          if (player.beamTargetId) restrictedIds.add(player.beamTargetId);
          if (enemy && enemy.beamTargetId) restrictedIds.add(enemy.beamTargetId);
          allNPCs.forEach(n => {
              if (n.id !== npc.id && n.beamTargetId) restrictedIds.add(n.beamTargetId);
          });

          const cand = allNPCs.find(n => 
              n.id !== npc.id &&
              distance(npc.position, n.position) < range &&
              (
                  n.state === (myFaction === 'A' ? NPCState.Aware_A : NPCState.Aware_B) ||
                  n.state === (myFaction === 'A' ? NPCState.Persuaded_A : NPCState.Persuaded_B)
              ) &&
              // TOTAL WAR OVERRIDE: If Total War (80%), bypass 1-on-1 restriction to allow swarming
              (!restrictedIds.has(n.id) || (isTotalWar && myFaction === 'A'))
          );
          
          if (cand) {
             const isEnemyPersuaded = (myFaction === 'A' && cand.state === NPCState.Persuaded_B) || 
                                      (myFaction === 'B' && cand.state === NPCState.Persuaded_A);
             
             // RULE: Standard NPCs CANNOT target Enemy Persuaded. Opinion Leaders CAN.
             const canTargetPersuaded = isOpinionLeader;

             if (!isEnemyPersuaded || canTargetPersuaded) {
                 npc.beamTargetId = cand.id;
             }
          }
      }
      
      // Execute Beam
      if (isBeliever && npc.beamTargetId) {
          const t = allNPCs.find(n => n.id === npc.beamTargetId);
          const maxChaseDist = CONFIG.BELIEVER_BEAM_RANGE * 1.5;
          
          if (t && distance(npc.position, t.position) < maxChaseDist) {
              const optimalRange = 50; 
              if (distance(npc.position, t.position) > optimalRange) {
                  target = t.position;
                  speed = npc.moveSpeed;
              } else {
                  target = npc.position; 
                  speed = 0;
              }

              const progProp = myFaction === 'A' ? 'conversionProgressA' : 'conversionProgressB';
              const threshold = CONFIG.PROGRESS_TO_BELIEVER;
              const powerMult = isOpinionLeader ? CONFIG.OPINION_LEADER_POWER_MULT : 1.0;
              
              (t as any)[progProp] += CONFIG.RATE_BELIEVER * dt * conversionRateMultiplier * powerMult;
              
              if ((t as any)[progProp] >= threshold) {
                   (t as any)[progProp] = 0;
                   
                   const isEnemyPersuaded = (myFaction === 'A' && t.state === NPCState.Persuaded_B) || 
                                            (myFaction === 'B' && t.state === NPCState.Persuaded_A);

                   // REVERSION LOGIC: Opinion Leader hitting Persuaded Enemy -> Normal
                   if (isEnemyPersuaded) {
                       t.state = NPCState.Normal;
                   } 
                   // STANDARD LOGIC
                   else if (t.state.includes('Aware')) {
                       t.state = myFaction === 'A' ? NPCState.Persuaded_A : NPCState.Persuaded_B;
                   }
                   else if (t.state.includes('Persuaded')) {
                       t.state = myFaction === 'A' ? NPCState.Believer_A : NPCState.Believer_B;
                   }
                   
                   addParticle({
                        id: Math.random().toString(),
                        position: { ...t.position },
                        life: 0.5,
                        maxLife: 0.5,
                        type: 'convert_effect',
                        size: 15,
                        color: myFaction === 'A' ? '#38bdf8' : '#c084fc'
                   });
                   npc.beamTargetId = null; 
              }
          } else {
              npc.beamTargetId = null; 
          }
      }

      // Aware Logic
      if (!npc.beamTargetId) { 
        if (npc.awareCenter && npc.awareSeekTimer > 0) {
            npc.awareSeekTimer -= dt;
            const dToCenter = distance(npc.position, npc.awareCenter);
            if (dToCenter > CONFIG.AWARE_STOP_RADIUS) {
                target = npc.awareCenter;
                speed = npc.moveSpeed * 1.2;
            } else {
                npc.awareActionTimer -= dt;
                if (npc.awareActionTimer <= 0) {
                    npc.awareIsMoving = !npc.awareIsMoving;
                    npc.awareActionTimer = randomRange(0.5, 1.5);
                    if (npc.awareIsMoving) {
                        const ang = Math.random() * 6.28;
                        const dist = randomRange(10, 50);
                        npc.awareLocalTarget = {
                            x: npc.awareCenter.x + Math.cos(ang) * dist,
                            y: npc.awareCenter.y + Math.sin(ang) * dist
                        };
                    }
                }
                if (npc.awareIsMoving) target = npc.awareLocalTarget;
                else speed = 0;
            }
        } else {
             // WANDER LOGIC - Constrained
             const distToTarget = distance(npc.position, npc.wanderTarget);
             if (distToTarget < 10) {
                  // PICK NEW TARGET with Obstacle Avoidance
                  let foundValidTarget = false;
                  let attempts = 0;
                  
                  while (!foundValidTarget && attempts < 5) {
                      const angle = Math.random() * Math.PI * 2;
                      const r = Math.sqrt(Math.random()) * npc.homeRadius;
                      let tx = npc.homeCenter.x + Math.cos(angle) * r;
                      let ty = npc.homeCenter.y + Math.sin(angle) * r;
                      
                      // Clamp to Bound
                      if (npc.wanderBounds) {
                           tx = clamp(tx, npc.wanderBounds.x, npc.wanderBounds.x + npc.wanderBounds.width);
                           ty = clamp(ty, npc.wanderBounds.y, npc.wanderBounds.y + npc.wanderBounds.height);
                      } else {
                           tx = clamp(tx, SAFE_MARGIN, mapDim.width - SAFE_MARGIN);
                           ty = clamp(ty, SAFE_MARGIN, mapDim.height - SAFE_MARGIN);
                      }
                      
                      // Raycast Check: Can we walk straight there without hitting a wall?
                      let hitWall = false;
                      for (const wall of walls) {
                          if (lineIntersectsRect(npc.position, {x: tx, y: ty}, wall)) {
                              hitWall = true;
                              break;
                          }
                      }
                      
                      if (!hitWall) {
                          npc.wanderTarget = { x: tx, y: ty };
                          foundValidTarget = true;
                      }
                      attempts++;
                  }
                  
                  // Fallback: If all attempts fail, pick random nearby point (less aggressive) or stay put
                  if (!foundValidTarget) {
                       npc.wanderTarget = { ...npc.position }; // Stay put for a cycle to avoid glitching
                  }
             }
        }
      }
  }

  // --- PORTAL CHECK ---
  if (portals.length > 0) {
      for (const p of portals) {
          if (p.cooldown <= 0 && distance(npc.position, p.position) < p.radius) {
              // TELEPORT
              npc.position = { ...p.targetPosition };
              npc.velocity = { x: 0, y: 0 };
              npc.wanderTarget = { ...p.targetPosition }; // Reset wander
              
              // Trigger Cooldowns (For the portal used AND its pair)
              p.cooldown = p.maxCooldown;
              const pair = portals.find(pp => pp.id === p.pairId);
              if (pair) pair.cooldown = pair.maxCooldown;
              
              addParticle({
                  id: `tp_${Math.random()}`,
                  position: { ...p.position },
                  life: 0.5,
                  maxLife: 0.5,
                  type: 'teleport',
                  size: 30,
                  color: '#4ade80' // Green
              });
              
               addParticle({
                  id: `tp_out_${Math.random()}`,
                  position: { ...p.targetPosition },
                  life: 0.5,
                  maxLife: 0.5,
                  type: 'teleport',
                  size: 30,
                  color: '#4ade80'
              });
              
              playSfx('aoe'); // Reuse SFX
              break; // Only one teleport per frame
          }
      }
  }

  // Velocity
  if (speed > 0) {
    const dir = normalize({ x: target.x - npc.position.x, y: target.y - npc.position.y });
    npc.velocity = { x: dir.x * speed, y: dir.y * speed };
    npc.position.x += npc.velocity.x * dt;
    npc.position.y += npc.velocity.y * dt;
  } else {
      npc.velocity = { x: 0, y: 0 };
  }

  // Collision Resolution (Player)
  const playerHitRadius = player.radius * CONFIG.PLAYER_HITBOX_RATIO;
  const minSeparation = npc.radius + playerHitRadius;
  const dToPlayer = distance(npc.position, player.position);

  if (dToPlayer < minSeparation && dToPlayer > 0) {
      const pushDir = normalize({ x: npc.position.x - player.position.x, y: npc.position.y - player.position.y });
      const overlapAmount = minSeparation - dToPlayer;
      npc.position.x += pushDir.x * overlapAmount;
      npc.position.y += pushDir.y * overlapAmount;
  }

  // Collision Resolution (Other NPCs)
  const npcSeparation = CONFIG.NPC_MIN_SEPARATION;
  for (const other of allNPCs) {
      if (other.id === npc.id) continue;
      
      const d = distance(npc.position, other.position);
      if (d < npcSeparation && d > 0) {
           const overlap = npcSeparation - d;
           const pushDir = normalize({ 
               x: npc.position.x - other.position.x, 
               y: npc.position.y - other.position.y 
           });
           
           // Soft push to avoid jitter (0.2 correction factor per frame)
           npc.position.x += pushDir.x * overlap * 0.2;
           npc.position.y += pushDir.y * overlap * 0.2;
      }
  }
  
  // Clamp to World
  npc.position.x = Math.max(10, Math.min(mapDim.width - 10, npc.position.x));
  npc.position.y = Math.max(10, Math.min(mapDim.height - 10, npc.position.y));

  resolveWallCollision(npc, walls);
};