import type { BunnyKind, CropKind, DefenseKind, EventKind, LandmarkKind, WeaponKind } from './config';

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

export type BunnyState = 'seek' | 'eat' | 'chew' | 'spooked' | 'flee' | 'exit' | 'wander' | 'dash';

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
  brood: number; // Bunny Queen: seconds toward her next Burrower
  broodCount: number;
  popped: number; // Burrower: seconds it's up out of the ground (peeking, or knocked out)
  peek: number; // Burrower: seconds until it next pokes its head up
  armor: number; // Pot-Head: pebbles its pot can still turn away
  carry: Loot | null; // Bandit: the crop it's running off with
  dead: boolean;
  gone: boolean;
}

/** A crop a Bandit grabbed, and where it came from, so a bonk can put it back. */
export interface Loot {
  crop: Crop;
  from: number;
}

/** Something lobbed from the porch (a potato, a firework) on its way down. */
export interface Shell {
  weapon: WeaponKind;
  level: number;
  x: number; // where it lands, tile units
  y: number;
  t: number; // seconds until it lands
  flight: number;
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

/** A deal on the travelling merchant's cart. `id` says what it is: rare:<unlock>, soil, lab:<crop>, weapon:<weapon>. */
export interface Offer {
  id: string;
  name: string;
  text: string;
  price: number;
}

/** Something different about today. */
export interface DayEvent {
  kind: EventKind;
  crop?: CropKind; // the County Fair's crop
  at?: number; // when the hail comes (seconds into the day)
  offers?: Offer[]; // the merchant's cart
}

/** An order from town: `want` of a crop by the evening of day `due`, for a bonus on top of the sale. */
export interface Order {
  who: string;
  kind: CropKind;
  want: number;
  got: number;
  due: number;
  bonus: number;
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

export type Phase = 'title' | 'planning' | 'round' | 'sundown' | 'harvest' | 'summary' | 'gameover' | 'victory';

export type ShopItem =
  | { type: 'crop'; kind: CropKind }
  | { type: 'defense'; kind: DefenseKind }
  | { type: 'remove' }
  | { type: 'upgrade' }
  | { type: 'till' } // the hoe: turn grass into a seedbed
  | { type: 'land' } // buy the lot you click
  | { type: 'smoke' }; // a smoke bomb: throw it into the crater and a Buck comes out today

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
  bucks: number; // Asteroid Bucks bonked today
  bucksEscaped: number;
  cropsStolen: number;
  market: Partial<Record<CropKind, number>>; // tonight's price, as a share of normal, for what sold
  prize: string; // what the golden bunny paid out today ('' if nobody caught it)
  prizeCash: number;
  orderPaid: number; // an order from town filled tonight
  orderNote: string; // how the order stands after tonight's harvest ('' if there isn't one)
  hailHit: number; // crops the hail knocked about
  fairSold: number; // crops the County Fair bought at its price
}

export interface LifetimeStats {
  kills: number;
  harvest: number; // lifetime credits from harvests == score
  cropsLost: number;
  bossesBeaten: number;
  sealedOn?: number; // the day the crater was sealed: the run is won
  golden?: number; // golden bunnies bonked
  orders?: number; // orders from town filled
  legacyOn?: number; // the day the fifth landmark went up: the Farm Legacy is complete
}

// x/y are tile units unless noted
export type GameEvent =
  | { t: 'poof'; x: number; y: number; kind: BunnyKind }
  | { t: 'hit'; x: number; y: number }
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
  | { t: 'buy' }
  | { t: 'dodge'; x: number; y: number }
  | { t: 'brood'; x: number; y: number }
  | { t: 'project'; stage: number }
  | { t: 'fire'; weapon: WeaponKind; x: number; y: number; hit: boolean }
  | { t: 'blast'; weapon: WeaponKind; x: number; y: number; r: number }
  | { t: 'clang'; x: number; y: number }
  | { t: 'potOff'; x: number; y: number }
  | { t: 'thunk'; x: number; y: number }
  | { t: 'thump'; x: number; y: number; r: number }
  | { t: 'sting'; x: number; y: number }
  | { t: 'steal'; x: number; y: number; kind: CropKind }
  | { t: 'drop'; x: number; y: number }
  | { t: 'zap'; x: number; y: number }
  | { t: 'weapon'; weapon: WeaponKind }
  | { t: 'till'; x: number; y: number }
  | { t: 'buyLand'; x: number; y: number }
  | { t: 'smoke'; x: number; y: number }
  | { t: 'golden'; x: number; y: number } // a golden bunny starts its dash
  | { t: 'prize'; x: number; y: number; text: string; short: string }
  | { t: 'order'; x: number; y: number; amount: number }
  | { t: 'hail' }
  | { t: 'combo'; x: number; y: number } // two defenses just worked together
  | { t: 'landmark'; x: number; y: number; kind: LandmarkKind } // one of the Farm Legacy, just built
  | { t: 'bell'; x: number; y: number }; // the bell tower rings at noon
