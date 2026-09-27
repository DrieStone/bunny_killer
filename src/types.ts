import type { BunnyKind, CropKind, DefenseKind } from './config';

export interface Crop {
  kind: CropKind;
  growth: number; // seconds of growing done
  hp: number;
  harvests: number; // times picked (perennials keep growing back)
  fresh: boolean; // planted this planning phase (full refund if dug up)
  shake: number;
}

export interface Structure {
  kind: DefenseKind;
  level: number; // 1..MAX_LEVEL
  hp: number;
  fresh: boolean; // bought this planning phase (full refund if sold)
  cd: number; // cooldown until next action
  anim: number; // seconds since last action, for animation
  shake: number;
}

export interface Tile {
  crop: Crop | null;
  structure: Structure | null;
}

export type BunnyState = 'seek' | 'eat' | 'chew' | 'spooked' | 'flee' | 'exit' | 'wander';

export interface Bunny {
  id: number;
  kind: BunnyKind;
  x: number; // tile units; the point under its feet
  y: number;
  hp: number;
  maxHp: number;
  state: BunnyState;
  resume: BunnyState; // state to go back to after chewing
  path: number[];
  pathIdx: number;
  epoch: number; // path generation this path was planned against
  target: number; // tile index of the crop it wants
  chewTile: number;
  eaten: number;
  fed: boolean;
  repath: number;
  timer: number;
  sx: number; // spook source
  sy: number;
  ex: number; // exit direction
  ey: number;
  kx: number; // knockback velocity
  ky: number;
  wet: number;
  flash: number;
  facing: 1 | -1;
  moving: boolean;
  hop: number;
  tick: number;
  ox: number; // cosmetic offset while eating so crowds don't stack perfectly
  oy: number;
  dead: boolean;
  gone: boolean;
}

export interface Dog {
  home: number; // doghouse tile
  x: number;
  y: number;
  target: number; // bunny id or -1
  cd: number;
  facing: 1 | -1;
  moving: boolean;
  run: number;
}

export interface Projectile {
  x: number;
  y: number;
  tx: number;
  ty: number;
  target: number; // bunny id
  damage: number;
  done: boolean;
}

export interface Burrow {
  x: number;
  y: number;
}

export interface SpawnEntry {
  at: number; // seconds into the day
  kind: BunnyKind;
  burrow: number; // index into burrows, or -1 for the crater
}

export type Phase = 'title' | 'planning' | 'round' | 'sundown' | 'harvest' | 'summary' | 'gameover';

export type ShopItem =
  | { type: 'crop'; kind: CropKind }
  | { type: 'defense'; kind: DefenseKind }
  | { type: 'remove' }
  | { type: 'upgrade' };

export interface RoundStats {
  harvested: Partial<Record<CropKind, { count: number; value: number }>>;
  harvestTotal: number;
  spent: number;
  kills: number;
  bounty: number;
  escapedFed: number;
  escapedHungry: number;
  cropsLost: number;
  structuresBroken: number;
}

export interface LifetimeStats {
  kills: number;
  harvest: number; // lifetime credits from harvests == score
  cropsLost: number;
  bossesBeaten: number;
}

// x/y are tile units unless noted
export type GameEvent =
  | { t: 'poof'; x: number; y: number; kind: BunnyKind }
  | { t: 'hit'; x: number; y: number }
  | { t: 'sling'; x: number; y: number; hit: boolean }
  | { t: 'snap'; x: number; y: number }
  | { t: 'scare'; x: number; y: number; r: number }
  | { t: 'spray'; x: number; y: number; r: number }
  | { t: 'shoot'; x: number; y: number }
  | { t: 'bite'; x: number; y: number }
  | { t: 'chomp'; x: number; y: number }
  | { t: 'chew'; x: number; y: number }
  | { t: 'cropLost'; x: number; y: number; kind: CropKind }
  | { t: 'broken'; x: number; y: number; kind: DefenseKind }
  | { t: 'coin'; x: number; y: number; amount: number }
  | { t: 'place'; x: number; y: number }
  | { t: 'upgrade'; x: number; y: number; level: number }
  | { t: 'remove'; x: number; y: number }
  | { t: 'error'; msg: string }
  | { t: 'spawn'; x: number; y: number; kind: BunnyKind }
  | { t: 'dig'; x: number; y: number }
  | { t: 'escape'; x: number; y: number; fed: boolean }
  | { t: 'roundStart' }
  | { t: 'sundown' }
  | { t: 'buy' };
