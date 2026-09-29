// Game state and rules. No DOM or canvas in here, so it runs headless in tests.
import {
  ANGER, BOSS_BOUNTY, BOSS_EVERY, BOSS_HP_PER_APPEARANCE, BREED_CAP, BUNNIES, type BunnyKind, bunnyHpScale, burrowCount,
  CAP_RETRY, COLS, CROPS, CROP_ORDER, type CropKind, DEFENSES, type DefenseKind, defenseStats, FARM, FARM_ORDER,
  CUSTOMERS, cropPlural, type EventKind, EVENTS, type FarmUpgrade, MERCHANT, type Goal, GOLDEN, goalText, HARVEST_SECONDS, HOSE_PUSH, HYBRID_GROWTH, HYBRID_LEVELS, HYBRID_VALUE, hybridCost, investedIn,
  LOT_COUNT, lotPrice, MARKET, MAX_LEVEL, type Mode, MODES, ORDERS, ripenDays, SMOKE_BOMB, POP_SECONDS, PROJECT, REPAIR_RATE, ROUND_SECONDS, ROWS, type Season, seasonOf, SEASONS,
  SELL_BACK, SOIL_GROWTH, SPAWN_WINDOW, SPRINKLER_GROWTH, STALL_PRICE, START_CREDITS, START_LOTS, SUNDOWN_MAX_SECONDS,
  TILL_COST, type Unlock, UNLOCK_RULE, unlockName, UNLOCKS, upgradeCost, waveSize, waveWeights, WEAPON_LEVELS,
  WEAPON_ORDER, type WeaponKind, WEAPONS, weaponStats, type Weather, WEATHER, WEATHER_ODDS, WELL_GROWTH,
} from './config';
import { hashSeed, makeRng, type Rng } from './rng';
import { PathField } from './path';
import { knockBack, sidestep, updateBunnies } from './sim/bunnies';
import { updateDefenses } from './sim/defenses';
import type {
  Bunny, Burrow, Crop, DayEvent, Dog, GameEvent, LifetimeStats, Offer, Order, Phase, Projectile, RoundStats, Shell, ShopItem, SpawnEntry,
  Structure, Tile,
} from './types';
import {
  CRATER, CRATER_SPAWN, idx, inCrater, inMap, inRect, lotOf, lotOfTile, lotRect, lotTiles, type MapKind, N, OBSTACLE, pickBurrows,
  type Rect, setMap, tileX, tileY,
} from './world';

// v2: the 22x14 farm, the Crater Project, the market. v3: weapons, farm upgrades, the Seed Lab.
// v4: a 22x16 map, land bought by the lot and tilled by the tile. Older saves are brought up to date.
export const SAVE_VERSION = 4;

/** Where damage came from: pebbles clang off pots and can be dodged; nothing else can. */
export type DamageSource = 'pebble' | 'splash' | 'trap' | 'dog' | 'bee' | 'shock' | 'hose';

export interface SaveData {
  v: number;
  seed: number;
  round: number;
  credits: number;
  plotLevel?: number; // v1-3: a square plot that grew all at once
  slingLevel?: number; // v1-2: the sling was 0-2
  breedBonus: number;
  stats: LifetimeStats;
  tiles: {
    i: number;
    crop?: { kind: CropKind; growth: number; hp: number; harvests?: number };
    structure?: { kind: DefenseKind; hp: number; level?: number };
  }[];
  project?: number;
  capDiscount?: boolean;
  lastNight?: boolean;
  market?: Partial<Record<CropKind, number>>;
  glut?: Partial<Record<CropKind, number>>;
  wanted?: Partial<Record<CropKind, number>>;
  weapons?: Partial<Record<WeaponKind, number>>;
  weapon?: WeaponKind;
  farm?: Partial<Record<FarmUpgrade, number>>;
  hybrid?: Partial<Record<CropKind, number>>;
  lots?: number[]; // the lots you own
  lotsBought?: number;
  tilled?: number[]; // tilled tiles
  mode?: Mode; // hard mode, once it's open (normal if missing)
  smoked?: boolean; // a smoke bomb went into the crater this morning
  order?: Order | null; // an order from town, if one is open
  event?: DayEvent | null; // today's event
  eventBought?: string[]; // what's gone from the merchant's cart
  map?: MapKind; // which farm (Home Farm if missing)
  runId?: string; // one per farm, so a farm kept after its win updates its high score instead of adding another
}

/**
 * Bring an older save up to date, or null if it can't be read. v1 farms lived on a 28x18 map with land up
 * to 12x12; they move onto the 22x14 map keeping their place on the plot, and anything on land that no
 * longer exists comes back as credits.
 */
export function migrateSave(d: SaveData | null): SaveData | null {
  if (!d || !Array.isArray(d.tiles)) return null;
  if (d.v === 1) d = fromV1(d);
  if (d.v === 2) d = { ...d, v: 3, weapons: { sling: Math.min(WEAPON_LEVELS, (d.slingLevel ?? 0) + 1) } };
  if (d.v === 3) d = fromV3(d);
  return d.v === SAVE_VERSION ? d : null;
}

/** The square plot of v1-3 farms, on the 22x14 map of v2-3. */
function oldPlot(level: number): Rect {
  const size = [6, 8, 10][Math.max(0, Math.min(2, level))];
  const x0 = (22 - size) / 2;
  const y0 = (14 - size) / 2;
  return { x0, y0, x1: x0 + size - 1, y1: y0 + size - 1 };
}

/**
 * v3 -> v4: the map grew a row at the top and bottom, so everything moves down one, and the old square plot
 * becomes tilled ground on whichever lots it covered.
 */
function fromV3(d: SaveData): SaveData {
  const tiles = d.tiles.map((t) => ({ ...t, i: t.i + COLS }));
  const plot = oldPlot(d.plotLevel ?? 0);
  const lots = new Set<number>(START_LOTS);
  const tilled: number[] = [];
  for (let y = plot.y0; y <= plot.y1; y++) {
    for (let x = plot.x0; x <= plot.x1; x++) {
      tilled.push(idx(x, y + 1));
      const lot = lotOf(x, y + 1);
      if (lot >= 0) lots.add(lot);
    }
  }
  return { ...d, v: 4, tiles, tilled, lots: [...lots], lotsBought: lots.size - START_LOTS.length };
}

function fromV1(d: SaveData): SaveData {
  const OLD_COLS = 28;
  const OLD_LAND = [0, 150, 350, 750];
  const was = d.plotLevel ?? 0;
  const level = Math.max(0, Math.min(was, 2));
  let credits = d.credits;
  for (let l = level + 1; l <= was; l++) credits += OLD_LAND[l] ?? 0;
  const rect = oldPlot(level);
  const tiles: SaveData['tiles'] = [];
  for (const t of d.tiles) {
    const x = (t.i % OLD_COLS) - 3; // the two maps share a center
    const y = Math.floor(t.i / OLD_COLS) - 2;
    if (inRect(rect, x, y)) {
      tiles.push({ ...t, i: y * 22 + x });
    } else {
      if (t.structure && DEFENSES[t.structure.kind]) credits += investedIn(t.structure.kind, t.structure.level ?? 1);
      if (t.crop && CROPS[t.crop.kind]) credits += CROPS[t.crop.kind].seedCost;
    }
  }
  return { ...d, v: 2, plotLevel: level, credits, tiles };
}

/** How the Last Night went, once it's over. */
export type NightResult = 'sealed' | 'cracked' | null;

function emptyRoundStats(): RoundStats {
  return {
    harvested: {}, harvestTotal: 0, spent: 0, kills: 0, bounty: 0,
    escapedFed: 0, escapedHungry: 0, cropsLost: 0, structuresBroken: 0, bucks: 0, bucksEscaped: 0, cropsStolen: 0, market: {},
    prize: '', prizeCash: 0, orderPaid: 0, orderNote: '', hailHit: 0, fairSold: 0,
  };
}

const evenMarket = (v: number) => Object.fromEntries(CROP_ORDER.map((k) => [k, v])) as Record<CropKind, number>;
const noWeapons = () => Object.fromEntries(WEAPON_ORDER.map((k) => [k, 0])) as Record<WeaponKind, number>;
const noFarm = () => Object.fromEntries(FARM_ORDER.map((k) => [k, 0])) as Record<FarmUpgrade, number>;
const startWeapons = () => ({ ...noWeapons(), sling: 1 });

const startLots = () => Array.from({ length: LOT_COUNT }, (_, n) => START_LOTS.includes(n));

function startTilled(): Uint8Array {
  const t = new Uint8Array(N);
  for (const n of START_LOTS) for (const i of lotTiles(n)) t[i] = 1;
  return t;
}

/** Bunnies a wave entry brings: one, or a whole litter. */
const entrySize = (e: SpawnEntry) => BUNNIES[e.kind].litter ?? 1;

export class Game {
  phase: Phase = 'title';
  seed = 1;
  mode: Mode = 'normal';
  map: MapKind = 'home';
  runId = '';
  round = 1;
  credits = START_CREDITS;
  lots = startLots(); // which lots you own
  lotsBought = 0; // every lot bought raises the price of the next
  tilled = startTilled(); // 1: tilled soil, ready for seeds
  tillEpoch = 0; // bumps whenever the ground changes, so the renderer knows to repaint it
  breedBonus = 0; // extra bunnies this round from last round's well-fed escapees
  stats: LifetimeStats = { kills: 0, harvest: 0, cropsLost: 0, bossesBeaten: 0 };
  roundStats: RoundStats = emptyRoundStats();

  project = 0; // Crater Project stages paid for; each one angers the crater
  capDiscount = false; // the cap cracked once, so putting it back on costs less
  lastNight = false; // today is The Last Night
  smoked = false; // a smoke bomb went into the crater this morning: a Buck comes out today
  goldenAt = -1; // when today's golden bunny makes its dash (seconds into the day), or -1
  order: Order | null = null; // an order from town, if one is open
  newOrder = false; // it was posted this morning
  event: DayEvent | null = null; // something different about today
  eventBought: string[] = []; // deals already taken off the merchant's cart
  hail = 0; // seconds of hail left
  private hailFell = false;
  nightResult: NightResult = null;
  unlocked = new Set<Unlock>();
  newUnlocks: Unlock[] = []; // what opened up in the store this morning
  market = evenMarket(1); // today's price for each crop, as a share of normal
  glut = evenMarket(0); // how much of each crop the market still remembers you selling
  wanted = evenMarket(0); // evenings since each crop last went to market (only once it's for sale)

  weapons = startWeapons(); // level of each weapon you own (0: you don't)
  weapon: WeaponKind = 'sling'; // the one in your hands
  weaponCd = noWeapons(); // seconds until each can fire again
  shells: Shell[] = []; // potatoes and fireworks in the air
  hoseAim: { x: number; y: number } | null = null; // where the hose is pointed while it's held
  farm = noFarm(); // farm upgrade levels
  hybrid = evenMarket(0); // Seed Lab level of each crop

  tiles: Tile[] = [];
  bunnies: Bunny[] = [];
  dogs: Dog[] = [];
  projectiles: Projectile[] = [];
  burrows: Burrow[] = [];
  wave: SpawnEntry[] = [];
  events: GameEvent[] = [];

  season: Season = 'spring';
  weather: Weather = 'sunny';

  time = 0; // seconds into the day
  phaseTime = 0; // seconds spent in the current phase
  rng: Rng = makeRng(1);

  // derived maps, rebuilt when structures change
  costWalk = new Float32Array(N);
  costDig = new Float32Array(N);
  solidWalk = new Uint8Array(N);
  solidDig = new Uint8Array(N);
  growthMult = new Float32Array(N);
  targetCount = new Int16Array(N);
  pathEpoch = 0;
  field = new PathField();

  private costDirty = true;
  private costTimer = 0;
  private spawnIdx = 0;
  private nextId = 1;
  private harvestQueue: { i: number; value: number; kind: CropKind }[] = [];
  private harvestTimer = 0;
  private harvestStep = 0.1; // seconds between coins

  constructor() {
    this.resetTiles();
  }

  // ------------------------------------------------------------ lifecycle

  newGame(seed = (Math.random() * 2 ** 31) | 0, mode: Mode = 'normal', map: MapKind = 'home'): void {
    this.seed = seed;
    this.mode = mode;
    this.map = map;
    setMap(map);
    this.runId = `${Date.now().toString(36)}${(seed >>> 0).toString(36)}`;
    this.retired = false;
    this.round = 1;
    this.credits = START_CREDITS;
    this.lots = startLots();
    this.lotsBought = 0;
    this.tilled = startTilled();
    this.tillEpoch++;
    this.breedBonus = 0;
    this.stats = { kills: 0, harvest: 0, cropsLost: 0, bossesBeaten: 0 };
    this.weapons = startWeapons();
    this.weapon = 'sling';
    this.farm = noFarm();
    this.hybrid = evenMarket(0);
    this.project = 0;
    this.capDiscount = false;
    this.lastNight = false;
    this.smoked = false;
    this.order = null;
    this.unlocked = new Set();
    this.market = evenMarket(1);
    this.glut = evenMarket(0);
    this.wanted = evenMarket(0);
    this.resetTiles();
    this.enterPlanning();
  }

  private resetTiles(): void {
    this.tiles = Array.from({ length: N }, () => ({ crop: null, structure: null }));
    this.bunnies = [];
    this.dogs = [];
    this.projectiles = [];
    this.costDirty = true;
  }

  /** Set up the scouting report for the current round and open the store. `newDay` is false when loading a save. */
  private enterPlanning(newDay = true): void {
    setMap(this.map);
    this.phase = 'planning';
    this.phaseTime = 0;
    this.time = 0;
    this.roundStats = emptyRoundStats();
    this.bunnies = [];
    this.dogs = [];
    this.projectiles = [];
    this.nightResult = null;
    this.rng = makeRng(hashSeed(this.seed, this.round));
    this.season = seasonOf(this.round);
    this.weather = this.rollWeather();
    this.burrows = pickBurrows(this.rng, burrowCount(this.round));
    this.wave = this.buildWave();
    this.spawnIdx = 0;
    // its own dice, so the rest of the day plays out the same with or without it
    const gold = makeRng(hashSeed(this.seed, this.round, 777));
    this.goldenAt = !this.lastNight && this.round >= GOLDEN.from && gold() < GOLDEN.chance
      ? 6 + gold() * (ROUND_SECONDS * SPAWN_WINDOW - 12) : -1;
    this.costDirty = true;
    if (newDay && this.round > 1) this.moveMarket();
    this.newOrder = false;
    if (newDay && !this.order) this.postOrder();
    this.hail = 0;
    this.hailFell = false;
    const fresh = this.refreshUnlocks();
    if (newDay) {
      this.event = null; // (yesterday's drought mustn't color today's choices)
      this.event = this.rollEvent();
      this.eventBought = [];
    }
    this.newUnlocks = newDay ? fresh : [];
    if (this.isBust()) this.phase = 'gameover';
  }

  private rollWeather(): Weather {
    const r = this.rng() * 100;
    if (this.round === 1) return 'sunny'; // a gentle first day
    let acc = 0;
    for (const [w, odds] of WEATHER_ODDS[this.season]) {
      acc += odds;
      if (r < acc) return w;
    }
    return 'sunny';
  }

  /** Growth multiplier from the season and today's weather. Under a greenhouse, cold never slows things down. */
  get climateGrowth(): number {
    const season = SEASONS[this.season].growth;
    const weather = WEATHER[this.weather].growth;
    return this.farm.greenhouse ? Math.max(1, season) * Math.max(1, weather) : season * weather;
  }

  private buildWave(): SpawnEntry[] {
    const rng = this.rng;
    const anger = this.sealed ? 0 : this.project; // a sealed crater sends nobody
    const m = MODES[this.mode];
    const scale = SEASONS[this.season].bunnies * WEATHER[this.weather].bunnies * (1 + ANGER.wave * m.anger * anger) *
      (this.lastNight ? 1.25 : 1) * m.waves;
    const count = Math.max(1, Math.round(waveSize(this.round) * scale)) + this.breedBonus;
    const weights = waveWeights(this.round, this.mode);
    const total = weights.reduce((s, [, w]) => s + w, 0);
    const roll = (): BunnyKind => {
      let r = rng() * total;
      for (const [k, w] of weights) {
        r -= w;
        if (r <= 0) return k;
      }
      return 'common';
    };
    const wave: SpawnEntry[] = [];
    const window = ROUND_SECONDS * SPAWN_WINDOW;
    for (let n = 0; n < count; n++) {
      const kind = roll();
      // the first one pops out right away; the rest spread through the day, each in its own slot with some
      // jitter, coming a little thicker in the afternoon
      const slot = (n + rng()) / count;
      const at = n === 0 ? 1 + rng() : 1.5 + Math.pow(slot, 1.15) * (window - 1.5);
      wave.push({ at, kind, burrow: Math.floor(rng() * this.burrows.length) });
    }
    // an angry crater sends some of its own
    const fromCrater = Math.round(anger * ANGER.craterBunnies * m.anger);
    for (let n = 0; n < fromCrater; n++) wave.push({ at: 4 + rng() * (window - 4), kind: roll(), burrow: -1 });
    if (this.lastNight) {
      const bucks = m.lastNightBucks;
      for (let k = 0; k < bucks; k++) wave.push({ at: window * (0.1 + (0.84 / bucks) * k), kind: 'mutant', burrow: -1 });
    } else if (this.bossToday()) {
      wave.push({ at: window * 0.45, kind: 'mutant', burrow: -1 });
    }
    wave.sort((a, b) => a.at - b.at);
    return wave;
  }

  /** Asteroid Bucks on The Last Night: three, or four in Hard Mode. */
  get lastNightBucks(): number {
    return MODES[this.mode].lastNightBucks;
  }

  /** A Buck comes today: it's the last day of a season, or the crater got smoked out. */
  bossToday(): boolean {
    return !this.sealed && (this.isBossDay() || this.smoked);
  }

  /** The crater's been capped: the run is won, and anything after is just farming. */
  get sealed(): boolean {
    return this.stats.sealedOn !== undefined;
  }

  /** From the victory screen: carry on with the crater sealed. No more Bucks; the bunnies keep coming. */
  keepFarming(): boolean {
    if (this.phase !== 'victory') return false;
    this.nightResult = null;
    this.breedBonus = Math.min(BREED_CAP, this.roundStats.escapedFed);
    this.smoked = false;
    this.round++;
    this.enterPlanning();
    return true;
  }

  /** A few bunnies hop about the field while the fireworks go off. */
  celebrate(): void {
    this.bunnies = [];
    for (let n = 0; n < 6; n++) {
      const b = this.spawnAt(n % 3 === 1 ? 'speedy' : 'common', 5 + this.rng() * (COLS - 10), 4 + this.rng() * 8);
      b.state = 'wander';
      b.timer = this.rng() * 2;
    }
    this.events = this.events.filter((e) => e.t !== 'spawn');
  }

  /** An Asteroid Buck comes on the last day of every season. */
  isBossDay(round = this.round): boolean {
    return round % BOSS_EVERY === 0;
  }

  retired = false;

  /** Hang up the hat: end the run on your own terms (planning only). */
  retire(): boolean {
    if (this.phase !== 'planning') return false;
    this.retired = true;
    this.phase = 'gameover';
    return true;
  }

  isBust(): boolean {
    if (this.tiles.some((t) => t.crop)) return false;
    const cheapest = Math.min(...CROP_ORDER.map((k) => CROPS[k].seedCost));
    return this.credits + this.totalSellValue() < cheapest;
  }

  startRound(): boolean {
    if (this.phase !== 'planning') return false;
    for (const t of this.tiles) {
      if (t.crop) t.crop.fresh = false;
      if (t.structure) {
        t.structure.fresh = false;
        t.structure.cd = 0;
        t.structure.anim = 99;
      }
    }
    this.phase = 'round';
    this.phaseTime = 0;
    this.time = 0;
    this.spawnIdx = 0;
    this.weaponCd = noWeapons();
    this.shells = [];
    this.hoseAim = null;
    if (!this.weapons[this.weapon]) this.weapon = 'sling';
    this.dogs = [];
    for (let i = 0; i < N; i++) {
      if (this.tiles[i].structure?.kind === 'doghouse') {
        this.dogs.push({ home: i, x: tileX(i) + 0.5, y: tileY(i) + 0.9, target: -1, cd: 0, facing: 1, moving: false, run: 0 });
      }
    }
    this.costDirty = true;
    this.emit({ t: 'roundStart' });
    return true;
  }

  /** Summary screen -> the next day's planning (or, once the crater is sealed, the victory). */
  continueAfterSummary(): void {
    if (this.phase !== 'summary') return;
    if (this.nightResult === 'sealed') {
      this.phase = 'victory';
      this.phaseTime = 0;
      return;
    }
    this.breedBonus = Math.min(BREED_CAP, this.roundStats.escapedFed);
    this.smoked = false;
    this.round++;
    this.enterPlanning();
  }

  // ------------------------------------------------------------ per-frame

  update(dt: number): void {
    if (setMap(this.map)) this.costDirty = true; // (free unless another game switched farms, as tests do)
    this.phaseTime += dt;
    if (this.phase === 'round' || this.phase === 'sundown') {
      this.stepDay(dt);
    } else if (this.phase === 'harvest') {
      this.stepHarvest(dt);
    } else if (this.phase === 'title' || this.phase === 'victory') {
      updateBunnies(this, dt);
    }
  }

  /** A few bunnies loafing around the empty meadow behind the title screen. */
  setupAttract(): void {
    this.map = 'home';
    setMap('home');
    this.phase = 'title';
    this.resetTiles();
    this.rng = makeRng(7);
    for (let n = 0; n < 7; n++) {
      const kind: BunnyKind = n === 3 ? 'speedy' : n === 5 ? 'fat' : 'common';
      this.spawn({ at: 0, kind, burrow: -1 });
      const b = this.bunnies[this.bunnies.length - 1];
      b.x = 3 + this.rng() * (COLS - 6);
      b.y = 3 + this.rng() * 12;
      b.state = 'wander';
      b.timer = this.rng() * 2;
    }
    this.events = [];
  }

  private stepDay(dt: number): void {
    this.costTimer -= dt;
    if (this.costDirty || this.costTimer <= 0) this.rebuildCosts();
    for (const k of WEAPON_ORDER) if (this.weaponCd[k] > 0) this.weaponCd[k] = Math.max(0, this.weaponCd[k] - dt);
    this.stepShells(dt);
    if (this.hoseAim && this.weapon === 'hose' && this.weapons.hose > 0) this.spray(this.hoseAim.x, this.hoseAim.y, dt);

    if (this.phase === 'round') {
      this.time += dt;
      while (this.spawnIdx < this.wave.length && this.wave[this.spawnIdx].at <= this.time) {
        this.spawn(this.wave[this.spawnIdx++]);
      }
      if (this.goldenAt >= 0 && this.time >= this.goldenAt) {
        this.goldenAt = -1;
        this.spawnGolden();
      }
      if (this.event?.kind === 'hail' && !this.hailFell && this.time >= (this.event.at ?? 0)) this.startHail();
      if (this.hail > 0) this.hail = Math.max(0, this.hail - dt);
      this.growCrops(dt);
      if (this.time >= ROUND_SECONDS) {
        this.phase = 'sundown';
        this.phaseTime = 0;
        this.emit({ t: 'sundown' });
      }
    }

    for (const t of this.tiles) {
      if (t.crop && t.crop.shake > 0) t.crop.shake -= dt;
      if (t.structure && t.structure.shake > 0) t.structure.shake -= dt;
    }

    updateDefenses(this, dt);
    updateBunnies(this, dt);

    if (this.phase === 'sundown' && (this.bunnies.length === 0 || this.phaseTime >= SUNDOWN_MAX_SECONDS)) {
      for (const b of this.bunnies) this.escaped(b);
      this.bunnies = [];
      this.projectiles = [];
      this.shells = [];
      this.hoseAim = null;
      if (this.lastNight) this.judgeNight();
      this.beginHarvest();
    }
  }

  /** A bunny made it off the field alive. A Bandit takes its loot with it. */
  escaped(b: Bunny): void {
    if (b.fed) this.roundStats.escapedFed++;
    else this.roundStats.escapedHungry++;
    if (BUNNIES[b.kind].boss) this.roundStats.bucksEscaped++;
    if (b.carry) {
      this.roundStats.cropsStolen++;
      this.roundStats.cropsLost++;
      this.stats.cropsLost++;
      b.carry = null;
    }
  }

  /** Dawn after the Last Night: every Buck bonked seals the crater; any other way, the cap cracks. */
  private judgeNight(): void {
    this.lastNight = false;
    if (this.roundStats.bucks >= this.lastNightBucks) {
      this.nightResult = 'sealed';
      this.stats.sealedOn = this.round;
    } else {
      this.nightResult = 'cracked';
      this.project = PROJECT.length - 1;
      this.capDiscount = true;
    }
  }

  private growCrops(dt: number): void {
    const drought = this.event?.kind === 'drought' ? EVENTS.drought : 1;
    for (let i = 0; i < N; i++) {
      const c = this.tiles[i].crop;
      const dry = this.growthMult[i] > 1 ? 1 : drought; // a sprinkler keeps the drought off
      if (c) c.growth += dt * this.growthMult[i] * dry * this.climateGrowth * this.cropGrowth(c.kind);
    }
  }

  /**
   * Ripe fruit on a crop: 0 or 1 for most. A strawberry or tomato fruits once its growth reaches the full
   * grow time, then again every `regrow` seconds of growth, as many times as the day allows.
   */
  ripeFruit(c: Crop): number {
    const def = CROPS[c.kind];
    if (c.growth < def.growTime) return 0;
    if (!def.regrow) return 1;
    const left = (def.harvests ?? 1) - c.harvests;
    return Math.max(1, Math.min(left, 1 + Math.floor((c.growth - def.growTime) / def.regrow + 1e-9)));
  }

  /**
   * How fast a crop grows today on plain ground: season, weather, a drought, Rich Soil and the Seed Lab
   * (1 = spring sun).
   */
  growthToday(kind: CropKind): number {
    return this.climateGrowth * this.cropGrowth(kind) * (this.event?.kind === 'drought' ? EVENTS.drought : 1);
  }

  /** ...and on a particular tile: a sprinkler's water counts, and keeps any drought off. */
  tileGrowth(i: number, kind: CropKind): number {
    const water = this.sprinklerGrowth(i);
    return water > 1 ? water * this.climateGrowth * this.cropGrowth(kind) : this.growthToday(kind);
  }

  /** A sprinkler's boost on a tile (1 if it's dry). Up to date even in the morning, before the day rebuilds it. */
  sprinklerGrowth(i: number): number {
    if (this.costDirty) this.rebuildCosts();
    return this.growthMult[i];
  }

  /** How much faster a crop grows thanks to Rich Soil and the Seed Lab. */
  cropGrowth(kind: CropKind): number {
    return (1 + SOIL_GROWTH * this.farm.soil) * (1 + HYBRID_GROWTH * this.hybrid[kind]);
  }

  private spawn(e: SpawnEntry): void {
    const home = e.burrow < 0 || this.burrows.length === 0
      ? { x: CRATER_SPAWN.x + 0.5, y: CRATER_SPAWN.y + 0.5 }
      : { x: this.burrows[e.burrow].x + 0.5, y: this.burrows[e.burrow].y + 0.5 };
    const n = entrySize(e);
    for (let k = 0; k < n; k++) {
      // a litter tumbles out in a little heap
      const a = (k / n) * Math.PI * 2;
      const r = n > 1 ? 0.28 : 0;
      this.spawnAt(e.kind, home.x + Math.cos(a) * r, home.y + Math.sin(a) * r);
    }
  }

  /** Today's golden bunny: in from one edge, zig-zagging straight across, and out the other side. */
  private spawnGolden(): void {
    const r = makeRng(hashSeed(this.seed, this.round, 778));
    const flip = r() < 0.5;
    let from: [number, number];
    let to: [number, number];
    if (r() < 0.6) {
      from = [flip ? COLS + 0.6 : -0.6, 3 + r() * (ROWS - 6)];
      to = [flip ? -0.8 : COLS + 0.8, 3 + r() * (ROWS - 6)];
    } else {
      from = [3 + r() * (COLS - 6), flip ? ROWS + 0.6 : -0.6];
      to = [3 + r() * (COLS - 6), flip ? -0.8 : ROWS + 0.8];
    }
    const b = this.spawnAt('golden', from[0], from[1]);
    b.state = 'dash';
    b.sx = to[0];
    b.sy = to[1];
    b.timer = 0;
    b.facing = to[0] >= from[0] ? 1 : -1;
    this.emit({ t: 'golden', x: from[0], y: from[1] });
  }

  /** Maybe something's different about today. Its own dice again. */
  private rollEvent(): DayEvent | null {
    if (this.round < EVENTS.from || this.lastNight || this.isBossDay()) return null;
    const r = makeRng(hashSeed(this.seed, this.round, 991));
    if (r() > EVENTS.chance) return null;
    let pick = r() * EVENTS.weights.reduce((sum, [, w]) => sum + w, 0);
    let kind: EventKind = 'fair';
    for (const [k, w] of EVENTS.weights) {
      pick -= w;
      if (pick <= 0) {
        kind = k;
        break;
      }
    }
    if (kind === 'fair') {
      // something you could still plant this morning and sell tonight
      const quick = CROP_ORDER.filter((k) => this.isUnlocked(k) && !CROPS[k].regrow && ripenDays(k, this.growthToday(k)) === 1);
      return quick.length ? { kind, crop: quick[Math.floor(r() * quick.length)] } : null;
    }
    if (kind === 'hail') return { kind, at: 10 + r() * 26 };
    if (kind === 'merchant') return { kind, offers: this.stockCart(r) };
    return { kind };
  }

  /** The merchant's cart: something the store hasn't opened yet, and two cut-price upgrades. */
  private stockCart(r: Rng): Offer[] {
    const out: Offer[] = [];
    const rare = UNLOCKS.find((u) => !this.unlocked.has(u.what) && (u.what in CROPS || u.what in DEFENSES || u.what in WEAPONS));
    if (rare) {
      const u = rare.what;
      const price = u in CROPS ? MERCHANT.rare.crop : u in DEFENSES ? MERCHANT.rare.defense : MERCHANT.rare.weapon;
      out.push({ id: `rare:${u}`, name: unlockName(u), text: `Before the store has it, and it stays in the store after.`, price });
    }
    const deals: Offer[] = [];
    const soil = this.farmPrice('soil');
    if (soil !== null && this.isUnlocked('soil')) {
      deals.push({ id: 'soil', name: 'Rich Soil', text: 'The next level of Rich Soil, half price.', price: Math.round(soil * (1 - MERCHANT.soilOff)) });
    }
    const strains = CROP_ORDER.filter((k) => this.isUnlocked(k) && this.isUnlocked('lab') && hybridCost(k, this.hybrid[k]) !== null);
    if (strains.length) {
      const k = strains[Math.floor(r() * strains.length)];
      deals.push({
        id: `lab:${k}`, name: `${CROPS[k].name} seed stock`, text: `A Seed Lab level for ${cropPlural(k)}, half price.`,
        price: Math.round(hybridCost(k, this.hybrid[k])! * (1 - MERCHANT.labOff)),
      });
    }
    const guns = WEAPON_ORDER.filter((k) => this.weapons[k] > 0 && this.weaponPrice(k) !== null);
    if (guns.length) {
      const k = guns[Math.floor(r() * guns.length)];
      deals.push({
        id: `weapon:${k}`, name: `${WEAPONS[k].name} parts`, text: `The next level of your ${WEAPONS[k].name}, ${Math.round(MERCHANT.weaponOff * 100)}% off.`,
        price: Math.round(this.weaponPrice(k)! * (1 - MERCHANT.weaponOff)),
      });
    }
    for (let n = deals.length - 1; n > 0; n--) {
      const j = Math.floor(r() * (n + 1));
      [deals[n], deals[j]] = [deals[j], deals[n]];
    }
    return [...out, ...deals].slice(0, 3);
  }

  /** Why a deal on the cart can't be had, or null. */
  offerProblem(id: string): string | null {
    if (this.phase !== 'planning') return 'The merchant left at sunrise.';
    const offer = this.event?.kind === 'merchant' ? this.event.offers?.find((o) => o.id === id) : undefined;
    if (!offer) return 'Not on the cart.';
    if (this.eventBought.includes(id)) return 'Sold!';
    const [what, kind] = id.split(':');
    if (what === 'soil' && this.farmPrice('soil') === null) return 'Your soil is as rich as it gets.';
    if (what === 'lab' && hybridCost(kind as CropKind, this.hybrid[kind as CropKind]) === null) return 'The best strain there is.';
    if (what === 'weapon' && this.weaponPrice(kind as WeaponKind) === null) return 'Already as good as it gets.';
    if (what === 'rare' && this.unlocked.has(kind as Unlock)) return 'The store has it now.';
    if (this.credits < offer.price) return 'Not enough credits.';
    return null;
  }

  /** Buy a deal off the merchant's cart. */
  buyOffer(id: string): boolean {
    const problem = this.offerProblem(id);
    if (problem) {
      this.emit({ t: 'error', msg: problem });
      return false;
    }
    const offer = this.event!.offers!.find((o) => o.id === id)!;
    this.credits -= offer.price;
    this.roundStats.spent += offer.price;
    this.eventBought.push(id);
    const [what, kind] = id.split(':');
    if (what === 'rare') {
      this.unlocked.add(kind as Unlock);
      this.newUnlocks.push(kind as Unlock);
    } else if (what === 'soil') this.farm.soil++;
    else if (what === 'lab') this.hybrid[kind as CropKind]++;
    else if (what === 'weapon') this.weapons[kind as WeaponKind]++;
    this.emit({ t: 'buy' });
    return true;
  }

  /** Where the merchant parks: a free spot in the wild country, handy to the farm. Tile index, or -1. */
  merchantTile(): number {
    if (this.event?.kind !== 'merchant' || this.phase !== 'planning') return -1;
    const spots: [number, number][] = [[10, 1], [11, 1], [12, 1], [9, 1], [13, 1], [10, 14], [11, 14], [12, 14], [9, 14], [13, 14]];
    for (const [x, y] of spots) {
      const i = idx(x, y);
      if (!OBSTACLE[i] && !this.burrows.some((b) => b.x === x && b.y === y)) return i;
    }
    return -1;
  }

  /** Hail: crops take a beating (not under a greenhouse), and the bunnies cower where they are for a while. */
  private startHail(): void {
    this.hailFell = true;
    this.hail = EVENTS.hailSeconds;
    let hit = 0;
    if (!this.farm.greenhouse) {
      for (const t of this.tiles) {
        const c = t.crop;
        if (!c) continue;
        const def = CROPS[c.kind];
        c.hp = Math.max(def.hp * 0.25, c.hp - def.hp * EVENTS.hailDamage);
        c.shake = 0.4;
        hit++;
      }
    }
    this.roundStats.hailHit = hit;
    this.emit({ t: 'hail' });
  }

  /** Maybe a customer in town wants something this morning. It has its own dice, like the golden bunny. */
  private postOrder(): void {
    if (this.round < ORDERS.from || this.lastNight) return;
    const r = makeRng(hashSeed(this.seed, this.round, 881));
    if (r() > ORDERS.chance) return;
    const options = CUSTOMERS.map((c) => ({ who: c.who, wants: c.wants.filter((k) => this.isUnlocked(k)) })).filter((c) => c.wants.length);
    if (!options.length) return;
    const c = options[Math.floor(r() * options.length)];
    const kind = c.wants[Math.floor(r() * c.wants.length)];
    const days = ORDERS.minDays + Math.floor(r() * (ORDERS.maxDays - ORDERS.minDays + 1));
    const want = Math.max(ORDERS.min, Math.round((this.ownedTiles().length * ORDERS.share) / ripenDays(kind)));
    const bonus = Math.max(20, Math.round((want * CROPS[kind].sellValue * ORDERS.bonus) / 5) * 5);
    this.order = { who: c.who, kind, want, got: 0, due: this.round + days - 1, bonus };
    this.newOrder = true;
  }

  /** After the harvest: pay for a filled order, or let a late one go. */
  private settleOrder(): void {
    const o = this.order;
    if (!o) return;
    const what = `${o.want} ${cropPlural(o.kind, o.want)}`;
    if (o.got >= o.want) {
      this.credits += o.bonus;
      this.roundStats.orderPaid = o.bonus;
      this.roundStats.orderNote = `${o.who} paid a ${o.bonus}¢ bonus for ${what}!`;
      this.stats.orders = (this.stats.orders ?? 0) + 1;
      this.emit({ t: 'order', x: COLS / 2, y: ROWS / 2, amount: o.bonus });
      this.order = null;
    } else if (this.round >= o.due) {
      this.roundStats.orderNote = `${o.who}'s order ran out: ${o.got} of ${what}.`;
      this.order = null;
    } else {
      const left = o.due - this.round;
      this.roundStats.orderNote = `${o.who}'s order: ${o.got} of ${what} so far, ${left === 1 ? '1 day' : `${left} days`} left.`;
    }
  }

  /** Caught one: cash, a free star on a defense, or a free Seed Lab level. */
  private awardPrize(b: Bunny): void {
    this.stats.golden = (this.stats.golden ?? 0) + 1;
    const r = makeRng(hashSeed(this.seed, this.round, 779));
    const roll = r();
    let text = '';
    let short = '';
    if (roll < 0.25) {
      const open = this.tiles.map((t, i) => [t.structure, i] as const)
        .filter(([s]) => s && s.level < MAX_LEVEL && this.isUnlocked(`upgrade${s.level + 1}` as Unlock));
      if (open.length) {
        const [s, i] = open[Math.floor(r() * open.length)];
        const before = defenseStats(s!.kind, s!.level).hp;
        s!.level++;
        s!.hp += defenseStats(s!.kind, s!.level).hp - before;
        this.costDirty = true;
        this.emit({ t: 'upgrade', x: tileX(i) + 0.5, y: tileY(i) + 0.5, level: s!.level });
        text = `A free star for your ${DEFENSES[s!.kind].name}: now level ${s!.level}!`;
        short = 'FREE UPGRADE!';
      }
    } else if (roll < 0.5 && this.isUnlocked('lab')) {
      const open = CROP_ORDER.filter((k) => this.isUnlocked(k) && this.hybrid[k] < HYBRID_LEVELS);
      if (open.length) {
        const k = open[Math.floor(r() * open.length)];
        this.hybrid[k]++;
        text = `The Seed Lab bred a better ${CROPS[k].name.toLowerCase()}: level ${this.hybrid[k]}, free!`;
        short = 'SEED LAB +1!';
      }
    }
    if (!text) {
      const cash = GOLDEN.cash + GOLDEN.cashPerDay * this.round;
      this.credits += cash;
      this.roundStats.prizeCash += cash;
      text = `A pouch of coins: +${cash}¢!`;
      short = `+${cash}¢`;
    }
    this.roundStats.prize = text;
    this.emit({ t: 'prize', x: b.x, y: b.y, text, short });
  }

  /** Put a bunny on the field at (x, y), tile units. */
  spawnAt(kind: BunnyKind, x: number, y: number): Bunny {
    const def = BUNNIES[kind];
    const m = MODES[this.mode];
    let hp = Math.round(def.hp * bunnyHpScale(this.round) * (def.boss ? 1 : m.hp));
    if (def.boss) {
      hp += BOSS_HP_PER_APPEARANCE * Math.max(0, Math.floor(this.round / BOSS_EVERY) - 1);
      hp = Math.round(hp * (1 + ANGER.bossHp * m.anger * this.project) * m.bossHp);
    }
    const b: Bunny = {
      id: this.nextId++, kind, x, y, hp, maxHp: hp,
      state: 'seek', resume: 'seek', path: [], pathIdx: 0, epoch: -1, target: -1, chewTile: -1,
      eaten: 0, fed: false, repath: 0, timer: 0, sx: 0, sy: 0, ex: 0, ey: 0, kx: 0, ky: 0,
      wet: 0, flash: 0, facing: x < COLS / 2 ? 1 : -1, moving: false, hop: this.rng(), tick: 0,
      ox: (this.rng() - 0.5) * 0.35, oy: (this.rng() - 0.5) * 0.25, brood: 0, broodCount: 0,
      popped: 0, peek: 1 + this.rng() * 2, armor: def.armor ?? 0, carry: null, dead: false, gone: false,
    };
    this.bunnies.push(b);
    this.emit({ t: 'spawn', x, y, kind });
    return b;
  }

  // ------------------------------------------------------------ harvest

  private beginHarvest(): void {
    this.phase = 'harvest';
    this.phaseTime = 0;
    this.harvestQueue = [];
    const sold: Partial<Record<CropKind, number>> = {};
    for (let i = 0; i < N; i++) {
      const c = this.tiles[i].crop;
      if (!c) continue;
      const def = CROPS[c.kind];
      // a fast-growing strawberry or tomato can have more than one fruit ready
      for (let f = this.ripeFruit(c); f > 0; f--) {
        const n = sold[c.kind] ?? 0;
        const value = Math.max(1, Math.round(this.cropPrice(c.kind, n) * (c.hp / def.hp)));
        this.harvestQueue.push({ i, value, kind: c.kind });
        sold[c.kind] = n + 1;
      }
    }
    const fair = this.event?.kind === 'fair' ? this.event.crop : undefined;
    if (fair) this.roundStats.fairSold = Math.min(EVENTS.fairCap, sold[fair] ?? 0);
    // an open order counts whatever of its crop went to market tonight
    if (this.order) this.order.got = Math.min(this.order.want, this.order.got + (sold[this.order.kind] ?? 0));
    // what tonight's prices came to, and how much the market will remember tomorrow
    for (const k of CROP_ORDER) {
      const n = sold[k] ?? 0;
      if (n > 0) {
        let sum = 0;
        for (let j = 0; j < n; j++) sum += this.cropPrice(k, j);
        this.roundStats.market[k] = sum / n / CROPS[k].sellValue;
      }
      this.glut[k] = Math.round((this.glut[k] + n) * MARKET.memory * 10) / 10;
      // whatever you haven't brought to town in a while, town starts to miss
      this.wanted[k] = n > 0 ? 0 : this.isUnlocked(k) ? this.wanted[k] + 1 : 0;
    }
    this.harvestTimer = 0.6;
    // a big farm counts its coins faster, so the evening never drags
    this.harvestStep = Math.min(0.1, HARVEST_SECONDS / Math.max(1, this.harvestQueue.length));
  }

  /** How much more a crop fetches because nobody's brought any to town lately (0 to MARKET.wantedMax). */
  demand(kind: CropKind): number {
    return Math.min(MARKET.wantedMax, MARKET.wanted * this.wanted[kind]);
  }

  /** Tonight's price as a share of normal: the market's mood, and how much town has missed it. */
  priceTrend(kind: CropKind): number {
    return this.market[kind] * (1 + this.demand(kind));
  }

  /** What a crop sells for tonight, whole and ripe, after `sold` of the same kind already went to market. */
  cropPrice(kind: CropKind, sold = 0): number {
    const over = Math.max(0, this.glut[kind] + sold - MARKET.glut);
    const sag = Math.max(MARKET.glutFloor, 1 - MARKET.glutDrop * over);
    const bonus = (1 + STALL_PRICE * this.farm.stall) * (1 + HYBRID_VALUE * this.hybrid[kind]) *
      (this.event?.kind === 'fair' && this.event.crop === kind && sold < EVENTS.fairCap ? EVENTS.fairMult : 1);
    return CROPS[kind].sellValue * SEASONS[this.season].sell * this.priceTrend(kind) * sag * bonus;
  }

  /** Overnight, prices wander, pulled back toward normal. */
  moveMarket(): void {
    const rng = makeRng(hashSeed(this.seed, this.round, 7331));
    for (const k of CROP_ORDER) {
      const t = this.market[k];
      const next = t + (rng() * 2 - 1) * MARKET.drift + (1 - t) * MARKET.pull;
      this.market[k] = Math.round(Math.max(MARKET.min, Math.min(MARKET.max, next)) * 100) / 100;
    }
  }

  private stepHarvest(dt: number): void {
    this.harvestTimer -= dt;
    while (this.harvestTimer <= 0) {
      const h = this.harvestQueue.shift();
      if (!h) {
        this.settleOrder();
        this.phase = 'summary';
        this.phaseTime = 0;
        return;
      }
      const picked = this.tiles[h.i].crop;
      const def = CROPS[h.kind];
      if (picked && def.regrow && picked.harvests + 1 < (def.harvests ?? 1)) {
        // perennials fruit again: back to growing, patched up
        picked.harvests++;
        picked.growth = def.growTime - def.regrow;
        picked.hp = def.hp;
      } else {
        this.tiles[h.i].crop = null;
      }
      this.credits += h.value;
      this.stats.harvest += h.value;
      const rs = this.roundStats;
      rs.harvestTotal += h.value;
      const entry = (rs.harvested[h.kind] ??= { count: 0, value: 0 });
      entry.count++;
      entry.value += h.value;
      this.emit({ t: 'coin', x: tileX(h.i) + 0.5, y: tileY(h.i) + 0.5, amount: h.value });
      this.harvestTimer += this.harvestQueue.length > 0 ? this.harvestStep : 1.1;
    }
  }

  /** Skip the coin animation. */
  finishHarvestNow(): void {
    if (this.phase !== 'harvest') return;
    while (this.phase === 'harvest') this.stepHarvest(10);
  }

  // ------------------------------------------------------------ planning actions

  /** The rectangle around every lot you own. */
  get plot(): Rect {
    const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    this.lots.forEach((own, n) => {
      if (!own) return;
      const l = lotRect(n);
      r.x0 = Math.min(r.x0, l.x0);
      r.y0 = Math.min(r.y0, l.y0);
      r.x1 = Math.max(r.x1, l.x1);
      r.y1 = Math.max(r.y1, l.y1);
    });
    return r;
  }

  owns(i: number): boolean {
    const lot = lotOfTile(i);
    return lot >= 0 && this.lots[lot];
  }

  /** Every tile you own, tilled or not. */
  ownedTiles(): number[] {
    return this.lots.flatMap((own, n) => (own ? lotTiles(n) : []));
  }

  itemCost(item: ShopItem): number {
    if (item.type === 'crop') return CROPS[item.kind].seedCost;
    if (item.type === 'defense') return DEFENSES[item.kind].cost;
    if (item.type === 'till') return TILL_COST;
    if (item.type === 'land') return lotPrice(this.lotsBought);
    if (item.type === 'smoke') return SMOKE_BOMB;
    return 0;
  }

  /** Buy a lot of land. It comes as grass: till it to plant, or build on it as it is. */
  buyLot(n: number): boolean {
    if (this.phase !== 'planning' || n < 0 || n >= LOT_COUNT || this.lots[n] || this.lockReason('land')) return false;
    const price = lotPrice(this.lotsBought);
    if (this.credits < price) return false;
    this.credits -= price;
    this.roundStats.spent += price;
    this.lots[n] = true;
    this.lotsBought++;
    const r = lotRect(n);
    this.emit({ t: 'buyLand', x: (r.x0 + r.x1 + 1) / 2, y: (r.y0 + r.y1 + 1) / 2 });
    this.emit({ t: 'buy' });
    return true;
  }

  /** Why a smoke bomb can't go into the crater this morning, or null if it can. */
  smokeProblem(): string | null {
    if (this.phase !== 'planning') return 'Wait for the morning.';
    if (this.sealed) return 'The crater is sealed for good.';
    const lock = this.lockReason('smoke');
    if (lock) return lock;
    if (this.lastNight) return 'The Last Night has Bucks enough.';
    if (this.smoked) return 'The crater is already smoking.';
    if (this.isBossDay()) return 'A Buck is coming today anyway.';
    if (this.credits < SMOKE_BOMB) return 'Not enough credits.';
    return null;
  }

  /** Smoke an Asteroid Buck out of the crater: it climbs out today, whatever the calendar says. */
  throwSmoke(): boolean {
    if (this.smokeProblem()) return false;
    this.credits -= SMOKE_BOMB;
    this.roundStats.spent += SMOKE_BOMB;
    this.smoked = true;
    // the same Buck buildWave() adds on a boss day, so a reload rebuilds the same wave
    this.wave.push({ at: ROUND_SECONDS * SPAWN_WINDOW * 0.45, kind: 'mutant', burrow: -1 });
    this.wave.sort((a, b) => a.at - b.at);
    this.emit({ t: 'smoke', x: CRATER.x + 1, y: CRATER.y + 1 });
    this.emit({ t: 'buy' });
    return true;
  }

  /** The crater is smoking and its Buck hasn't come out yet. */
  get smoking(): boolean {
    if (!this.smoked) return false;
    if (this.phase === 'planning') return true;
    return this.phase === 'round' && this.wave.slice(this.spawnIdx).some((w) => w.kind === 'mutant');
  }

  /** Turn a patch of your grass into a seedbed. */
  till(i: number): boolean {
    if (this.placeProblem({ type: 'till' }, i)) return false;
    this.credits -= TILL_COST;
    this.roundStats.spent += TILL_COST;
    this.tilled[i] = 1;
    this.tillEpoch++;
    this.emit({ t: 'till', x: tileX(i) + 0.5, y: tileY(i) + 0.5 });
    return true;
  }

  /** Bunnies in today's wave, counting every kit in a litter. */
  waveTotal(): number {
    return this.wave.reduce((n, e) => n + entrySize(e), 0);
  }

  /** Why an item can't be used at all right now (locked), or null. */
  itemLock(item: ShopItem): string | null {
    if (item.type === 'crop' || item.type === 'defense') return this.lockReason(item.kind);
    if (item.type === 'upgrade') return this.lockReason('upgrade2');
    if (item.type === 'land') return this.lockReason('land');
    if (item.type === 'smoke') return this.lockReason('smoke');
    return null;
  }

  /** Why an item can't go on a tile, or null if it can. */
  placeProblem(item: ShopItem, i: number): string | null {
    if (this.phase !== 'planning') return 'Wait for the planning phase.';
    const lock = this.itemLock(item);
    if (lock) return lock;
    if (i < 0 || i >= N) return "That's off the map.";
    if (item.type === 'smoke') return inCrater(i) ? this.smokeProblem() : 'Throw it into the crater.';
    if (item.type === 'land') {
      const lot = lotOfTile(i);
      if (lot < 0) return "That's wild country. Nobody's selling it.";
      if (this.lots[lot]) return 'You already own this lot.';
      if (this.credits < lotPrice(this.lotsBought)) return 'Not enough credits.';
      return null;
    }
    if (!this.owns(i)) return "That's not your land.";
    const t = this.tiles[i];
    if (item.type === 'remove') return t.crop || t.structure ? null : 'Nothing there.';
    if (item.type === 'till') {
      if (this.tilled[i]) return 'Already tilled.';
      if (t.crop || t.structure) return 'Clear it first.';
      if (this.credits < TILL_COST) return 'Not enough credits.';
      return null;
    }
    if (item.type === 'upgrade') {
      if (!t.structure) return 'Pick a defense to upgrade.';
      if (t.structure.level >= MAX_LEVEL) return 'Already as good as it gets.';
      const next = this.lockReason(`upgrade${t.structure.level + 1}` as Unlock);
      if (next) return next;
      if (this.credits < upgradeCost(t.structure.kind, t.structure.level)) return 'Not enough credits.';
      return null;
    }
    if (t.crop || t.structure) return 'That spot is taken.';
    if (item.type === 'crop' && !this.tilled[i]) return 'Till the ground first (the hoe, H).';
    if (this.credits < this.itemCost(item)) return 'Not enough credits.';
    return null;
  }

  // ------------------------------------------------------------ unlocks

  /** How far along the run is toward a kind of goal. */
  progress(goal: Goal): number {
    switch (goal) {
      case 'day': return this.round;
      case 'bonks': return this.stats.kills;
      case 'harvest': return this.stats.harvest;
      case 'bucks': return this.stats.bossesBeaten;
    }
  }

  isUnlocked(what: Unlock): boolean {
    return !UNLOCK_RULE[what] || this.unlocked.has(what);
  }

  /** "Scarecrow unlocks on Day 3." or null if it's open. */
  lockReason(what: Unlock): string | null {
    const rule = UNLOCK_RULE[what];
    if (!rule || this.unlocked.has(what)) return null;
    const have = this.progress(rule.goal);
    const sofar = rule.goal === 'day' ? '' : ` (${have.toLocaleString('en-US')} so far)`;
    const when = rule.goal === 'day' ? `on Day ${rule.n}` : rule.goal === 'bucks'
      ? `after ${rule.n === 1 ? 'an Asteroid Buck' : `${rule.n} Bucks`}`
      : `at ${goalText(rule.goal, rule.n)}`;
    const plural = what.startsWith('upgrade') || what === 'smoke'; // "★★ upgrades unlock", "Smoke Bombs unlock"
    return `${unlockName(what)} ${plural ? 'unlock' : 'unlocks'} ${when}${sofar}.`;
  }

  /** Open up whatever the run has earned. Returns what's new. */
  private refreshUnlocks(): Unlock[] {
    const fresh: Unlock[] = [];
    for (const r of UNLOCKS) {
      if (!this.unlocked.has(r.what) && this.progress(r.goal) >= r.n) {
        this.unlocked.add(r.what);
        fresh.push(r.what);
      }
    }
    return fresh;
  }

  /** What will open up tomorrow morning, counting today's results. */
  pendingUnlocks(): Unlock[] {
    return UNLOCKS.filter((r) => !this.unlocked.has(r.what) && (r.goal === 'day' ? this.round + 1 : this.progress(r.goal)) >= r.n)
      .map((r) => r.what);
  }

  // ------------------------------------------------------------ the Crater Project

  projectCost(): number | null {
    const stage = PROJECT[this.project];
    if (!stage) return null;
    return this.project === PROJECT.length - 1 && this.capDiscount ? Math.round(stage.cost * CAP_RETRY) : stage.cost;
  }

  /** Why the next stage can't be paid for right now, or null. */
  projectProblem(): string | null {
    const stage = PROJECT[this.project];
    if (!stage || this.lastNight) return 'The cap is going on tonight.';
    if (this.phase !== 'planning') return 'Wait for morning.';
    if (this.stats.bossesBeaten < stage.bucks) {
      return `First, beat ${stage.bucks === 1 ? 'an Asteroid Buck' : `${stage.bucks} Asteroid Bucks`} (${this.stats.bossesBeaten} so far).`;
    }
    if (this.credits < (this.projectCost() ?? 0)) return 'Not enough credits.';
    return null;
  }

  /** Pay for the next stage. The last one makes today The Last Night. */
  fundProject(): boolean {
    const problem = this.projectProblem();
    if (problem) {
      this.emit({ t: 'error', msg: problem });
      return false;
    }
    const cost = this.projectCost()!;
    this.credits -= cost;
    this.roundStats.spent += cost;
    this.project++;
    if (this.project === PROJECT.length) {
      this.lastNight = true;
      this.wave = this.buildWave();
      this.spawnIdx = 0;
    }
    this.emit({ t: 'project', stage: this.project });
    this.emit({ t: 'buy' });
    return true;
  }

  place(item: ShopItem, i: number): boolean {
    const problem = this.placeProblem(item, i);
    if (problem) {
      this.emit({ t: 'error', msg: problem });
      return false;
    }
    if (item.type === 'remove') return this.removeAt(i);
    if (item.type === 'upgrade') return this.upgradeAt(i);
    if (item.type === 'land') return this.buyLot(lotOfTile(i));
    if (item.type === 'till') return this.till(i);
    if (item.type === 'smoke') return this.throwSmoke();
    const cost = this.itemCost(item);
    this.credits -= cost;
    this.roundStats.spent += cost;
    const t = this.tiles[i];
    if (item.type === 'crop') {
      t.crop = { kind: item.kind, growth: 0, hp: CROPS[item.kind].hp, harvests: 0, fresh: true, shake: 0 };
    } else {
      t.structure = { kind: item.kind, level: 1, hp: DEFENSES[item.kind].hp, fresh: true, cd: 0, anim: 99, shake: 0 };
      this.costDirty = true;
    }
    this.emit({ t: 'place', x: tileX(i) + 0.5, y: tileY(i) + 0.5 });
    return true;
  }

  /** Upgrade the defense on a tile one level. */
  upgradeAt(i: number): boolean {
    const s = this.tiles[i].structure;
    if (this.phase !== 'planning' || !s || s.level >= MAX_LEVEL) return false;
    if (!this.isUnlocked(`upgrade${s.level + 1}` as Unlock)) return false;
    const cost = upgradeCost(s.kind, s.level);
    if (this.credits < cost) return false;
    const before = defenseStats(s.kind, s.level).hp;
    this.credits -= cost;
    this.roundStats.spent += cost;
    s.level++;
    s.hp += defenseStats(s.kind, s.level).hp - before; // the extra sturdiness comes new
    this.costDirty = true;
    this.emit({ t: 'upgrade', x: tileX(i) + 0.5, y: tileY(i) + 0.5, level: s.level });
    this.emit({ t: 'buy' });
    return true;
  }

  /** Refund for removing whatever is on a tile right now. */
  removeValue(i: number): number {
    const t = this.tiles[i];
    if (t.structure) {
      const s = t.structure;
      const invested = investedIn(s.kind, s.level);
      if (s.fresh) return invested;
      return Math.floor(invested * SELL_BACK * (s.hp / defenseStats(s.kind, s.level).hp));
    }
    if (t.crop) return t.crop.fresh ? CROPS[t.crop.kind].seedCost : 0;
    return 0;
  }

  removeAt(i: number): boolean {
    if (this.phase !== 'planning' || !this.owns(i)) return false;
    const t = this.tiles[i];
    if (!t.structure && !t.crop) return false;
    const refund = this.removeValue(i);
    this.credits += refund;
    this.roundStats.spent -= refund;
    if (t.structure) {
      t.structure = null;
      this.costDirty = true;
    } else {
      t.crop = null;
    }
    this.emit({ t: 'remove', x: tileX(i) + 0.5, y: tileY(i) + 0.5 });
    return true;
  }

  totalSellValue(): number {
    let v = 0;
    for (let i = 0; i < N; i++) if (this.tiles[i].structure) v += this.removeValue(i);
    return v;
  }

  repairCost(): number {
    let c = 0;
    for (const t of this.tiles) {
      const s = t.structure;
      if (!s) continue;
      const max = defenseStats(s.kind, s.level).hp;
      if (s.hp < max) c += Math.ceil(investedIn(s.kind, s.level) * REPAIR_RATE * (1 - s.hp / max));
    }
    return c;
  }

  /** Defenses that have been chewed on but are still standing. */
  chewedCount(): number {
    return this.tiles.filter((t) => t.structure && t.structure.hp < defenseStats(t.structure.kind, t.structure.level).hp).length;
  }

  repairAll(): boolean {
    const cost = this.repairCost();
    if (this.phase !== 'planning' || cost === 0 || this.credits < cost) return false;
    this.credits -= cost;
    this.roundStats.spent += cost;
    for (const t of this.tiles) if (t.structure) t.structure.hp = defenseStats(t.structure.kind, t.structure.level).hp;
    this.costDirty = true;
    this.emit({ t: 'buy' });
    return true;
  }

  // ------------------------------------------------------------ the weapon shop, farm upgrades, the Seed Lab

  /** Price to buy a weapon, or to take it up a level; null once it's maxed. */
  weaponPrice(kind: WeaponKind): number | null {
    const level = this.weapons[kind];
    if (level >= WEAPON_LEVELS) return null;
    return level === 0 ? WEAPONS[kind].cost : WEAPONS[kind].upgrades[level - 1];
  }

  weaponProblem(kind: WeaponKind): string | null {
    if (this.phase !== 'planning') return 'The shop opens in the morning.';
    const lock = kind === 'sling' ? null : this.lockReason(kind);
    if (lock) return lock;
    const price = this.weaponPrice(kind);
    if (price === null) return 'Already as good as it gets.';
    if (this.credits < price) return 'Not enough credits.';
    return null;
  }

  /** Buy a weapon, or upgrade one you have. A new weapon goes straight into your hands. */
  buyWeapon(kind: WeaponKind): boolean {
    const problem = this.weaponProblem(kind);
    if (problem) {
      this.emit({ t: 'error', msg: problem });
      return false;
    }
    const price = this.weaponPrice(kind)!;
    this.credits -= price;
    this.roundStats.spent += price;
    if (this.weapons[kind] === 0) this.weapon = kind;
    this.weapons[kind]++;
    this.emit({ t: 'buy' });
    return true;
  }

  /** Swap to another weapon you own. */
  selectWeapon(kind: WeaponKind): boolean {
    if (this.weapons[kind] <= 0 || this.weapon === kind) return false;
    this.weapon = kind;
    this.hoseAim = null;
    this.emit({ t: 'weapon', weapon: kind });
    return true;
  }

  /** 1 right after a shot, 0 when the weapon in hand is ready. */
  reloadFrac(): number {
    const reload = weaponStats(this.weapon, this.weapons[this.weapon]).reload;
    return reload > 0 ? Math.min(1, this.weaponCd[this.weapon] / reload) : 0;
  }

  farmPrice(u: FarmUpgrade): number | null {
    return FARM[u].costs[this.farm[u]] ?? null;
  }

  farmProblem(u: FarmUpgrade): string | null {
    if (this.phase !== 'planning') return 'Wait for morning.';
    const lock = this.lockReason(u);
    if (lock) return lock;
    const price = this.farmPrice(u);
    if (price === null) return 'Already done.';
    if (this.credits < price) return 'Not enough credits.';
    return null;
  }

  buyFarm(u: FarmUpgrade): boolean {
    const problem = this.farmProblem(u);
    if (problem) {
      this.emit({ t: 'error', msg: problem });
      return false;
    }
    const price = this.farmPrice(u)!;
    this.credits -= price;
    this.roundStats.spent += price;
    this.farm[u]++;
    this.costDirty = true; // the well changes the sprinklers
    this.emit({ t: 'buy' });
    return true;
  }

  hybridProblem(kind: CropKind): string | null {
    if (this.phase !== 'planning') return 'Wait for morning.';
    const lock = this.lockReason('lab') ?? this.lockReason(kind);
    if (lock) return lock;
    const price = hybridCost(kind, this.hybrid[kind]);
    if (price === null) return 'The best strain there is.';
    if (this.credits < price) return 'Not enough credits.';
    return null;
  }

  /** Seed Lab: breed a better strain of a crop. Every plant of that kind, now and later, benefits. */
  breed(kind: CropKind): boolean {
    const problem = this.hybridProblem(kind);
    if (problem) {
      this.emit({ t: 'error', msg: problem });
      return false;
    }
    const price = hybridCost(kind, this.hybrid[kind])!;
    this.credits -= price;
    this.roundStats.spent += price;
    this.hybrid[kind]++;
    this.emit({ t: 'buy' });
    return true;
  }

  // ------------------------------------------------------------ your weapons

  private get live(): boolean {
    return this.phase === 'round' || this.phase === 'sundown';
  }

  /**
   * Fire the weapon in hand at a point (tile units). Hold weapons are fired every frame while the button is
   * down; the reload decides how often that actually shoots. Returns false while reloading.
   */
  fire(x: number, y: number): boolean {
    if (!this.live) return false;
    const kind = this.weapon;
    const level = this.weapons[kind];
    if (level <= 0) return false;
    if (kind === 'hose') {
      this.hoseAim = { x, y };
      return true;
    }
    if (this.weaponCd[kind] > 0) return false;
    const w = WEAPONS[kind];
    const st = weaponStats(kind, level);
    this.weaponCd[kind] = st.reload;
    if (w.splash) {
      this.shells.push({ weapon: kind, level, x, y, t: w.flight, flight: w.flight });
      this.emit({ t: 'fire', weapon: kind, x, y, hit: false });
      return true;
    }
    let tx = x;
    let ty = y;
    if (st.spread) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * st.spread;
      tx += Math.cos(a) * r;
      ty += Math.sin(a) * r;
    }
    const best = this.bunnyAt(tx, ty);
    this.emit({ t: 'fire', weapon: kind, x: tx, y: ty, hit: !!best });
    if (best) {
      if (!this.dodges(best)) this.damageBunny(best, st.damage, 'pebble');
    } else {
      this.knockOnMound(tx, ty);
    }
    return true;
  }

  /** Let go of the hose. */
  stopHose(): void {
    this.hoseAim = null;
  }

  /** The surfaced bunny whose body is under a point, if any. */
  bunnyAt(x: number, y: number): Bunny | null {
    let best: Bunny | null = null;
    let bestD = Infinity;
    for (const b of this.bunnies) {
      if (b.dead || !this.isSurfaced(b)) continue;
      const def = BUNNIES[b.kind];
      const d = Math.hypot(b.x - x, b.y - def.aim - y);
      if (d <= def.size / 16 + 0.1 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  /** A shot that lands on a Burrower's dirt mound startles it up out of the ground. */
  private knockOnMound(x: number, y: number): void {
    let best: Bunny | null = null;
    let bestD = 0.6;
    for (const b of this.bunnies) {
      if (b.dead || this.isSurfaced(b)) continue;
      const d = Math.hypot(b.x - x, b.y - 0.15 - y);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (best) this.pop(best, POP_SECONDS);
  }

  /** Make a Burrower come up and stay up for a moment. */
  pop(b: Bunny, seconds: number): void {
    if (!BUNNIES[b.kind].digger) return;
    const wasDown = !this.isSurfaced(b);
    b.popped = Math.max(b.popped, seconds);
    if (wasDown) this.emit({ t: 'thunk', x: b.x, y: b.y });
  }

  /** Potatoes and fireworks come down and go off. */
  private stepShells(dt: number): void {
    if (this.shells.length === 0) return;
    for (const sh of this.shells) {
      sh.t -= dt;
      if (sh.t > 0) continue;
      const st = weaponStats(sh.weapon, sh.level);
      this.blast(sh.weapon, sh.x, sh.y, st.radius, st.damage);
      if (sh.weapon === 'rocket' && sh.level >= WEAPON_LEVELS) {
        // the top-level firework breaks into three smaller bursts
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.5;
          this.blast(sh.weapon, sh.x + Math.cos(a) * 1.3, sh.y + Math.sin(a) * 0.9, 0.7, Math.ceil(st.damage / 3));
        }
      }
    }
    this.shells = this.shells.filter((sh) => sh.t > 0);
  }

  /** Splash damage: everything in the radius, helmets or not, and anything underground gets shaken up. */
  private blast(weapon: WeaponKind, x: number, y: number, r: number, damage: number): void {
    this.emit({ t: 'blast', weapon, x, y, r });
    for (const b of this.bunnies) {
      if (b.dead || b.gone) continue;
      const up = this.isSurfaced(b);
      const d = Math.hypot(b.x - x, (up ? b.y - BUNNIES[b.kind].aim : b.y) - y);
      if (d > r + BUNNIES[b.kind].size / 32) continue;
      if (!up) this.pop(b, POP_SECONDS);
      this.damageBunny(b, damage, 'splash');
      if (!b.dead && !BUNNIES[b.kind].boss) knockBack(b, x, y, 3);
    }
  }

  /** The hose: shove, soak, and (with pressure) hurt whatever's in the spray, and flood Burrowers up. */
  private spray(x: number, y: number, dt: number): void {
    const st = weaponStats('hose', this.weapons.hose);
    for (const b of this.bunnies) {
      if (b.dead || b.gone) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy);
      if (d > st.radius) continue;
      if (!this.isSurfaced(b)) {
        this.pop(b, 1);
        continue;
      }
      b.wet = Math.max(b.wet, 2);
      if (!BUNNIES[b.kind].boss) {
        const n = d || 1;
        b.kx = (dx / n) * HOSE_PUSH;
        b.ky = (dy / n) * HOSE_PUSH;
        if (b.state === 'eat' || b.state === 'chew') {
          b.state = 'seek';
          b.repath = 0.3;
        }
      }
      if (st.damage > 0) this.damageBunny(b, st.damage * dt, 'hose');
    }
  }

  /** Ninjas sometimes step out of the way of a pebble. */
  dodges(b: Bunny): boolean {
    if (!this.isSurfaced(b)) return false;
    const chance = BUNNIES[b.kind].dodge ?? 0;
    if (chance <= 0 || this.rng() >= chance) return false;
    this.emit({ t: 'dodge', x: b.x, y: b.y });
    sidestep(this, b);
    return true;
  }

  // ------------------------------------------------------------ shared sim helpers

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  isSurfaced(b: Bunny): boolean {
    if (!BUNNIES[b.kind].digger) return true;
    return b.state === 'eat' || b.state === 'spooked' || b.popped > 0;
  }

  damageBunny(b: Bunny, dmg: number, source: DamageSource = 'pebble'): void {
    if (b.dead || b.gone) return;
    // a golden bunny is yours to catch: traps, dogs, bees and sparks can't
    if (BUNNIES[b.kind].golden && source !== 'pebble' && source !== 'splash' && source !== 'hose') return;
    if (source === 'pebble' && b.armor > 0) {
      // clang: the pot takes it
      b.armor--;
      b.flash = 0.06;
      this.emit({ t: 'clang', x: b.x, y: b.y });
      if (b.armor === 0) this.emit({ t: 'potOff', x: b.x, y: b.y });
      return;
    }
    b.hp -= dmg;
    const steady = source === 'hose' || source === 'shock'; // a steady trickle, not a smack
    if (!steady || b.flash <= 0) b.flash = 0.12;
    if (b.hp > 0) {
      if (!steady) this.emit({ t: 'hit', x: b.x, y: b.y });
      return;
    }
    b.dead = true;
    if (b.carry) {
      // the Bandit drops what it stole; if the spot's still free, it goes right back in the ground
      const t = this.tiles[b.carry.from];
      if (!t.crop && !t.structure) t.crop = b.carry.crop;
      else {
        this.roundStats.cropsLost++;
        this.stats.cropsLost++;
      }
      this.emit({ t: 'drop', x: tileX(b.carry.from) + 0.5, y: tileY(b.carry.from) + 0.5 });
      b.carry = null;
    }
    this.stats.kills++;
    this.roundStats.kills++;
    this.emit({ t: 'poof', x: b.x, y: b.y, kind: b.kind });
    if (BUNNIES[b.kind].golden) this.awardPrize(b);
    if (BUNNIES[b.kind].boss) {
      this.credits += BOSS_BOUNTY;
      this.roundStats.bounty += BOSS_BOUNTY;
      this.roundStats.bucks++;
      this.stats.bossesBeaten++;
      this.emit({ t: 'coin', x: b.x, y: b.y - 1, amount: BOSS_BOUNTY });
    }
  }

  destroyCrop(i: number): void {
    const c = this.tiles[i].crop;
    if (!c) return;
    this.tiles[i].crop = null;
    this.roundStats.cropsLost++;
    this.stats.cropsLost++;
    this.emit({ t: 'cropLost', x: tileX(i) + 0.5, y: tileY(i) + 0.5, kind: c.kind });
  }

  destroyStructure(i: number): void {
    const s = this.tiles[i].structure;
    if (!s) return;
    this.tiles[i].structure = null;
    this.roundStats.structuresBroken++;
    if (s.kind === 'doghouse') this.dogs = this.dogs.filter((d) => d.home !== i);
    this.emit({ t: 'broken', x: tileX(i) + 0.5, y: tileY(i) + 0.5, kind: s.kind });
    this.costDirty = true;
  }

  /** Rebuild movement costs and sprinkler growth. Bumps pathEpoch so bunnies replan. */
  rebuildCosts(): void {
    const structural = this.costDirty;
    this.costDirty = false;
    this.costTimer = 1;
    this.growthMult.fill(1);
    for (let i = 0; i < N; i++) {
      if (OBSTACLE[i]) {
        this.costWalk[i] = Infinity;
        this.costDig[i] = Infinity;
        this.solidWalk[i] = 1;
        this.solidDig[i] = 1;
        continue;
      }
      this.costDig[i] = 1;
      this.solidDig[i] = 0;
      const s = this.tiles[i].structure;
      if (s && DEFENSES[s.kind].blocks) {
        // chewing through is possible but slow; price it in "tiles of walking"
        this.costWalk[i] = 2 + Math.max(0, s.hp) * 0.8;
        this.solidWalk[i] = 1;
      } else {
        this.costWalk[i] = 1;
        this.solidWalk[i] = 0;
      }
    }
    for (let i = 0; i < N; i++) {
      const s = this.tiles[i].structure;
      if (!s || (s.kind !== 'scarecrow' && s.kind !== 'sprinkler')) continue;
      const def = defenseStats(s.kind, s.level);
      const cx = tileX(i);
      const cy = tileY(i);
      const r = Math.ceil(def.radius);
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (!inMap(x, y)) continue;
          if (Math.hypot(x - cx, y - cy) > def.radius) continue;
          const j = idx(x, y);
          if (s.kind === 'scarecrow') {
            if (!this.solidWalk[j]) this.costWalk[j] += 2.5;
          } else {
            this.growthMult[j] = this.farm.well ? WELL_GROWTH : SPRINKLER_GROWTH;
          }
        }
      }
    }
    if (structural) this.pathEpoch++;
  }

  // ------------------------------------------------------------ save / load

  toSave(): SaveData {
    const tiles: SaveData['tiles'] = [];
    this.tiles.forEach((t, i) => {
      if (!t.crop && !t.structure) return;
      tiles.push({
        i,
        crop: t.crop ? { kind: t.crop.kind, growth: t.crop.growth, hp: t.crop.hp, harvests: t.crop.harvests } : undefined,
        structure: t.structure ? { kind: t.structure.kind, hp: t.structure.hp, level: t.structure.level } : undefined,
      });
    });
    return {
      v: SAVE_VERSION, seed: this.seed, round: this.round, credits: this.credits, mode: this.mode, map: this.map, runId: this.runId,
      breedBonus: this.breedBonus, stats: { ...this.stats }, tiles,
      lots: this.lots.flatMap((own, n) => (own ? [n] : [])), lotsBought: this.lotsBought,
      tilled: [...this.tilled.keys()].filter((i) => this.tilled[i]),
      project: this.project, capDiscount: this.capDiscount, lastNight: this.lastNight, smoked: this.smoked, order: this.order,
      event: this.event, eventBought: [...this.eventBought],
      market: { ...this.market }, glut: { ...this.glut }, wanted: { ...this.wanted },
      weapons: { ...this.weapons }, weapon: this.weapon, farm: { ...this.farm }, hybrid: { ...this.hybrid },
    };
  }

  loadSave(d: SaveData): void {
    this.map = d.map === 'river' || d.map === 'orchard' ? d.map : 'home';
    setMap(this.map);
    this.runId = d.runId ?? `old${d.seed >>> 0}`;
    this.seed = d.seed;
    this.mode = d.mode === 'hard' ? 'hard' : 'normal';
    this.round = d.round;
    this.credits = d.credits;
    this.lots = d.lots ? Array.from({ length: LOT_COUNT }, (_, n) => d.lots!.includes(n)) : startLots();
    this.lotsBought = Math.max(0, d.lotsBought ?? 0);
    if (d.tilled) {
      this.tilled = new Uint8Array(N);
      for (const i of d.tilled) if (i >= 0 && i < N) this.tilled[i] = 1;
    } else this.tilled = startTilled();
    this.tillEpoch++;
    const clamp = (v: number | undefined, max: number) => Math.max(0, Math.min(max, Math.floor(v ?? 0)));
    this.weapons = noWeapons();
    for (const k of WEAPON_ORDER) this.weapons[k] = clamp(d.weapons?.[k], WEAPON_LEVELS);
    this.weapons.sling = Math.max(1, this.weapons.sling);
    this.weapon = d.weapon && this.weapons[d.weapon] > 0 ? d.weapon : 'sling';
    this.farm = noFarm();
    for (const k of FARM_ORDER) this.farm[k] = clamp(d.farm?.[k], FARM[k].costs.length);
    this.hybrid = evenMarket(0);
    for (const k of CROP_ORDER) this.hybrid[k] = clamp(d.hybrid?.[k], 3);
    this.breedBonus = d.breedBonus;
    this.stats = { ...d.stats };
    this.project = Math.max(0, Math.min(PROJECT.length, d.project ?? 0));
    this.capDiscount = !!d.capDiscount;
    this.lastNight = !!d.lastNight && this.project === PROJECT.length;
    this.smoked = !!d.smoked;
    this.order = d.order && CROPS[d.order.kind] ? { ...d.order } : null;
    this.event = d.event ?? null;
    this.eventBought = [...(d.eventBought ?? [])];
    // the cap never went on (unless it did, and this is a farm kept after its win)
    if (this.project === PROJECT.length && !this.lastNight && d.stats.sealedOn === undefined) this.project = PROJECT.length - 1;
    this.market = { ...evenMarket(1), ...d.market };
    this.glut = { ...evenMarket(0), ...d.glut };
    this.wanted = { ...evenMarket(0), ...d.wanted };
    this.unlocked = new Set();
    this.resetTiles();
    for (const t of d.tiles) {
      if (t.i < 0 || t.i >= N) continue;
      const tile = this.tiles[t.i];
      if (t.crop && CROPS[t.crop.kind]) {
        tile.crop = {
          kind: t.crop.kind, growth: t.crop.growth, hp: t.crop.hp, harvests: t.crop.harvests ?? 0, fresh: false, shake: 0,
        } satisfies Crop;
      }
      if (t.structure && DEFENSES[t.structure.kind]) {
        tile.structure = {
          kind: t.structure.kind, level: Math.min(MAX_LEVEL, t.structure.level ?? 1), hp: t.structure.hp, fresh: false,
          cd: 0, anim: 99, shake: 0,
        } satisfies Structure;
      }
    }
    this.enterPlanning(false);
  }

  // ------------------------------------------------------------ readouts for the UI

  cropStage(c: Crop): number {
    const f = c.growth / CROPS[c.kind].growTime;
    if (f >= 1) return 3;
    if (c.harvests > 0) return 2; // a picked perennial is a leafy plant, not a seed
    if (f >= 0.45) return 2;
    if (f >= 0.12) return 1;
    return 0;
  }

  /**
   * Nothing left to fight today: every bunny is out of the ground, and any still around are on their way
   * home empty-handed. (A Buck or a Bandit with loot is always worth one more shot.)
   */
  allClear(): boolean {
    if (this.phase !== 'round' || this.spawnIdx < this.wave.length) return false;
    return this.bunnies.every((b) => b.dead || b.gone || (b.state === 'exit' && !b.carry && !BUNNIES[b.kind].boss));
  }

  bunniesLeft(): number {
    let n = this.bunnies.length;
    for (let k = this.spawnIdx; k < this.wave.length; k++) n += entrySize(this.wave[k]);
    return n;
  }

  /** Bunnies still to come out of each burrow today (all of them before the day starts). */
  burrowCounts(): number[] {
    const counts = new Array<number>(this.burrows.length).fill(0);
    for (let k = this.spawnIdx; k < this.wave.length; k++) {
      const b = this.wave[k].burrow;
      if (b >= 0) counts[b] += entrySize(this.wave[k]);
    }
    return counts;
  }

  /** Today's bunnies from one burrow, by kind. */
  burrowKinds(n: number): Partial<Record<BunnyKind, number>> {
    const out: Partial<Record<BunnyKind, number>> = {};
    for (const w of this.wave) if (w.burrow === n) out[w.kind] = (out[w.kind] ?? 0) + entrySize(w);
    return out;
  }

  waveCounts(): Partial<Record<BunnyKind, number>> {
    const out: Partial<Record<BunnyKind, number>> = {};
    for (const w of this.wave) out[w.kind] = (out[w.kind] ?? 0) + entrySize(w);
    return out;
  }

  cropCount(): number {
    return this.tiles.reduce((n, t) => n + (t.crop ? 1 : 0), 0);
  }
}
