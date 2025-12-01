

export enum NPCState {
  Normal = 'Normal',
  // Faction A (Player)
  Aware_A = 'Aware_A',
  Persuaded_A = 'Persuaded_A',
  Believer_A = 'Believer_A',
  // Faction B (Enemy)
  Aware_B = 'Aware_B',
  Persuaded_B = 'Persuaded_B',
  Believer_B = 'Believer_B',
}

export interface Vector {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  position: Vector;
  velocity: Vector;
  radius: number;
}

export interface ActiveWave {
  id: string;
  center: Vector;
  currentRadius: number;
  maxRadius: number;
  speed: number;
  color: string;
  sourceType: 'player' | 'enemy';
}

export interface NPC extends Entity {
  state: NPCState;
  homeCenter: Vector;
  homeRadius: number;
  wanderTarget: Vector;
  moveSpeed: number;
  
  // Aware Logic
  awareCenter: Vector | null;
  awareSeekTimer: number; 
  awareActionTimer: number; 
  awareIsMoving: boolean;
  awareLocalTarget: Vector; 

  // Conversion Logic
  conversionProgressA: number;
  conversionProgressB: number;
  
  // Believer Logic (General)
  believerBeamCooldown: number;
  beamTargetId: string | null;
  
  // --- ADVERSARIAL LOGIC ---
  
  // Debate Logic (Believer vs Believer)
  debateTargetId: string | null; // The Believer enemy we are arguing with
  debateRole: 'center' | 'supporter' | 'none';
  debateDurability: number; // HP for the debate
  debateSignalTimer: number; // Cooldown for calling for help
  
  // Visuals
  animOffset: number; 
  hitWaveIds: string[];
}

export interface Player extends Entity {
  moveSpeed: number;
  aoeCooldown: number;
  maxAoeCooldown: number;
  aoeRadius: number;
  beamRange: number;
  beamTargetId: string | null;
}

export interface Enemy extends Entity {
  moveSpeed: number;
  aoeCooldown: number;
  maxAoeCooldown: number;
  aoeRadius: number;
  beamRange: number;
  beamTargetId: string | null;
  // AI State
  decisionTimer: number;
  pathingTimer: number; // New: Controls reaction speed
  chaseTargetId: string | null; // New: Who are we focusing on?
  targetPos: Vector;
  state: 'wandering' | 'chasing_cluster' | 'converting';
}

export interface GameStats {
  normal: number;
  factionA: number; // Total A followers
  factionB: number; // Total B followers
  believerA: number;
  believerB: number;
  timeElapsed: number;
}

export enum TimeScale {
  x1 = 1,
  x2 = 2,
  x4 = 4,
  x8 = 8,
}

export interface Particle {
  id: string;
  position: Vector;
  life: number;
  maxLife: number;
  type: 'beam_spark' | 'convert_effect' | 'help_ring_small' | 'help_ring_big' | 'cleansing_shockwave' | 'hit_impact'; 
  size: number;
  color: string;
}