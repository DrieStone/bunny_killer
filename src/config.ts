// All the balance numbers live here so tuning never means hunting through logic.

export const TILE = 32; // art pixels per tile
export const COLS = 28;
export const ROWS = 18;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export const ROUND_SECONDS = 60;
export const SPAWN_WINDOW = 0.72; // bunnies arrive during the first 72% of the day
export const SUNDOWN_MAX_SECONDS = 5;
export const START_CREDITS = 80;
export const SELL_BACK = 0.5; // share of cost refunded when selling a used defense
export const REPAIR_RATE = 0.5; // share of cost to repair a fully broken defense

// ---------------------------------------------------------------- crops

export type CropKind = 'radish' | 'lettuce' | 'carrot' | 'corn' | 'strawberry' | 'pumpkin';

export interface CropDef {
  kind: CropKind;
  name: string;
  seedCost: number;
  growTime: number; // seconds of daylight to mature
  sellValue: number;
  hp: number; // "bites" a crop can take
  attract: number; // how much bunnies want it
  regrow?: number; // perennials: seconds to fruit again after a harvest
  harvests?: number; // perennials: harvests before the plant is spent
  blurb: string;
}

export const CROPS: Record<CropKind, CropDef> = {
  radish: {
    kind: 'radish', name: 'Radish', seedCost: 4, growTime: 30, sellValue: 9, hp: 3, attract: 0.45,
    blurb: 'Cheap and quick. Bunnies turn their noses up at it.',
  },
  lettuce: {
    kind: 'lettuce', name: 'Lettuce', seedCost: 6, growTime: 40, sellValue: 15, hp: 4, attract: 2.2,
    blurb: 'Bunnies go crazy for it. Great bait next to a trap.',
  },
  carrot: {
    kind: 'carrot', name: 'Carrot', seedCost: 10, growTime: 50, sellValue: 25, hp: 5, attract: 1.5,
    blurb: 'The classic. Solid money, and every bunny knows it.',
  },
  corn: {
    kind: 'corn', name: 'Corn', seedCost: 16, growTime: 75, sellValue: 48, hp: 7, attract: 0.9,
    blurb: 'Takes two days, or one day next to a sprinkler.',
  },
  strawberry: {
    kind: 'strawberry', name: 'Strawberry', seedCost: 24, growTime: 45, sellValue: 19, hp: 5, attract: 1.7,
    regrow: 40, harvests: 5,
    blurb: 'Plant once, pick every evening, five times over. Bunnies adore it.',
  },
  pumpkin: {
    kind: 'pumpkin', name: 'Pumpkin', seedCost: 28, growTime: 110, sellValue: 90, hp: 12, attract: 1.0,
    blurb: 'Two days in the ground. Tough skin, big payday.',
  },
};

export const CROP_ORDER: CropKind[] = ['radish', 'lettuce', 'carrot', 'corn', 'strawberry', 'pumpkin'];

// ---------------------------------------------------------------- defenses

export type DefenseKind = 'fence' | 'trap' | 'scarecrow' | 'sprinkler' | 'turret' | 'doghouse';

export interface DefenseDef {
  kind: DefenseKind;
  name: string;
  cost: number;
  hp: number;
  blocks: boolean; // occupies the tile as a wall bunnies must chew through
  radius: number; // tiles
  period: number; // seconds between actions
  damage: number;
  duration: number; // spook / soak seconds
  blurb: string;
}

export const DEFENSES: Record<DefenseKind, DefenseDef> = {
  fence: {
    kind: 'fence', name: 'Fence', cost: 6, hp: 12, blocks: true, radius: 0, period: 0, damage: 0, duration: 0,
    blurb: 'Bunnies hop around it, or chew right through.',
  },
  trap: {
    kind: 'trap', name: 'Snap Trap', cost: 15, hp: 1, blocks: false, radius: 0.5, period: 5, damage: 3, duration: 0,
    blurb: 'Hidden from bunnies. SNAP! Re-arms after 5 seconds.',
  },
  scarecrow: {
    kind: 'scarecrow', name: 'Scarecrow', cost: 25, hp: 10, blocks: true, radius: 2.5, period: 2.5, damage: 0, duration: 1.5,
    blurb: 'Scares nearby bunnies off their dinner.',
  },
  sprinkler: {
    kind: 'sprinkler', name: 'Sprinkler', cost: 30, hp: 8, blocks: true, radius: 2, period: 3, damage: 0, duration: 3,
    blurb: 'Blasts bunnies back and soaks them slow. Nearby crops grow 40% faster.',
  },
  turret: {
    kind: 'turret', name: 'Sling Turret', cost: 45, hp: 10, blocks: true, radius: 3.5, period: 1.2, damage: 1, duration: 0,
    blurb: 'Plinks pebbles at any bunny in range.',
  },
  doghouse: {
    kind: 'doghouse', name: 'Dog', cost: 60, hp: 16, blocks: true, radius: 3.5, period: 0.8, damage: 2, duration: 0,
    blurb: 'A good boy on a long leash. Chases and bites.',
  },
};

export const DEFENSE_ORDER: DefenseKind[] = ['fence', 'trap', 'scarecrow', 'sprinkler', 'turret', 'doghouse'];

// ---------------------------------------------------------------- defense upgrades

export const MAX_LEVEL = 3;

/** Price to take a defense from `level` to `level + 1` (0 when maxed). */
export function upgradeCost(kind: DefenseKind, level: number): number {
  const base = DEFENSES[kind].cost;
  if (level === 1) return base;
  if (level === 2) return Math.round(base * 1.6);
  return 0;
}

/** Everything a defense has invested in it: purchase plus upgrades. */
export function investedIn(kind: DefenseKind, level: number): number {
  let total = DEFENSES[kind].cost;
  for (let l = 1; l < level; l++) total += upgradeCost(kind, l);
  return total;
}

export interface DefenseStats {
  radius: number;
  period: number;
  damage: number;
  duration: number;
  hp: number;
}

/** A defense's working numbers at a level: wider, faster, harder-hitting, sturdier. */
export function defenseStats(kind: DefenseKind, level = 1): DefenseStats {
  const d = DEFENSES[kind];
  const up = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  const hits = kind === 'turret' || kind === 'trap' || kind === 'doghouse';
  return {
    radius: d.radius * (1 + 0.18 * up),
    period: d.period * (1 - 0.15 * up),
    damage: d.damage + (hits ? up : 0),
    duration: d.duration * (1 + 0.25 * up),
    hp: Math.round(d.hp * (1 + 0.6 * up)),
  };
}

// ---------------------------------------------------------------- seasons & weather

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export const SEASON_ORDER: Season[] = ['spring', 'summer', 'fall', 'winter'];
export const SEASON_DAYS = 7;

export interface SeasonDef {
  name: string;
  growth: number; // crop growth multiplier
  sell: number; // harvest price multiplier
  bunnies: number; // wave size multiplier
  blurb: string;
}

export const SEASONS: Record<Season, SeasonDef> = {
  spring: { name: 'Spring', growth: 1, sell: 1, bunnies: 1, blurb: 'Mild days. The bunnies are waking up hungry.' },
  summer: { name: 'Summer', growth: 1.15, sell: 1, bunnies: 1.1, blurb: 'Crops grow 15% faster. So do the litters.' },
  fall: { name: 'Fall', growth: 0.95, sell: 1.25, bunnies: 1, blurb: 'Harvest festival: everything sells for 25% more.' },
  winter: { name: 'Winter', growth: 0.8, sell: 1.2, bunnies: 0.8, blurb: 'Crops crawl, prices climb, fewer bunnies brave the snow.' },
};

export function seasonOf(round: number): Season {
  return SEASON_ORDER[Math.floor((round - 1) / SEASON_DAYS) % 4];
}

export function yearOf(round: number): number {
  return Math.floor((round - 1) / (SEASON_DAYS * 4)) + 1;
}

export type Weather = 'sunny' | 'rain' | 'fog' | 'snow';

export interface WeatherDef {
  name: string;
  growth: number;
  bunnySpeed: number;
  bunnies: number;
  blurb: string;
}

export const WEATHER: Record<Weather, WeatherDef> = {
  sunny: { name: 'Sunny', growth: 1, bunnySpeed: 1, bunnies: 1, blurb: 'Clear skies.' },
  rain: { name: 'Rain', growth: 1.3, bunnySpeed: 0.85, bunnies: 1, blurb: 'Crops drink it up (+30% growth). Bunnies slog through the mud.' },
  fog: { name: 'Fog', growth: 1, bunnySpeed: 1, bunnies: 1.2, blurb: 'Bunnies sneak in under cover: 20% more of them.' },
  snow: { name: 'Snow', growth: 0.85, bunnySpeed: 0.9, bunnies: 1, blurb: 'Slow going for crops and bunnies alike.' },
};

/** Odds of each weather by season, out of 100. */
export const WEATHER_ODDS: Record<Season, [Weather, number][]> = {
  spring: [['sunny', 60], ['rain', 30], ['fog', 10]],
  summer: [['sunny', 78], ['rain', 14], ['fog', 8]],
  fall: [['sunny', 55], ['rain', 25], ['fog', 20]],
  winter: [['sunny', 45], ['snow', 40], ['fog', 15]],
};

export const SPRINKLER_GROWTH = 1.4;
export const SPRINKLER_PUSH = 5; // knockback speed, tiles/s
export const DOG_SPEED = 4.5;
export const PEBBLE_SPEED = 12;

// ---------------------------------------------------------------- bunnies

export type BunnyKind = 'common' | 'speedy' | 'digger' | 'fat' | 'mutant';

export interface BunnyDef {
  kind: BunnyKind;
  name: string;
  hp: number;
  speed: number; // tiles/s
  appetite: number; // crop hp eaten before heading home
  biteRate: number; // crop hp per second
  chewRate: number; // defense hp per second
  digger: boolean;
  boss: boolean;
  size: number; // hit radius in art pixels
  firstRound: number;
  blurb: string;
}

export const BUNNIES: Record<BunnyKind, BunnyDef> = {
  common: {
    kind: 'common', name: 'Bunny', hp: 1, speed: 2.0, appetite: 3, biteRate: 1.0, chewRate: 1.0,
    digger: false, boss: false, size: 7, firstRound: 1, blurb: 'Brown. Hungry.',
  },
  speedy: {
    kind: 'speedy', name: 'Jackrabbit', hp: 1, speed: 3.4, appetite: 2, biteRate: 1.2, chewRate: 0.7,
    digger: false, boss: false, size: 7, firstRound: 2, blurb: 'Fast. Grabs a bite and bolts.',
  },
  digger: {
    kind: 'digger', name: 'Burrower', hp: 2, speed: 1.5, appetite: 4, biteRate: 0.8, chewRate: 0,
    digger: true, boss: false, size: 7, firstRound: 3, blurb: 'Tunnels under everything. Hit it when it surfaces.',
  },
  fat: {
    kind: 'fat', name: 'Chonk', hp: 5, speed: 1.15, appetite: 8, biteRate: 1.6, chewRate: 2.0,
    digger: false, boss: false, size: 9, firstRound: 4, blurb: 'Slow, tough, and bottomless.',
  },
  mutant: {
    kind: 'mutant', name: 'Asteroid Buck', hp: 30, speed: 1.0, appetite: 30, biteRate: 3.0, chewRate: 6.0,
    digger: false, boss: true, size: 13, firstRound: 5, blurb: 'Something came out of that crater.',
  },
};

export const BUNNY_ORDER: BunnyKind[] = ['common', 'speedy', 'digger', 'fat', 'mutant'];

export const BOSS_EVERY = 5;
export const BOSS_HP_PER_APPEARANCE = 10; // each later boss is tougher
export const BOSS_BOUNTY = 40;
export const BREED_CAP = 25;

export function waveSize(round: number): number {
  const r = round - 1;
  return Math.round(5 + 2.3 * r + 0.06 * r * r);
}

/** Relative odds of each regular bunny kind showing up on a given round. */
export function waveWeights(round: number): [BunnyKind, number][] {
  const w: [BunnyKind, number][] = [['common', 10]];
  if (round >= BUNNIES.speedy.firstRound) w.push(['speedy', Math.min(8, 2 + round * 0.5)]);
  if (round >= BUNNIES.digger.firstRound) w.push(['digger', Math.min(5, 1 + (round - 3) * 0.4)]);
  if (round >= BUNNIES.fat.firstRound) w.push(['fat', Math.min(5, 1 + (round - 4) * 0.4)]);
  return w;
}

/** Later days bring tougher, quicker bunnies so a finished fortress still gets tested. */
export function bunnyHpScale(round: number): number {
  return 1 + Math.max(0, round - 6) * 0.1;
}

export function bunnySpeedScale(round: number): number {
  return 1 + Math.min(0.3, (round - 1) * 0.015);
}

export function burrowCount(round: number): number {
  return Math.min(5, 2 + Math.floor((round - 1) / 2));
}

// ---------------------------------------------------------------- land & sling

export const PLOT_LEVELS = [
  { size: 6, cost: 0 },
  { size: 8, cost: 150 },
  { size: 10, cost: 350 },
  { size: 12, cost: 750 },
];

export const SLING_LEVELS = [
  { name: 'Old Sling', reload: 0.45, damage: 1, cost: 0 },
  { name: 'Oak Sling', reload: 0.3, damage: 1, cost: 60 },
  { name: 'Steel Shot', reload: 0.3, damage: 2, cost: 160 },
];
