

import { NPCState } from './types';

// Map Dimensions
export const VIEWPORT_WIDTH = 800;
export const VIEWPORT_HEIGHT = 480;
export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 480;

// Level 4 (Large Map)
export const LEVEL_4_WIDTH = 1200;
export const LEVEL_4_HEIGHT = 720;

// Level 5 (River Map)
export const LEVEL_5_WIDTH = 800;
export const LEVEL_5_HEIGHT = 960;

// Colors
export const COLORS = {
  [NPCState.Normal]: '#94a3b8', // Slate-400 (Grey)
  
  // Faction A (Player) - Blue/Gold Theme
  [NPCState.Aware_A]: '#38bdf8', // Sky-400
  [NPCState.Persuaded_A]: '#facc15', // Yellow-400
  [NPCState.Believer_A]: '#ffffff', // White (Purity/Order)
  
  // Faction B (Enemy) - Purple/Red Theme
  [NPCState.Aware_B]: '#f472b6', // Pink-400
  [NPCState.Persuaded_B]: '#c084fc', // Purple-400
  [NPCState.Believer_B]: '#ef4444', // Red-500

  Player: '#ffffff',
  Enemy: '#ef4444', // Red Leader
  Background: '#0f172a',
  Grid: '#1e293b',
  Wall: '#334155', // Slate-700
  River: '#0ea5e9', // Sky-500
};

// State Colors Mapping (For UI/Minimap)
export const STATE_COLORS: Record<NPCState, string> = {
  [NPCState.Normal]: '#64748b',
  [NPCState.Aware_A]: '#0ea5e9',
  [NPCState.Persuaded_A]: '#eab308',
  [NPCState.Believer_A]: '#ffffff',
  [NPCState.Aware_B]: '#a855f7',
  [NPCState.Persuaded_B]: '#ec4899',
  [NPCState.Believer_B]: '#dc2626',
};

// Configuration
export const CONFIG = {
  NPC_COUNT: 30, // Increased slightly for Level 2
  PLAYER_SPEED: 220,
  ENEMY_SPEED: 110, // Significantly slower
  NPC_BASE_SPEED: 80,
  
  // Physics / Collision
  NPC_MIN_SEPARATION: 25, // Minimum distance between NPC centers to prevent overlap

  PLAYER_AOE_RADIUS: 200, 
  PLAYER_AOE_CD: 3, 
  PLAYER_BEAM_RANGE: 200, // Reduced slightly to balance with Believer range
  PLAYER_HITBOX_RATIO: 0.5, // Physical body is 50% of visual radius
  
  // Enemy AI (Nerfed)
  ENEMY_AOE_RADIUS: 100, // Smaller than player
  ENEMY_AOE_CD: 8, // Less frequent
  ENEMY_BEAM_RANGE: 100, // Shorter range
  ENEMY_LEADER_HP: 2000, // Boss HP

  // Progress needed to advance state
  PROGRESS_TO_PERSUADED: 100,
  PROGRESS_TO_BELIEVER: 150,
  
  // Conversion rates (per second)
  RATE_PLAYER_AWARE: 60,
  RATE_PLAYER_PERSUADED: 50,
  
  RATE_ENEMY_AWARE: 35, // Weaker than player
  RATE_ENEMY_PERSUADED: 30,

  // Believer Logic
  // Believer range is 50% of Player Beam Range (200 * 0.5 = 100)
  BELIEVER_BEAM_RANGE: 100, 
  RATE_BELIEVER: 15,
  RATE_CHASE_CONVERT: 50, // Damage per "headbutt" (Instant damage)
  
  // Opinion Leader Stats
  OPINION_LEADER_RADIUS: 15,
  OPINION_LEADER_WAVE_RADIUS: 100, // 50% of Player's 200
  OPINION_LEADER_WAVE_CD: 12.0,
  OPINION_LEADER_POWER_MULT: 2.0, // 100% stronger

  // Attack Animation Timings (Seconds) - Made slower for visibility
  ATTACK_WINDUP: 0.4,
  ATTACK_STRIKE: 0.15,
  ATTACK_RECOVER: 0.3,
  
  // Aware Logic
  AWARE_STAY_DURATION: 4.0, 
  AWARE_STOP_RADIUS: 50,

  // --- ADVERSARIAL PARAMETERS ---
  // Leader vs Leader
  LEADER_VS_LEADER_RANGE: 160,

  R_DETECT_PERSUADED: 100, // Range to find a chase target
  R_HELP_SMALL: 70,       // Range to call friends for a chase
  
  R_DETECT_BELIEVER: 100,  // Range to spot enemy believer (Debate)
  R_HELP_BIG: 130,         // Range to call friends for a debate
  
  R_CONVERT_PERSUADED: 25, // Distance to initiate attack (Headbutt)
  
  DEBATE_DURABILITY_MAX: 100,
  DEBATE_DAMAGE_BASE: 10,
  DEBATE_SIGNAL_INTERVAL: 2.0, // Seconds between help calls
  DEBATE_SUPPORT_RADIUS: 40, // Distance supporters stand behind leader
  LEADER_DEBATE_WEIGHT: 3, // Leader counts as 3 supporters
  
  // Total War / Siege
  TOTAL_WAR_THRESHOLD: 0.8, // 80% Believers triggers total war
  SIEGE_DAMAGE_TICK: 20,
  
  // Debate UI
  DEBATE_BAR_WIDTH: 40,
  DEBATE_BAR_HEIGHT: 6,

  // Portal
  PORTAL_COOLDOWN: 2.0,
};