

import { CONFIG, WORLD_HEIGHT, WORLD_WIDTH } from "../constants";
import { NPC, NPCState, Player, Enemy, Particle, ActiveWave, Entity } from "../types";
import { distance, normalize, randomRange, getFaction } from "./utils";

// --- Factory Functions ---

export const createNPC = (id: string): NPC => {
  const margin = 50;
  const x = randomRange(margin, WORLD_WIDTH - margin);
  const y = randomRange(margin, WORLD_HEIGHT - margin);
  
  return {
    id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    radius: 12,
    state: NPCState.Normal,
    homeCenter: { x: randomRange(x - 100, x + 100), y: randomRange(y - 100, y + 100) },
    homeRadius: randomRange(100, 200),
    wanderTarget: { x, y }, 
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
  state: 'wandering'
});

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
                
                // 1. State Refresh/Mutation (Normal -> Aware)
                if (npc.state === NPCState.Normal) {
                    npc.state = waveFaction === 'A' ? NPCState.Aware_A : NPCState.Aware_B;
                } 
                else if (npcFaction === waveFaction && (npc.state === NPCState.Aware_A || npc.state === NPCState.Aware_B)) {
                    npc.awareSeekTimer = CONFIG.AWARE_STAY_DURATION;
                }

                // 2. Attraction Logic
                let shouldAttract = false;

                if (wave.sourceType === 'player') {
                    // Player Wave Specifics:
                    // Attracts Normal (converted above), Aware_A, Aware_B, Persuaded_A, Persuaded_B, Believer_A.
                    // DOES NOT attract Believer_B.
                    if (npc.state !== NPCState.Believer_B) {
                        shouldAttract = true;
                    }
                } else {
                    // Enemy Wave (Standard logic): Attracts own faction
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
  playSfx: (type: 'aoe' | 'convert') => void
) => {
  // Movement
  if (input.x !== 0 || input.y !== 0) {
    const dir = normalize({ x: input.x, y: input.y });
    player.position.x += dir.x * player.moveSpeed * dt;
    player.position.y += dir.y * player.moveSpeed * dt;
    
    player.position.x = Math.max(player.radius, Math.min(WORLD_WIDTH - player.radius, player.position.x));
    player.position.y = Math.max(player.radius, Math.min(WORLD_HEIGHT - player.radius, player.position.y));
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

  // Beam Logic
  let bestTarget: Entity | null = null;
  const candidates: Entity[] = [];

  // Identify IDs locked by NPCs to prevent 2-on-1
  const lockedByNPCs = new Set(npcs.map(n => n.beamTargetId).filter(id => id !== null));

  // 1. Add NPCs
  npcs.forEach(n => {
      // Must not be targeted by a Believer
      if (lockedByNPCs.has(n.id)) return;

      if (distance(player.position, n.position) <= player.beamRange &&
          n.state !== NPCState.Believer_A &&
          n.state !== NPCState.Believer_B) {
          candidates.push(n);
      }
  });

  // 2. Add Enemy Leader
  if (enemy && distance(player.position, enemy.position) <= CONFIG.LEADER_VS_LEADER_RANGE) {
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

    if (npcTarget.state === NPCState.Normal) {
        threshold = CONFIG.PROGRESS_TO_PERSUADED; 
    } else if (npcTarget.state === NPCState.Aware_A || npcTarget.state === NPCState.Aware_B) {
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

      if (npcTarget.state === NPCState.Normal) npcTarget.state = NPCState.Aware_A;
      else if (npcTarget.state === NPCState.Aware_A || npcTarget.state === NPCState.Aware_B) npcTarget.state = NPCState.Persuaded_A;
      else if (npcTarget.state === NPCState.Persuaded_A || npcTarget.state === NPCState.Persuaded_B) npcTarget.state = NPCState.Believer_A;
      
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
) => {
    // 1. AI Decision (HIGH LEVEL STRATEGY - WHO TO TARGET)
    enemy.decisionTimer -= dt;
    if (enemy.decisionTimer <= 0) {
        enemy.decisionTimer = randomRange(1.0, 3.0);
        
        const nearby = npcs.filter(n => distance(enemy.position, n.position) < 400); 
        
        const upgradeCandidates = nearby.filter(n => n.state === NPCState.Persuaded_B || n.state === NPCState.Aware_B);
        const normalCandidates = nearby.filter(n => n.state === NPCState.Normal);
        const stealCandidates = nearby.filter(n => n.state === NPCState.Persuaded_A || n.state === NPCState.Aware_A);
        
        let target: NPC | null = null;
        
        // Priority: Upgrade own -> Convert Normal -> Steal
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
                    // Update target position (laggy)
                    enemy.targetPos = { ...t.position };
                }
            } else {
                enemy.chaseTargetId = null;
                enemy.state = 'wandering';
                enemy.targetPos = {
                    x: randomRange(50, WORLD_WIDTH - 50),
                    y: randomRange(50, WORLD_HEIGHT - 50)
                };
            }
        } else if (enemy.state === 'wandering') {
            if (distance(enemy.position, enemy.targetPos) < 20) {
                enemy.targetPos = {
                    x: randomRange(50, WORLD_WIDTH - 50),
                    y: randomRange(50, WORLD_HEIGHT - 50)
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
    
    enemy.position.x = Math.max(enemy.radius, Math.min(WORLD_WIDTH - enemy.radius, enemy.position.x));
    enemy.position.y = Math.max(enemy.radius, Math.min(WORLD_HEIGHT - enemy.radius, enemy.position.y));

    // 3. Beam Logic
    let bestTarget: Entity | null = null;
    const targets: Entity[] = [];

    // Identify IDs locked by Believers (Strict 1-to-1 avoidance for AI too)
    const lockedByNPCs = new Set(npcs.map(n => n.beamTargetId).filter(id => id !== null));

    npcs.forEach(n => {
        if (lockedByNPCs.has(n.id)) return;

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
            if (n.state === NPCState.Normal) return 5;      
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
             
             if (npcTarget.state === NPCState.Normal) npcTarget.state = NPCState.Aware_B;
             else if (npcTarget.state.includes('Aware')) npcTarget.state = NPCState.Persuaded_B;
             else if (npcTarget.state.includes('Persuaded')) npcTarget.state = NPCState.Believer_B;
             
             npcTarget.debateTargetId = null;
        }
    }
};

export const updateNPC = (
    npc: NPC, 
    dt: number, 
    allNPCs: NPC[], 
    player: Player,
    addParticle: (p: Particle) => void,
    spawnWave: (w: ActiveWave) => void,
    playSfx: (type: 'aoe' | 'convert') => void,
    enemy: Enemy | null
) => {

  const myFaction = getFaction(npc.state);
  const isBeliever = npc.state === NPCState.Believer_A || npc.state === NPCState.Believer_B;
  const npcIdNum = parseInt(npc.id.split('_')[1] || '0', 10);

  // --- 0. Clean Up Invalid Targets ---
  if (npc.debateTargetId) {
       const t = allNPCs.find(n => n.id === npc.debateTargetId);
       if (!t || !t.state.includes('Believer') || getFaction(t.state) === myFaction) {
           npc.debateTargetId = null;
           npc.debateRole = 'none';
       }
  }

  // --- MUTUAL EXCLUSIVITY ---
  if (npc.debateTargetId) {
      npc.beamTargetId = null;
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
          npc.debateSignalTimer = CONFIG.DEBATE_SIGNAL_INTERVAL;
          
          enemyBeliever.debateTargetId = npc.id;
          enemyBeliever.debateRole = 'center';
          enemyBeliever.debateDurability = CONFIG.DEBATE_DURABILITY_MAX;
          enemyBeliever.debateSignalTimer = CONFIG.DEBATE_SIGNAL_INTERVAL;
          
          npc.beamTargetId = null;
          enemyBeliever.beamTargetId = null;
      }
  }


  // --- 2. MOVEMENT & ACTION ---
  
  let target = npc.wanderTarget;
  let speed = npc.moveSpeed;
  const SAFE_MARGIN = 20;

  // PRIORITY 1: DEBATE
  if (npc.debateTargetId) {
      const debateOpponent = allNPCs.find(n => n.id === npc.debateTargetId);
      if (debateOpponent) {
          if (npc.debateRole === 'center') {
             // Center Position
             const midX = (npc.position.x + debateOpponent.position.x) / 2;
             const midY = (npc.position.y + debateOpponent.position.y) / 2;
             const dir = normalize({ x: npc.position.x - debateOpponent.position.x, y: npc.position.y - debateOpponent.position.y });
             
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
                    ally.debateTargetId = debateOpponent.id;
                    ally.debateRole = 'supporter';
                    ally.beamTargetId = null;
                });
             }
             
             // Damage Calculation (Balance of Power)
             const range = CONFIG.R_HELP_BIG;
             
             // Count Supporters (ONLY Believers contribute power) + Leader Buff
             const mySupporters = allNPCs.filter(n => 
                 n.debateTargetId === debateOpponent.id && 
                 getFaction(n.state) === myFaction && 
                 n.state.includes('Believer') && // ONLY BELIEVERS FIGHT
                 distance(npc.position, n.position) < range
             );

             const enemySupporters = allNPCs.filter(n => 
                 n.debateTargetId === npc.id && 
                 getFaction(n.state) !== myFaction && 
                 n.state.includes('Believer') && // ONLY BELIEVERS FIGHT
                 distance(debateOpponent.position, n.position) < range
             );

             let myPower = mySupporters.length + 1; // +1 for self
             let enemyPower = enemySupporters.length + 1; 

             // Leader Buff
             if (myFaction === 'A') {
                 if (distance(player.position, npc.position) < range) myPower += CONFIG.LEADER_DEBATE_WEIGHT;
                 if (enemy && distance(enemy.position, debateOpponent.position) < range) enemyPower += CONFIG.LEADER_DEBATE_WEIGHT;
             } else {
                 if (enemy && distance(enemy.position, npc.position) < range) myPower += CONFIG.LEADER_DEBATE_WEIGHT;
                 if (distance(player.position, debateOpponent.position) < range) enemyPower += CONFIG.LEADER_DEBATE_WEIGHT;
             }
             
             const delta = myPower - enemyPower;
             
             if (delta > 0) {
                 debateOpponent.debateDurability -= CONFIG.DEBATE_DAMAGE_BASE * Math.abs(delta) * dt;
             } else if (delta < 0) {
                 npc.debateDurability -= CONFIG.DEBATE_DAMAGE_BASE * Math.abs(delta) * dt;
             }
             
             // Resolve Defeat
             if (npc.debateDurability <= 0) {
                 // I lost
                 // Cleanse ALL supporters (Believers AND Persuaded)
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
                        color: myFaction === 'A' ? '#ffffff' : '#ef4444' // Color of who they WERE
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
             
          } else {
              // Supporter Logic (Applies to both Believer and Persuaded supporters)
              const center = allNPCs.find(n => n.debateTargetId === debateOpponent.id && n.debateRole === 'center');
              if (center) {
                  const dirToEnemy = normalize({ x: debateOpponent.position.x - center.position.x, y: debateOpponent.position.y - center.position.y });
                  const baseAngle = Math.atan2(dirToEnemy.y, dirToEnemy.x) + Math.PI;
                  const offsetAngle = (npcIdNum % 5 - 2) * 0.4;
                  const standDist = CONFIG.DEBATE_SUPPORT_RADIUS + (npcIdNum % 3) * 10;
                  
                  target = {
                      x: center.position.x + Math.cos(baseAngle + offsetAngle) * standDist,
                      y: center.position.y + Math.sin(baseAngle + offsetAngle) * standDist
                  };
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
      
      // Strict 1-to-1 Yield Check
      if (npc.beamTargetId) {
          if (player.beamTargetId === npc.beamTargetId || (enemy && enemy.beamTargetId === npc.beamTargetId)) {
              npc.beamTargetId = null;
          }
      }

      // Believer Beam Selection
      if (isBeliever && !npc.beamTargetId) {
          const range = CONFIG.BELIEVER_BEAM_RANGE;
          
          // Get IDs that are off-limits
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
                  n.state === NPCState.Normal || 
                  n.state === (myFaction === 'A' ? NPCState.Aware_A : NPCState.Aware_B) ||
                  n.state === (myFaction === 'A' ? NPCState.Persuaded_A : NPCState.Persuaded_B)
              ) &&
              !restrictedIds.has(n.id) // STRICT
          );
          
          // Constraint: Believers cannot target Enemy Persuaded
          if (cand) {
             const isEnemyPersuaded = (myFaction === 'A' && cand.state === NPCState.Persuaded_B) || 
                                      (myFaction === 'B' && cand.state === NPCState.Persuaded_A);
             
             if (!isEnemyPersuaded) {
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
              const threshold = t.state === NPCState.Normal ? CONFIG.PROGRESS_TO_PERSUADED : CONFIG.PROGRESS_TO_BELIEVER; 
              
              (t as any)[progProp] += CONFIG.RATE_BELIEVER * dt;
              
              if ((t as any)[progProp] >= threshold) {
                   (t as any)[progProp] = 0;
                   if (t.state === NPCState.Normal) t.state = myFaction === 'A' ? NPCState.Aware_A : NPCState.Aware_B;
                   else if (t.state.includes('Aware')) t.state = myFaction === 'A' ? NPCState.Persuaded_A : NPCState.Persuaded_B;
                   else if (t.state.includes('Persuaded')) t.state = myFaction === 'A' ? NPCState.Believer_A : NPCState.Believer_B;
                   
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
             const distToTarget = distance(npc.position, npc.wanderTarget);
             if (distToTarget < 10) {
                  const angle = Math.random() * Math.PI * 2;
                  const r = Math.sqrt(Math.random()) * npc.homeRadius;
                  npc.wanderTarget = {
                      x: npc.homeCenter.x + Math.cos(angle) * r,
                      y: npc.homeCenter.y + Math.sin(angle) * r
                  };
                  npc.wanderTarget.x = Math.max(SAFE_MARGIN, Math.min(WORLD_WIDTH - SAFE_MARGIN, npc.wanderTarget.x));
                  npc.wanderTarget.y = Math.max(SAFE_MARGIN, Math.min(WORLD_HEIGHT - SAFE_MARGIN, npc.wanderTarget.y));
             }
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

  // Collision Resolution
  const playerHitRadius = player.radius * CONFIG.PLAYER_HITBOX_RATIO;
  const minSeparation = npc.radius + playerHitRadius;
  const dToPlayer = distance(npc.position, player.position);

  if (dToPlayer < minSeparation && dToPlayer > 0) {
      const pushDir = normalize({ x: npc.position.x - player.position.x, y: npc.position.y - player.position.y });
      const overlapAmount = minSeparation - dToPlayer;
      npc.position.x += pushDir.x * overlapAmount;
      npc.position.y += pushDir.y * overlapAmount;
  }

  npc.position.x = Math.max(10, Math.min(WORLD_WIDTH - 10, npc.position.x));
  npc.position.y = Math.max(10, Math.min(WORLD_HEIGHT - 10, npc.position.y));
};