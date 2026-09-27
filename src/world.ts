// Fixed map layout: grid helpers, the plot rectangle, and static scenery.
import { COLS, PLOT_LEVELS, ROWS } from './config';
import type { Burrow } from './types';
import { type Rng, shuffle } from './rng';

export const N = COLS * ROWS;

export const idx = (x: number, y: number): number => y * COLS + x;
export const tileX = (i: number): number => i % COLS;
export const tileY = (i: number): number => (i / COLS) | 0;
export const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < COLS && y < ROWS;

/** Tile index under a point in tile units, clamped onto the map. */
export function tileAt(x: number, y: number): number {
  const cx = Math.min(COLS - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(ROWS - 1, Math.max(0, Math.floor(y)));
  return idx(cx, cy);
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number; // inclusive
  y1: number; // inclusive
}

export function plotRect(level: number): Rect {
  const size = PLOT_LEVELS[Math.min(level, PLOT_LEVELS.length - 1)].size;
  const x0 = (COLS - size) / 2;
  const y0 = (ROWS - size) / 2;
  return { x0, y0, x1: x0 + size - 1, y1: y0 + size - 1 };
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

// ---------------------------------------------------------------- scenery

export type SceneryKind =
  | 'farmhouse' | 'crater' | 'pond' | 'tree_oak' | 'tree_apple' | 'bush' | 'stump' | 'haybale' | 'rocks' | 'flowers';

/** A piece of scenery: footprint (x, y, w, h) in tiles, and whether bunnies must go around it. */
export interface Scenery {
  kind: SceneryKind;
  x: number;
  y: number;
  w: number;
  h: number;
  block: boolean;
}

const s = (kind: SceneryKind, x: number, y: number, w = 1, h = 1, block = true): Scenery => ({ kind, x, y, w, h, block });

// The farm around the plot. The plot grows to cover columns 8-19, rows 3-14, so nothing goes there.
export const SCENERY: Scenery[] = [
  s('farmhouse', 1, 1, 3, 2),
  s('crater', 24, 14, 2, 2),
  s('pond', 2, 12, 2, 2),
  s('tree_oak', 6, 1),
  s('tree_apple', 22, 1),
  s('tree_oak', 26, 5),
  s('tree_apple', 1, 8),
  s('tree_oak', 5, 15),
  s('tree_oak', 17, 16),
  s('tree_apple', 26, 10),
  s('haybale', 5, 2),
  s('haybale', 4, 3),
  s('bush', 10, 1),
  s('bush', 19, 1),
  s('bush', 22, 16),
  s('bush', 8, 16),
  s('stump', 24, 7),
  s('stump', 3, 6),
  s('rocks', 21, 12, 1, 1, false),
  s('rocks', 6, 10, 1, 1, false),
  s('rocks', 13, 16, 1, 1, false),
  s('flowers', 4, 9, 1, 1, false),
  s('flowers', 22, 5, 1, 1, false),
  s('flowers', 15, 1, 1, 1, false),
  s('flowers', 20, 14, 1, 1, false),
  s('flowers', 1, 4, 1, 1, false),
  s('flowers', 25, 2, 1, 1, false),
];

export const CRATER = SCENERY.find((o) => o.kind === 'crater')!;
export const HOUSE = SCENERY.find((o) => o.kind === 'farmhouse')!;
export const CRATER_SPAWN = { x: 23, y: 14 };

/** 1 where scenery blocks movement entirely. */
export const OBSTACLE: Uint8Array = (() => {
  const o = new Uint8Array(N);
  for (const sc of SCENERY) {
    if (!sc.block) continue;
    for (let yy = sc.y; yy < sc.y + sc.h; yy++) for (let xx = sc.x; xx < sc.x + sc.w; xx++) o[idx(xx, yy)] = 1;
  }
  return o;
})();

export function isBorder(x: number, y: number): boolean {
  return x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
}

/** Pick spread-out burrow holes along the map edge for a round. */
export function pickBurrows(rng: Rng, count: number): Burrow[] {
  const candidates: Burrow[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!isBorder(x, y)) continue;
      // keep clear of scenery and corners
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (inMap(nx, ny) && OBSTACLE[idx(nx, ny)]) { near = true; break; }
        }
      }
      const corner = (x < 2 || x > COLS - 3) && (y < 2 || y > ROWS - 3);
      if (!near && !corner) candidates.push({ x, y });
    }
  }
  shuffle(rng, candidates);
  const picked: Burrow[] = [];
  for (let minGap = 8; picked.length < count && minGap >= 2; minGap -= 2) {
    for (const c of candidates) {
      if (picked.length >= count) break;
      if (picked.some((p) => p.x === c.x && p.y === c.y)) continue;
      if (picked.every((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) >= minGap)) picked.push(c);
    }
  }
  return picked;
}

/** Unit vector pointing off the map from a border tile. */
export function exitDir(x: number, y: number): [number, number] {
  if (x <= 0) return [-1, 0];
  if (x >= COLS - 1) return [1, 0];
  if (y <= 0) return [0, -1];
  return [0, 1];
}
