// The map: grid helpers, the grid of lots you can buy, and the farms (scenery, the crater, rivers).
import { COLS, DAILY, FARM_X0, FARM_Y0, LOT, LOTS_X, LOTS_Y, type LandmarkKind, ROWS } from './config';
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

// ---------------------------------------------------------------- farms

export type MapKind = 'home' | 'river' | 'orchard';
export const MAP_ORDER: MapKind[] = ['home', 'river', 'orchard'];

/** A farm to play on. The lots are always columns 3-18, rows 2-13; the wild country around them is what changes. */
export interface FarmMap {
  kind: MapKind;
  name: string;
  blurb: string;
  scenery: Scenery[];
  spawn: { x: number; y: number }; // where the crater's own bunnies climb out
  water: [number, number][]; // river tiles: nothing crosses them...
  bridges: [number, number][]; // ...except here
  // where each landmark of the Farm Legacy goes up: on a tree or bush that makes way for it, so no path changes
  landmarks: Record<LandmarkKind, [number, number]>;
}

const run = (x0: number, y0: number, x1: number, y1: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
  return out;
};

export const FARMS: Record<MapKind, FarmMap> = {
  // Row 1 and row 14 stay mostly open as lanes for bunnies coming in from the top and bottom edges.
  home: {
    kind: 'home', name: 'Home Farm', blurb: 'The farm you know: open meadow on every side, a pond, and the crater to the east.',
    spawn: { x: 19, y: 13 }, water: [], bridges: [],
    landmarks: { stand: [11, 1], windmill: [1, 2], bell: [20, 7], fairground: [7, 14], statue: [1, 7] },
    scenery: [
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
    ],
  },
  // A river down the west side that bends along the south. Bunnies from across it have to find a bridge.
  river: {
    kind: 'river', name: 'River Bend',
    blurb: 'A river wraps the west and south sides. Bunnies from across the water have to come over the four bridges.',
    spawn: { x: 19, y: 4 },
    water: [...run(1, 0, 1, 14), ...run(2, 14, 21, 14)],
    bridges: [[1, 4], [1, 10], [7, 14], [14, 14]],
    landmarks: { stand: [13, 1], windmill: [5, 1], bell: [20, 7], fairground: [20, 11], statue: [2, 7] },
    scenery: [
      s('crater', 19, 2, 2, 2),
      s('tree_oak', 20, 7),
      s('tree_apple', 20, 11),
      s('tree_oak', 5, 1),
      s('tree_apple', 13, 1),
      s('haybale', 9, 0),
      s('haybale', 10, 0),
      s('bush', 2, 7),
      s('bush', 20, 5),
      s('stump', 17, 1),
      s('rocks', 0, 12, 1, 1, false),
      s('rocks', 11, 15, 1, 1, false),
      s('flowers', 0, 2, 1, 1, false),
      s('flowers', 4, 15, 1, 1, false),
      s('flowers', 18, 15, 1, 1, false),
      s('flowers', 11, 1, 1, 1, false),
    ],
  },
  // Rows of old fruit trees crowd the edges; the bunnies come down the lanes between them.
  orchard: {
    kind: 'orchard', name: 'Old Orchard',
    blurb: 'Rows of old fruit trees crowd every edge, so bunnies come down the lanes between them. The crater is in the southwest.',
    spawn: { x: 1, y: 14 }, water: [], bridges: [],
    landmarks: { stand: [9, 1], windmill: [1, 6], bell: [20, 9], fairground: [11, 14], statue: [14, 1] },
    scenery: [
      s('crater', 1, 12, 2, 2),
      s('pond', 19, 1, 2, 2),
      s('tree_apple', 1, 2),
      s('tree_oak', 1, 6),
      s('tree_apple', 1, 9),
      s('tree_apple', 20, 5),
      s('tree_oak', 20, 9),
      s('tree_apple', 20, 13),
      s('tree_apple', 4, 1),
      s('tree_oak', 9, 1),
      s('tree_apple', 14, 1),
      s('tree_oak', 6, 14),
      s('tree_apple', 11, 14),
      s('tree_oak', 16, 14),
      s('haybale', 18, 14),
      s('stump', 13, 14),
      s('bush', 2, 4),
      s('bush', 19, 11),
      s('rocks', 0, 8, 1, 1, false),
      s('rocks', 21, 3, 1, 1, false),
      s('flowers', 7, 1, 1, 1, false),
      s('flowers', 12, 1, 1, 1, false),
      s('flowers', 9, 14, 1, 1, false),
      s('flowers', 2, 10, 1, 1, false),
    ],
  },
};

// The farm in play. These are filled in by setMap(), in place, so everything that imported them sees the change.
export const SCENERY: Scenery[] = [];
export const CRATER: Scenery = { kind: 'crater', x: 0, y: 0, w: 2, h: 2, block: true };
export const CRATER_SPAWN = { x: 0, y: 0 };
/** 1 where scenery or water blocks movement entirely. */
export const OBSTACLE = new Uint8Array(N);
/** 1 on river tiles, 2 on bridges. */
export const WATER = new Uint8Array(N);
let current: MapKind | null = null;

/** Lay out a farm. Cheap to call again with the same farm; returns true if the farm changed. */
export function setMap(kind: MapKind): boolean {
  if (current === kind) return false;
  current = kind;
  const m = FARMS[kind];
  SCENERY.length = 0;
  SCENERY.push(...m.scenery);
  Object.assign(CRATER, m.scenery.find((o) => o.kind === 'crater')!);
  Object.assign(CRATER_SPAWN, m.spawn);
  WATER.fill(0);
  for (const [x, y] of m.water) WATER[idx(x, y)] = 1;
  for (const [x, y] of m.bridges) WATER[idx(x, y)] = 2;
  OBSTACLE.fill(0);
  for (const sc of SCENERY) {
    if (!sc.block) continue;
    for (let yy = sc.y; yy < sc.y + sc.h; yy++) for (let xx = sc.x; xx < sc.x + sc.w; xx++) OBSTACLE[idx(xx, yy)] = 1;
  }
  for (let i = 0; i < N; i++) if (WATER[i] === 1) OBSTACLE[i] = 1;
  return true;
}

export const currentMap = (): MapKind => current ?? 'home';

/** The tile a landmark of the Farm Legacy stands on, on the farm in play. */
export const landmarkSpot = (kind: LandmarkKind): [number, number] => FARMS[currentMap()].landmarks[kind];

/** Today's Daily Farm: a number (Daily #1 was New Year's Day 2026), a seed, and a farm, all from the date. */
export function dailyFor(date = new Date()): { key: string; number: number; seed: number; map: MapKind } {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const number = Math.floor((Date.UTC(y, m, d) - DAILY.epoch) / 86_400_000) + 1;
  let h = (number * 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return { key, number, seed: (h ^ (h >>> 16)) >>> 1, map: MAP_ORDER[((number % 3) + 3) % 3] };
}

setMap('home');

/** On or right next to the crater: where a smoke bomb can land. */
export function inCrater(i: number): boolean {
  const x = tileX(i);
  const y = tileY(i);
  return x >= CRATER.x - 1 && x <= CRATER.x + CRATER.w && y >= CRATER.y - 1 && y <= CRATER.y + CRATER.h;
}

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
          if (inMap(nx, ny) && OBSTACLE[idx(nx, ny)] && !WATER[idx(nx, ny)]) { near = true; break; }
        }
      }
      const corner = (x < 2 || x > COLS - 3) && (y < 2 || y > ROWS - 3);
      if (!near && !corner && !OBSTACLE[idx(x, y)]) candidates.push({ x, y });
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
