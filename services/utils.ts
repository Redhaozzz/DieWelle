
import { NPCState, Vector } from "../types";

export const distance = (v1: Vector, v2: Vector): number => {
  const dx = v1.x - v2.x;
  const dy = v1.y - v2.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const normalize = (v: Vector): Vector => {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
};

export const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * t;
};

export const randomRange = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

export const clamp = (val: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, val));
};

export const getFaction = (state: NPCState): 'A' | 'B' | null => {
    if (state.endsWith('_A')) return 'A';
    if (state.endsWith('_B')) return 'B';
    return null;
};
