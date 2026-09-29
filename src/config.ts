// All the balance numbers live here so tuning never means hunting through logic.

export const TILE = 32; // art pixels per tile
export const COLS = 22;
export const ROWS = 16;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export const ROUND_SECONDS = 60;
export const SPAWN_WINDOW = 0.72; // bunnies arrive during the first 72% of the day
export const SUNDOWN_MAX_SECONDS = 5;
export const HARVEST_SECONDS = 2.4; // however big the farm, the coins count up in about this long
export const START_CREDITS = 80;
export const SELL_BACK = 0.5; // share of cost refunded when selling a used defense
export const REPAIR_RATE = 0.5; // share of cost to repair a fully broken defense

// ---------------------------------------------------------------- crops

export type CropKind =
  | 'radish' | 'lettuce' | 'carrot' | 'sunflower' | 'corn' | 'tomato' | 'strawberry' | 'pumpkin' | 'watermelon' | 'golden';

export interface CropDef {
  kind: CropKind;
  name: string;
  seedCost: number;
  growTime: number; // seconds of daylight to mature
  sellValue: number;
  hp: number; // "bites" a crop can take
  attract: number; // how much bunnies want it
  regrow?: number; // perennials: seconds of growth for each fruit after the first (as many a day as there's time for)
  harvests?: number; // perennials: fruits before the plant is spent
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
    kind: 'corn', name: 'Corn', seedCost: 16, growTime: 68, sellValue: 48, hp: 7, attract: 0.9,
    blurb: 'Two days, or one with a little help: a sprinkler, Rich Soil, or summer sun.',
  },
  strawberry: {
    kind: 'strawberry', name: 'Strawberry', seedCost: 24, growTime: 45, sellValue: 19, hp: 5, attract: 1.7,
    regrow: 38, harvests: 5,
    blurb: 'Five pickings from one plant, and two a day if it grows fast. Bunnies adore it.',
  },
  pumpkin: {
    kind: 'pumpkin', name: 'Pumpkin', seedCost: 28, growTime: 100, sellValue: 90, hp: 12, attract: 1.0,
    blurb: 'Two days in the ground, or one by a sprinkler in rich soil. Tough skin, big payday.',
  },
  sunflower: {
    kind: 'sunflower', name: 'Sunflower', seedCost: 12, growTime: 55, sellValue: 24, hp: 6, attract: 0.08,
    blurb: "Bunnies won't touch it unless there's nothing else left. Safe, steady money.",
  },
  tomato: {
    kind: 'tomato', name: 'Tomato', seedCost: 20, growTime: 50, sellValue: 17, hp: 5, attract: 1.2,
    regrow: 36, harvests: 6,
    blurb: 'A vine that fruits six times over, and two a day if it grows fast.',
  },
  watermelon: {
    kind: 'watermelon', name: 'Watermelon', seedCost: 40, growTime: 135, sellValue: 140, hp: 18, attract: 1.4,
    blurb: "Three days to swell up, two with some help. Worth a fortune, if the bunnies don't find it first.",
  },
  golden: {
    kind: 'golden', name: 'Golden Carrot', seedCost: 60, growTime: 60, sellValue: 150, hp: 5, attract: 3.2,
    blurb: 'Grown from a crater seed. Sells like gold, and every bunny can smell it.',
  },
};

/**
 * Days from seed to harvest at a growth speed (1 = spring sun, no upgrades). Everything sells at sundown, so
 * growing faster only pays when it crosses a line: a day sooner, or another fruit a day.
 */
export function ripenDays(kind: CropKind, speed = 1): number {
  return Math.max(1, Math.ceil(CROPS[kind].growTime / (ROUND_SECONDS * speed) - 1e-9));
}

/** Fruit a bearing strawberry or tomato gives each evening at a growth speed (1 for everything else). */
export function fruitsPerDay(kind: CropKind, speed = 1): number {
  const regrow = CROPS[kind].regrow;
  return regrow ? Math.max(1, Math.floor((ROUND_SECONDS * speed) / regrow + 1e-9)) : 1;
}

// ---------------------------------------------------------------- the Daily Farm

/** Everyone gets the same farm on the same date: ten days, and the score is the harvest. */
export const DAILY = { days: 10, epoch: Date.UTC(2026, 0, 1) };

// ---------------------------------------------------------------- combos: defenses that work better together

/**
 * - Soggy scare: a scarecrow scares a bunny soaked by a sprinkler `soggy` times as long.
 * - Pollination: a beehive with a sunflower in range stings `pollen` times as often.
 * - Dazed: a Burrower knocked loose (a thumper does it) takes `dazed` times the damage from turret pebbles.
 * - Watchdog: a dog goes for a bunny chewing a defense first, and bites it `watchdog` harder.
 * - Bait: a snap trap within `baitRange` tiles of a Carrot Decoy re-arms `bait` times as fast.
 */
export const COMBOS = { soggy: 2, pollen: 2, dazed: 2, watchdog: 1, bait: 2, baitRange: 2 };

/** What each defense's combo is, for the Almanac. */
export const COMBO_TEXT: Partial<Record<DefenseKind, string>> = {
  scarecrow: 'Combo: a bunny soaked by a sprinkler runs from it twice as long.',
  sprinkler: 'Combo: a bunny it soaks runs from a scarecrow twice as long.',
  beehive: 'Combo: with a sunflower growing in range, the bees sting twice as often.',
  turret: 'Combo: its pebbles hit a dazed Burrower twice as hard. Thumpers daze them.',
  thumper: 'Combo: a Burrower it knocks loose takes double from turrets while dazed.',
  doghouse: 'Combo: the dog goes for bunnies chewing your defenses first, and bites them harder.',
  fence: 'Combo: a dog in reach goes for bunnies chewing it first, and bites them harder.',
  trap: 'Combo: within 2 tiles of a Carrot Decoy, it re-arms twice as fast.',
  decoy: 'Combo: snap traps within 2 tiles of it re-arm twice as fast.',
};

// ---------------------------------------------------------------- events: some days are different

export type EventKind = 'fair' | 'hail' | 'drought' | 'merchant';

/**
 * From Day 4, about a quarter of mornings bring an event (never a Buck day or the Last Night).
 * - County Fair: one crop that can ripen today sells for `fairMult` times the price, the first `fairCap` of it.
 * - Hail: partway through the day it knocks `hailDamage` of every crop's toughness off (nothing under a
 *   greenhouse), and for `hailSeconds` the bunnies cower where they are.
 * - Drought: crops grow at `drought` speed unless a sprinkler reaches them.
 * - Merchant: a cart by the farm for the morning, with a few deals (see MERCHANT).
 */
export const EVENTS = {
  from: 4, chance: 0.27,
  weights: [['fair', 3], ['hail', 2.5], ['drought', 2], ['merchant', 2.5]] as [EventKind, number][],
  fairMult: 3, fairCap: 20, hailSeconds: 6, hailDamage: 0.3, drought: 0.65,
};

/** The travelling merchant: something the store hasn't opened yet, and cut prices on a few upgrades. */
export const MERCHANT = { rare: { crop: 150, defense: 220, weapon: 300 }, soilOff: 0.5, labOff: 0.5, weaponOff: 0.4 };

/** "carrots", "radishes", "strawberries", "tomatoes"; lettuce and corn stay as they are. Lowercase. */
export function cropPlural(kind: CropKind, n = 2): string {
  const name = CROPS[kind].name.toLowerCase();
  if (n === 1 || kind === 'corn' || kind === 'lettuce') return name;
  if (name.endsWith('y')) return `${name.slice(0, -1)}ies`;
  if (name.endsWith('sh') || name.endsWith('o')) return `${name}es`;
  return `${name}s`;
}

/**
 * Orders from town: from Day 3, a customer may post one on a morning when none is open. Harvest that crop by the
 * due day and they pay a bonus on top of the market price: `bonus` of what the crops sell for normally. How many
 * they want grows with your farm (`share` of your tiles' worth, less for slow crops).
 */
export const ORDERS = { from: 3, chance: 0.55, minDays: 3, maxDays: 5, share: 0.3, bonus: 0.5, min: 4 };
export const CUSTOMERS: { who: string; wants: CropKind[] }[] = [
  { who: 'The diner', wants: ['lettuce', 'tomato', 'corn', 'radish'] },
  { who: 'The school', wants: ['carrot', 'strawberry', 'corn', 'radish'] },
  { who: 'The pie shop', wants: ['pumpkin', 'strawberry', 'watermelon', 'carrot'] },
  { who: 'The county fair', wants: ['watermelon', 'pumpkin', 'sunflower', 'corn'] },
  { who: 'Mrs. Pennywhistle', wants: ['sunflower', 'golden', 'lettuce', 'tomato'] },
  { who: 'The grocer', wants: ['radish', 'lettuce', 'carrot', 'sunflower'] },
];

/** Store order, which is also hotkey order (1-9, then 0). */
export const CROP_ORDER: CropKind[] = [
  'radish', 'lettuce', 'carrot', 'sunflower', 'corn', 'tomato', 'strawberry', 'pumpkin', 'watermelon', 'golden',
];

// ---------------------------------------------------------------- defenses

export type DefenseKind = 'fence' | 'trap' | 'scarecrow' | 'sprinkler' | 'turret' | 'doghouse' | 'thumper' | 'decoy' | 'beehive';

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
    kind: 'turret', name: 'Sling Turret', cost: 60, hp: 10, blocks: true, radius: 2.6, period: 1.5, damage: 1, duration: 0,
    blurb: 'Plinks pebbles at any bunny in range.',
  },
  doghouse: {
    kind: 'doghouse', name: 'Dog', cost: 60, hp: 16, blocks: true, radius: 3.5, period: 0.8, damage: 2, duration: 0,
    blurb: 'A good boy on a long leash. Chases and bites.',
  },
  thumper: {
    kind: 'thumper', name: 'Thumper', cost: 35, hp: 10, blocks: true, radius: 2.5, period: 3, damage: 0, duration: 2,
    blurb: 'Pounds the ground. Burrowers nearby get knocked up to the surface, dazed, where you can hit them.',
  },
  decoy: {
    kind: 'decoy', name: 'Carrot Decoy', cost: 20, hp: 20, blocks: false, radius: 4, period: 0, damage: 0, duration: 0,
    blurb: "A painted wooden carrot bunnies can't resist. They gnaw on it instead of your crops, and go home hungry.",
  },
  beehive: {
    kind: 'beehive', name: 'Beehive', cost: 70, hp: 10, blocks: true, radius: 2.5, period: 1.0, damage: 1, duration: 0.6,
    blurb: 'Bees sting the nearest bunny, again and again. Helmets and ninja tricks are no help against bees.',
  },
};

/** Store order, and hotkeys Q W E R T Y, then A S D. */
export const DEFENSE_ORDER: DefenseKind[] = [
  'fence', 'trap', 'scarecrow', 'sprinkler', 'turret', 'doghouse', 'thumper', 'decoy', 'beehive',
];

// ---------------------------------------------------------------- defense upgrades

export const MAX_LEVEL = 5;
const UPGRADE_PRICE = [1, 1.6, 2.6, 4]; // levels 2-5, as multiples of the defense's own price

/** Price to take a defense from `level` to `level + 1` (0 when maxed). */
export function upgradeCost(kind: DefenseKind, level: number): number {
  if (level < 1 || level >= MAX_LEVEL) return 0;
  return Math.round(DEFENSES[kind].cost * UPGRADE_PRICE[level - 1]);
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
  shock: number; // fences at 4 stars and up: damage per second to anything chewing them
}

/** A defense's working numbers at a level: wider, faster, harder-hitting, sturdier. */
export function defenseStats(kind: DefenseKind, level = 1): DefenseStats {
  const d = DEFENSES[kind];
  const up = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  // traps and dogs bite harder every level; turret pebbles and bee stings every other level
  const extra = kind === 'trap' || kind === 'doghouse' ? up : kind === 'turret' || kind === 'beehive' ? Math.floor(up / 2) : 0;
  return {
    radius: d.radius * (1 + 0.14 * up),
    period: d.period * Math.pow(0.88, up),
    damage: d.damage + extra,
    duration: d.duration * (1 + 0.2 * up),
    hp: Math.round(d.hp * (1 + 0.5 * up)),
    shock: kind === 'fence' ? Math.max(0, up - 2) : 0,
  };
}

/** What a defense gains at its top levels, beyond bigger numbers. */
export const PERKS: Partial<Record<DefenseKind, { level: number; text: string }>> = {
  fence: { level: 4, text: 'Electrified: bunnies that chew it get zapped.' },
  sprinkler: { level: 4, text: 'Floods tunnels: Burrowers in range pop up.' },
  turret: { level: 5, text: 'Two pebbles at once, at two bunnies.' },
  scarecrow: { level: 5, text: 'Scary enough to spook an Asteroid Buck.' },
};

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
  blurb: string; // one short line for the Scouting Report
}

export const WEATHER: Record<Weather, WeatherDef> = {
  sunny: { name: 'Sunny', growth: 1, bunnySpeed: 1, bunnies: 1, blurb: 'Clear skies.' },
  rain: { name: 'Rain', growth: 1.3, bunnySpeed: 0.85, bunnies: 1, blurb: 'Crops +30%, bunnies slowed.' },
  fog: { name: 'Fog', growth: 1, bunnySpeed: 1, bunnies: 1.2, blurb: '20% more bunnies sneak in.' },
  snow: { name: 'Snow', growth: 0.85, bunnySpeed: 0.9, bunnies: 1, blurb: 'Slow crops, slow bunnies.' },
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

export type BunnyKind =
  | 'common' | 'speedy' | 'digger' | 'kit' | 'fat' | 'pothead' | 'leaper' | 'bandit' | 'snowhare' | 'ninja' | 'queen' | 'mutant'
  | 'golden';

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
  aim: number; // how far above its feet (tiles) the middle of its body is
  firstRound: number;
  dodge?: number; // chance to sidestep a pebble (sling or turret)
  brood?: number; // seconds between the Burrowers she sends out
  litter?: number; // arrives this many at once
  armor?: number; // pebbles that clang off before one gets through
  leaps?: boolean; // jumps over fences and other defenses instead of chewing
  thief?: boolean; // carries off a whole crop instead of nibbling
  winter?: boolean; // only comes out in winter; snow doesn't slow it
  golden?: boolean; // a prize: dashes across the farm, and only your own shots can catch it
  blurb: string;
}

export const BUNNIES: Record<BunnyKind, BunnyDef> = {
  common: {
    kind: 'common', name: 'Bunny', hp: 1, speed: 2.0, appetite: 3, biteRate: 1.0, chewRate: 1.0,
    digger: false, boss: false, size: 7, aim: 0.3, firstRound: 1, blurb: 'Brown. Hungry.',
  },
  speedy: {
    kind: 'speedy', name: 'Jackrabbit', hp: 1, speed: 3.4, appetite: 2, biteRate: 1.2, chewRate: 0.7,
    digger: false, boss: false, size: 7, aim: 0.3, firstRound: 2, blurb: 'Fast. Grabs a bite and bolts.',
  },
  digger: {
    kind: 'digger', name: 'Burrower', hp: 2, speed: 1.5, appetite: 4, biteRate: 0.8, chewRate: 0,
    digger: true, boss: false, size: 7, aim: 0.3, firstRound: 3, blurb: 'Tunnels under everything. Hit it when it surfaces.',
  },
  fat: {
    kind: 'fat', name: 'Chonk', hp: 5, speed: 1.15, appetite: 8, biteRate: 1.6, chewRate: 2.0,
    digger: false, boss: false, size: 9, aim: 0.35, firstRound: 4, blurb: 'Slow, tough, and bottomless.',
  },
  kit: {
    kind: 'kit', name: 'Kits', hp: 1, speed: 2.5, appetite: 1.5, biteRate: 0.8, chewRate: 0.4,
    digger: false, boss: false, size: 5, aim: 0.18, firstRound: 5, litter: 4,
    blurb: 'Baby bunnies. Tiny and quick, and they come four to a litter.',
  },
  pothead: {
    kind: 'pothead', name: 'Pot-Head', hp: 2, speed: 1.8, appetite: 3, biteRate: 1.0, chewRate: 1.0,
    digger: false, boss: false, size: 7, aim: 0.3, firstRound: 10, armor: 2,
    blurb: "Wears a cooking pot. Pebbles clang off it until it's knocked loose. Splash, traps, bees and dogs don't care.",
  },
  leaper: {
    kind: 'leaper', name: 'Leaper', hp: 2, speed: 2.6, appetite: 3, biteRate: 1.0, chewRate: 0,
    digger: false, boss: false, size: 7, aim: 0.3, firstRound: 11, leaps: true,
    blurb: 'Springs right over fences and anything else in its way.',
  },
  bandit: {
    kind: 'bandit', name: 'Bandit', hp: 3, speed: 2.2, appetite: 1, biteRate: 1.0, chewRate: 1.2,
    digger: false, boss: false, size: 7, aim: 0.3, firstRound: 16, thief: true,
    blurb: 'Grabs a whole ripe crop and runs for home. Bonk it and it drops the loot.',
  },
  snowhare: {
    kind: 'snowhare', name: 'Snow Hare', hp: 2, speed: 2.4, appetite: 3, biteRate: 1.1, chewRate: 0.8,
    digger: false, boss: false, size: 7, aim: 0.3, firstRound: 22, winter: true,
    blurb: "Only comes out in winter. White on white, and snow doesn't slow it down.",
  },
  ninja: {
    kind: 'ninja', name: 'Ninja Bunny', hp: 2, speed: 2.7, appetite: 3, biteRate: 1.2, chewRate: 0.8,
    digger: false, boss: false, size: 7, aim: 0.3, firstRound: 31, dodge: 0.5,
    blurb: 'Sidesteps half of all pebbles, yours and the turrets\'. Traps and dogs still get it.',
  },
  queen: {
    kind: 'queen', name: 'Bunny Queen', hp: 10, speed: 0.9, appetite: 10, biteRate: 1.4, chewRate: 1.5,
    digger: false, boss: false, size: 9, aim: 0.35, firstRound: 36, brood: 5,
    blurb: 'Waddles in and sends Burrowers out from under her robes. Bonk her first.',
  },
  mutant: {
    kind: 'mutant', name: 'Asteroid Buck', hp: 24, speed: 1.0, appetite: 40, biteRate: 2.4, chewRate: 6.0,
    digger: false, boss: true, size: 13, aim: 0.6, firstRound: 7, blurb: 'Something came out of that crater. It eats and eats, and the crops it eats are gone for good.',
  },
  golden: {
    kind: 'golden', name: 'Golden Bunny', hp: 1, speed: 4.2, appetite: 0, biteRate: 0, chewRate: 0, digger: false, boss: false,
    size: 7, aim: 0.3, firstRound: 3, golden: true,
    blurb: "Streaks across the farm now and then. Your defenses can't touch it; bonk it yourself for a prize.",
  },
};

/**
 * Most days from Day 3, a golden bunny dashes across the farm. Only your own weapons can catch it, and it pays:
 * cash (base plus so much a day), a free star on a defense, or a free Seed Lab level.
 */
export const GOLDEN = { from: 3, chance: 0.6, cash: 60, cashPerDay: 14 };

export const BUNNY_ORDER: BunnyKind[] = [
  'common', 'speedy', 'digger', 'kit', 'fat', 'pothead', 'leaper', 'bandit', 'snowhare', 'ninja', 'queen', 'mutant', 'golden',
];

/** Burrowers poke their heads up to sniff the air every few seconds while they tunnel. */
export const PEEK = { every: 3.2, jitter: 2.2, stay: 0.9 };
/** How long a Burrower stays up after something knocks it out of the ground. */
export const POP_SECONDS = 1.4;

export const BOSS_EVERY = SEASON_DAYS; // an Asteroid Buck on the last day of every season
export const QUEEN_BROOD_MAX = 6;
export const BOSS_HP_PER_APPEARANCE = 8; // each later boss is tougher
export const BOSS_BOUNTY = 100;
export const BREED_CAP = 20;

export function waveSize(round: number): number {
  const r = round - 1;
  const q = Math.min(r, 27); // after the first year the waves keep growing, but stop accelerating
  return Math.round(5 + 2.0 * r + 0.03 * q * q);
}

/** Relative odds of each regular bunny kind showing up on a given round. A kit roll is a whole litter. */
export function waveWeights(round: number, mode: Mode = 'normal'): [BunnyKind, number][] {
  const w: [BunnyKind, number][] = [['common', 10]];
  const from = (k: BunnyKind) => round - firstRound(k, mode);
  if (from('speedy') >= 0) w.push(['speedy', Math.min(8, 2 + round * 0.5)]);
  if (from('digger') >= 0) w.push(['digger', Math.min(5, 1 + (round - 3) * 0.4)]);
  if (from('fat') >= 0) w.push(['fat', Math.min(5, 1 + (round - 4) * 0.4)]);
  if (from('kit') >= 0) w.push(['kit', Math.min(2.2, 0.8 + from('kit') * 0.1)]);
  if (from('pothead') >= 0) w.push(['pothead', Math.min(4, 1.2 + from('pothead') * 0.3)]);
  if (from('leaper') >= 0) w.push(['leaper', Math.min(4, 1.2 + from('leaper') * 0.3)]);
  if (from('bandit') >= 0) w.push(['bandit', Math.min(2.5, 0.8 + from('bandit') * 0.1)]);
  if (from('snowhare') >= 0 && seasonOf(round) === 'winter') w.push(['snowhare', 5]);
  if (from('ninja') >= 0) w.push(['ninja', Math.min(5, 2 + from('ninja') * 0.25)]);
  if (from('queen') >= 0) w.push(['queen', Math.min(1.2, 0.5 + from('queen') * 0.05)]);
  return w;
}

/** Later days bring tougher, quicker bunnies so a finished fortress still gets tested. */
export function bunnyHpScale(round: number): number {
  return 1 + Math.max(0, round - 6) * 0.07;
}

export function bunnySpeedScale(round: number): number {
  return 1 + Math.min(0.3, (round - 1) * 0.015);
}

export function burrowCount(round: number): number {
  return Math.min(5, 2 + Math.floor((round - 1) / 2));
}

// ---------------------------------------------------------------- land: bought a lot at a time, then tilled

export const LOT = 2; // a lot is 2x2 tiles
export const LOTS_X = 8;
export const LOTS_Y = 6;
export const FARM_X0 = 3; // top-left tile of the grid of lots; everything outside it is wild country
export const FARM_Y0 = 2;
export const LOT_COUNT = LOTS_X * LOTS_Y;
/** The farm starts with the 8x4 patch in the middle, already tilled. */
export const START_LOTS = [2, 3, 4, 5].flatMap((lx) => [2, 3].map((ly) => ly * LOTS_X + lx));
export const TILL_COST = 2; // per tile, to turn grass into a seedbed

/** Price of the next lot, given how many you've bought already. Each one costs a little more. */
export function lotPrice(bought: number): number {
  return Math.round(28 + 5.6 * bought + 0.625 * bought * bought);
}

// ---------------------------------------------------------------- weapons (you, firing from the porch)

export type WeaponKind = 'sling' | 'pellet' | 'spud' | 'hose' | 'rocket';

export interface WeaponLevel {
  reload: number; // seconds between shots (hold weapons fire at this rate while held)
  damage: number; // per hit; per second for the hose
  radius: number; // splash or spray radius, tiles
  spread?: number; // pellet scatter, tiles
}

export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  hold: boolean; // keeps firing while the button is held
  splash: boolean; // hits everything in a radius, ignores helmets, and shakes Burrowers out of the ground
  flight: number; // seconds from firing to landing (0: instant)
  cost: number; // to buy it (0: you start with it)
  upgrades: number[]; // price of levels 2-5
  levels: WeaponLevel[];
  blurb: string;
}

export const WEAPONS: Record<WeaponKind, WeaponDef> = {
  sling: {
    kind: 'sling', name: 'Slingshot', hold: false, splash: false, flight: 0, cost: 0, upgrades: [60, 150, 350, 750],
    levels: [
      { reload: 0.45, damage: 1, radius: 0 }, { reload: 0.38, damage: 1, radius: 0 }, { reload: 0.32, damage: 2, radius: 0 },
      { reload: 0.27, damage: 2, radius: 0 }, { reload: 0.22, damage: 3, radius: 0 },
    ],
    blurb: 'Your trusty sling. One pebble, one bunny. Hit a dirt mound to startle the Burrower out.',
  },
  pellet: {
    kind: 'pellet', name: 'Pellet Gun', hold: true, splash: false, flight: 0, cost: 200, upgrades: [150, 300, 600, 1000],
    levels: [
      { reload: 0.16, damage: 1, radius: 0, spread: 0.55 }, { reload: 0.14, damage: 1, radius: 0, spread: 0.45 },
      { reload: 0.12, damage: 1, radius: 0, spread: 0.38 }, { reload: 0.1, damage: 1, radius: 0, spread: 0.3 },
      { reload: 0.08, damage: 2, radius: 0, spread: 0.25 },
    ],
    blurb: "Hold the button to spray pellets. Not accurate, but there are a lot of them.",
  },
  spud: {
    kind: 'spud', name: 'Spud Gun', hold: false, splash: true, flight: 0.35, cost: 350, upgrades: [250, 500, 900, 1500],
    levels: [
      { reload: 1.3, damage: 2, radius: 0.8 }, { reload: 1.15, damage: 3, radius: 0.9 }, { reload: 1.0, damage: 3, radius: 1.0 },
      { reload: 0.9, damage: 4, radius: 1.1 }, { reload: 0.8, damage: 5, radius: 1.25 },
    ],
    blurb: 'Lobs a potato that bursts where it lands: hits everything nearby, knocks off pots, shakes Burrowers loose.',
  },
  hose: {
    kind: 'hose', name: 'Garden Hose', hold: true, splash: false, flight: 0, cost: 300, upgrades: [200, 400, 700, 1200],
    levels: [
      { reload: 0, damage: 0, radius: 0.9 }, { reload: 0, damage: 0.5, radius: 1.0 }, { reload: 0, damage: 1, radius: 1.1 },
      { reload: 0, damage: 1.5, radius: 1.2 }, { reload: 0, damage: 2, radius: 1.35 },
    ],
    blurb: 'Hold to spray. Shoves bunnies back, soaks them slow, and floods Burrowers up out of their tunnels.',
  },
  rocket: {
    kind: 'rocket', name: 'Firework Launcher', hold: false, splash: true, flight: 0.6, cost: 1000, upgrades: [600, 1200, 2000, 3000],
    levels: [
      { reload: 3.0, damage: 6, radius: 1.4 }, { reload: 2.7, damage: 8, radius: 1.5 }, { reload: 2.4, damage: 10, radius: 1.6 },
      { reload: 2.1, damage: 12, radius: 1.8 }, { reload: 1.8, damage: 15, radius: 2.0 },
    ],
    blurb: 'A skyrocket with a big bang. Made for Asteroid Bucks.',
  },
};

export const WEAPON_ORDER: WeaponKind[] = ['sling', 'pellet', 'spud', 'hose', 'rocket'];
export const WEAPON_LEVELS = 5;
export const HOSE_PUSH = 4.5; // tiles/s shove away from where the water lands

export function weaponStats(kind: WeaponKind, level: number): WeaponLevel {
  const levels = WEAPONS[kind].levels;
  return levels[Math.max(0, Math.min(levels.length, level) - 1)];
}

// ---------------------------------------------------------------- farm upgrades and the Seed Lab

export type FarmUpgrade = 'soil' | 'well' | 'stall' | 'greenhouse';

export const FARM: Record<FarmUpgrade, { name: string; costs: number[]; blurb: string }> = {
  soil: { name: 'Rich Soil', costs: [250, 700, 1800], blurb: 'Compost worked into every row: all crops grow 8% faster per level.' },
  well: { name: 'Well Pump', costs: [900], blurb: 'Real water pressure: crops near a sprinkler grow 70% faster instead of 40%.' },
  stall: { name: 'Market Stall', costs: [600, 1600], blurb: 'Sell from your own stall in town: every crop fetches 6% more per level.' },
  greenhouse: { name: 'Greenhouse', costs: [1500], blurb: 'Glass over the rows: winter and snow stop slowing your crops.' },
};

export const FARM_ORDER: FarmUpgrade[] = ['soil', 'well', 'stall', 'greenhouse'];
export const SOIL_GROWTH = 0.08;
export const STALL_PRICE = 0.06;
export const WELL_GROWTH = 1.7;

/** Seed Lab: breed a better strain of any crop, three times. Each grows faster and sells for more. */
export const HYBRID_LEVELS = 3;
export const HYBRID_GROWTH = 0.15;
export const HYBRID_VALUE = 0.05;
const HYBRID_PRICE = [15, 30, 55]; // multiples of the seed price

export function hybridCost(kind: CropKind, level: number): number | null {
  return level >= HYBRID_LEVELS ? null : Math.round(CROPS[kind].seedCost * HYBRID_PRICE[level]);
}

// ---------------------------------------------------------------- the Crater Project (how you win)

export interface ProjectStage {
  name: string;
  cost: number;
  bucks: number; // Asteroid Bucks you must have beaten before this stage can start
  blurb: string;
}

export const PROJECT: ProjectStage[] = [
  { name: 'Survey the Crater', cost: 1500, bucks: 1, blurb: 'Stakes, string, and a very long ladder. The crater notices.' },
  { name: 'Pour the Ring', cost: 5000, bucks: 2, blurb: 'A concrete collar around the rim. The glow turns angry.' },
  { name: 'Cap the Crater', cost: 10000, bucks: 4, blurb: 'Lower the lid tonight. Everything still down there comes out fighting.' },
];

export const CAP_RETRY = 0.35; // if the cap cracks, trying again costs this share of the price
/** Throw one into the crater in the morning and an Asteroid Buck climbs out that day, whatever the calendar says. */
export const SMOKE_BOMB = 250;

/** Every stage makes the crater angrier: bigger waves, bunnies straight out of the crater, tougher Bucks. */
export const ANGER = { wave: 0.12, craterBunnies: 2, bossHp: 0.25 };

// ---------------------------------------------------------------- hard mode: opens once you've sealed the crater

export type Mode = 'normal' | 'hard';

export interface ModeDef {
  name: string;
  waves: number; // bunnies each day
  hp: number; // how tough the regular bunnies are
  bossHp: number; // and the Asteroid Bucks
  anger: number; // how much each Crater Project stage stirs up the crater
  lastNightBucks: number; // Asteroid Bucks on The Last Night
  firstRound: Partial<Record<BunnyKind, number>>; // bunnies that turn up sooner
  blurb: string;
}

export const MODES: Record<Mode, ModeDef> = {
  normal: { name: 'Normal', waves: 1, hp: 1, bossHp: 1, anger: 1, lastNightBucks: 3, firstRound: {}, blurb: '' },
  hard: {
    name: 'Hard', waves: 1.5, hp: 1.25, bossHp: 1.35, anger: 1.5, lastNightBucks: 4,
    // Year 2's troublemakers show up in Year 1
    firstRound: { pothead: 8, leaper: 9, bandit: 12, ninja: 16, queen: 23 },
    blurb: 'Half again as many bunnies every day, and tougher ones. Ninjas and Queens show up in the first year, the crater ' +
      'gets angrier with every stage, and four Asteroid Bucks come out on the Last Night.',
  },
};

/** The first day a kind of bunny can show up. */
export function firstRound(kind: BunnyKind, mode: Mode = 'normal'): number {
  return MODES[mode].firstRound[kind] ?? BUNNIES[kind].firstRound;
}

// ---------------------------------------------------------------- unlocks

export type Unlock =
  | CropKind | DefenseKind | Exclude<WeaponKind, 'sling'> | FarmUpgrade
  | 'upgrade2' | 'upgrade3' | 'upgrade4' | 'upgrade5' | 'land' | 'lab' | 'smoke';
export type Goal = 'day' | 'bonks' | 'harvest' | 'bucks';

export interface UnlockRule {
  what: Unlock;
  goal: Goal;
  n: number;
}

/** What the store holds back, and what opens it up. Anything not listed is there from Day 1. */
export const UNLOCKS: UnlockRule[] = [
  { what: 'scarecrow', goal: 'day', n: 3 },
  { what: 'sunflower', goal: 'day', n: 3 },
  { what: 'thumper', goal: 'day', n: 4 },
  { what: 'soil', goal: 'day', n: 4 },
  { what: 'corn', goal: 'harvest', n: 250 },
  { what: 'pellet', goal: 'bonks', n: 40 },
  { what: 'land', goal: 'day', n: 2 },
  { what: 'decoy', goal: 'day', n: 6 },
  { what: 'sprinkler', goal: 'bonks', n: 50 },
  { what: 'spud', goal: 'day', n: 7 },
  { what: 'upgrade2', goal: 'harvest', n: 1000 },
  { what: 'strawberry', goal: 'day', n: 8 },
  { what: 'lab', goal: 'harvest', n: 1500 },
  { what: 'turret', goal: 'bonks', n: 80 },
  { what: 'tomato', goal: 'day', n: 10 },
  { what: 'hose', goal: 'day', n: 10 },
  { what: 'stall', goal: 'harvest', n: 2500 },
  { what: 'beehive', goal: 'day', n: 12 },
  { what: 'well', goal: 'harvest', n: 4000 },
  { what: 'pumpkin', goal: 'day', n: 15 },
  { what: 'doghouse', goal: 'bonks', n: 250 },
  { what: 'upgrade3', goal: 'harvest', n: 6000 },
  { what: 'smoke', goal: 'bucks', n: 1 },
  { what: 'rocket', goal: 'bucks', n: 2 },
  { what: 'upgrade4', goal: 'bucks', n: 2 },
  { what: 'watermelon', goal: 'day', n: 18 },
  { what: 'greenhouse', goal: 'day', n: 20 },
  { what: 'upgrade5', goal: 'bucks', n: 3 },
  { what: 'golden', goal: 'bucks', n: 3 },
];

export const UNLOCK_RULE: Partial<Record<Unlock, UnlockRule>> = Object.fromEntries(UNLOCKS.map((r) => [r.what, r]));

export function unlockName(u: Unlock): string {
  switch (u) {
    case 'upgrade2': return '★★ upgrades';
    case 'upgrade3': return '★★★ upgrades';
    case 'upgrade4': return '★★★★ upgrades';
    case 'upgrade5': return '★★★★★ upgrades';
    case 'land': return 'Buying land';
    case 'lab': return 'the Seed Lab';
    case 'smoke': return 'Smoke Bombs';
    default:
      if (u in CROPS) return CROPS[u as CropKind].name;
      if (u in DEFENSES) return DEFENSES[u as DefenseKind].name;
      if (u in WEAPONS) return WEAPONS[u as WeaponKind].name;
      return FARM[u as FarmUpgrade].name;
  }
}

/** "Day 3", "50 bonks", "1,000¢ harvested", "Beat an Asteroid Buck" */
export function goalText(goal: Goal, n: number): string {
  switch (goal) {
    case 'day': return `Day ${n}`;
    case 'bonks': return `${n.toLocaleString('en-US')} bonks`;
    case 'harvest': return `${n.toLocaleString('en-US')}¢ harvested`;
    case 'bucks': return n === 1 ? 'Beat a Buck' : `Beat ${n} Bucks`;
  }
}

// ---------------------------------------------------------------- the market

export const MARKET = {
  drift: 0.08, // how far a price can wander overnight
  pull: 0.3, // and how hard it's pulled back toward normal
  min: 0.7,
  max: 1.4,
  glut: 15, // an evening's harvest sells this many of one crop at full price...
  glutDrop: 0.02, // ...then each one past that knocks 2% off
  glutFloor: 0.55,
  memory: 0.4, // share of an evening's sales the market still remembers the next day
  wanted: 0.05, // each evening a crop goes unsold, town wants it 5% more...
  wantedMax: 0.4, // ...up to +40%, until you sell some
};
