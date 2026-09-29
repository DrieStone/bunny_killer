// Fixed map layout: grid helpers, the grid of lots you can buy, and static scenery.
import { COLS, FARM_X0, FARM_Y0, LOT, LOTS_X, LOTS_Y, ROWS } from './config';
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

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/** The lot a tile belongs to, or -1 out in the wild country around the farm. */
export function lotOf(x: number, y: number): number {
  const lx = Math.floor((x - FARM_X0) / LOT);
  const ly = Math.floor((y - FARM_Y0) / LOT);
  return lx >= 0 && ly >= 0 && lx < LOTS_X && ly < LOTS_Y ? ly * LOTS_X + lx : -1;
}

export const lotOfTile = (i: number): number => lotOf(tileX(i), tileY(i));

export function lotRect(n: number): Rect {
  const x0 = FARM_X0 + (n % LOTS_X) * LOT;
  const y0 = FARM_Y0 + Math.floor(n / LOTS_X) * LOT;
  return { x0, y0, x1: x0 + LOT - 1, y1: y0 + LOT - 1 };
}

/** Every tile index in a lot. */
export function lotTiles(n: number): number[] {
  const r = lotRect(n);
  const out: number[] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push(idx(x, y));
  return out;
}

// ---------------------------------------------------------------- scenery

export type SceneryKind =
  | 'crater' | 'pond' | 'tree_oak' | 'tree_apple' | 'bush' | 'stump' | 'haybale' | 'rocks' | 'flowers';

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

// The wild country around the lots (columns 3-18, rows 2-13): nothing grows in the lots but what you plant,
// and row 1 / row 14 stay mostly open as lanes for bunnies coming in from the top and bottom edges.
export const SCENERY: Scenery[] = [
  s('crater', 19, 11, 2, 2),
  s('pond', 1, 11, 2, 2),
  s('tree_oak', 1, 2),
  s('tree_apple', 20, 2),
  s('tree_apple', 1, 7),
  s('tree_oak', 20, 7),
  s('tree_oak', 7, 14),
  s('tree_apple', 14, 1),
  s('haybale', 5, 1),
  s('haybale', 6, 1),
  s('bush', 2, 5),
  s('bush', 19, 5),
  s('bush', 4, 14),
  s('bush', 16, 14),
  s('stump', 11, 1),
  s('stump', 19, 9),
  s('rocks', 1, 4, 1, 1, false),
  s('rocks', 20, 14, 1, 1, false),
  s('rocks', 12, 14, 1, 1, false),
  s('flowers', 2, 9, 1, 1, false),
  s('flowers', 9, 1, 1, 1, false),
  s('flowers', 17, 1, 1, 1, false),
  s('flowers', 10, 14, 1, 1, false),
  s('flowers', 1, 14, 1, 1, false),
];

export const CRATER = SCENERY.find((o) => o.kind === 'crater')!;
export const CRATER_SPAWN = { x: 19, y: 13 };

/** On or right next to the crater: where a smoke bomb can land. */
export function inCrater(i: number): boolean {
  const x = tileX(i);
  const y = tileY(i);
  return x >= CRATER.x - 1 && x <= CRATER.x + CRATER.w && y >= CRATER.y - 1 && y <= CRATER.y + CRATER.h;
}

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
