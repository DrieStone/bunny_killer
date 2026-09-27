// Game state and rules. No DOM or canvas in here, so it runs headless in tests.
import {
  BOSS_BOUNTY, BOSS_EVERY, BOSS_HP_PER_APPEARANCE, BREED_CAP, BUNNIES, type BunnyKind, bunnyHpScale, burrowCount, COLS,
  CROPS, CROP_ORDER, type CropKind, DEFENSES, type DefenseKind, defenseStats, investedIn, MAX_LEVEL, PLOT_LEVELS,
  REPAIR_RATE, ROUND_SECONDS, type Season, seasonOf, SEASONS, SELL_BACK, SLING_LEVELS, SPAWN_WINDOW,
  SPRINKLER_GROWTH, START_CREDITS, SUNDOWN_MAX_SECONDS, upgradeCost, waveSize, waveWeights, type Weather, WEATHER,
  WEATHER_ODDS,
} from './config';
import { hashSeed, makeRng, type Rng } from './rng';
import { PathField } from './path';
import { updateBunnies } from './sim/bunnies';
import { updateDefenses } from './sim/defenses';
import type {
  Bunny, Burrow, Crop, Dog, GameEvent, LifetimeStats, Phase, Projectile, RoundStats, ShopItem, SpawnEntry,
  Structure, Tile,
} from './types';
import {
  CRATER_SPAWN, idx, inMap, inRect, N, OBSTACLE, pickBurrows, plotRect, type Rect, tileX, tileY,
} from './world';

export const SAVE_VERSION = 1; // v1 saves without levels/harvests still load (fields default)

export interface SaveData {
  v: number;
  seed: number;
  round: number;
  credits: number;
  plotLevel: number;
  slingLevel: number;
  breedBonus: number;
  stats: LifetimeStats;
  tiles: {
    i: number;
    crop?: { kind: CropKind; growth: number; hp: number; harvests?: number };
    structure?: { kind: DefenseKind; hp: number; level?: number };
  }[];
}

function emptyRoundStats(): RoundStats {
  return {
    harvested: {}, harvestTotal: 0, spent: 0, kills: 0, bounty: 0,
    escapedFed: 0, escapedHungry: 0, cropsLost: 0, structuresBroken: 0,
  };
}

export class Game {
  phase: Phase = 'title';
  seed = 1;
  round = 1;
  credits = START_CREDITS;
  plotLevel = 0;
  slingLevel = 0;
  breedBonus = 0; // extra bunnies this round from last round's well-fed escapees
  stats: LifetimeStats = { kills: 0, harvest: 0, cropsLost: 0, bossesBeaten: 0 };
  roundStats: RoundStats = emptyRoundStats();

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
  slingCd = 0;
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

  constructor() {
    this.resetTiles();
  }

  // ------------------------------------------------------------ lifecycle

  newGame(seed = (Math.random() * 2 ** 31) | 0): void {
    this.seed = seed;
    this.retired = false;
    this.round = 1;
    this.credits = START_CREDITS;
    this.plotLevel = 0;
    this.slingLevel = 0;
    this.breedBonus = 0;
    this.stats = { kills: 0, harvest: 0, cropsLost: 0, bossesBeaten: 0 };
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

  /** Set up the scouting report for the current round and open the store. */
  private enterPlanning(): void {
    this.phase = 'planning';
    this.phaseTime = 0;
    this.time = 0;
    this.roundStats = emptyRoundStats();
    this.bunnies = [];
    this.dogs = [];
    this.projectiles = [];
    this.rng = makeRng(hashSeed(this.seed, this.round));
    this.season = seasonOf(this.round);
    this.weather = this.rollWeather();
    this.burrows = pickBurrows(this.rng, burrowCount(this.round));
    this.wave = this.buildWave();
    this.costDirty = true;
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

  /** Growth multiplier from the season and today's weather. */
  get climateGrowth(): number {
    return SEASONS[this.season].growth * WEATHER[this.weather].growth;
  }

  private buildWave(): SpawnEntry[] {
    const rng = this.rng;
    const scale = SEASONS[this.season].bunnies * WEATHER[this.weather].bunnies;
    const count = Math.max(1, Math.round(waveSize(this.round) * scale)) + this.breedBonus;
    const weights = waveWeights(this.round);
    const total = weights.reduce((s, [, w]) => s + w, 0);
    const wave: SpawnEntry[] = [];
    const window = ROUND_SECONDS * SPAWN_WINDOW;
    for (let n = 0; n < count; n++) {
      let roll = rng() * total;
      let kind: BunnyKind = 'common';
      for (const [k, w] of weights) {
        roll -= w;
        if (roll <= 0) { kind = k; break; }
      }
      // arrivals ramp up a little as the day goes on
      const at = 1.5 + Math.sqrt(rng()) * (window - 1.5);
      wave.push({ at, kind, burrow: Math.floor(rng() * this.burrows.length) });
    }
    if (this.round % BOSS_EVERY === 0) {
      wave.push({ at: window * 0.45, kind: 'mutant', burrow: -1 });
    }
    wave.sort((a, b) => a.at - b.at);
    return wave;
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
    this.slingCd = 0;
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

  /** Summary screen -> the next day's planning. */
  continueAfterSummary(): void {
    if (this.phase !== 'summary') return;
    this.breedBonus = Math.min(BREED_CAP, this.roundStats.escapedFed);
    this.round++;
    this.enterPlanning();
  }

  // ------------------------------------------------------------ per-frame

  update(dt: number): void {
    this.phaseTime += dt;
    if (this.phase === 'round' || this.phase === 'sundown') {
      this.stepDay(dt);
    } else if (this.phase === 'harvest') {
      this.stepHarvest(dt);
    } else if (this.phase === 'title') {
      updateBunnies(this, dt);
    }
  }

  /** A few bunnies loafing around the empty meadow behind the title screen. */
  setupAttract(): void {
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
    this.slingCd = Math.max(0, this.slingCd - dt);

    if (this.phase === 'round') {
      this.time += dt;
      while (this.spawnIdx < this.wave.length && this.wave[this.spawnIdx].at <= this.time) {
        this.spawn(this.wave[this.spawnIdx++]);
      }
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
      for (const b of this.bunnies) {
        if (b.fed) this.roundStats.escapedFed++;
        else this.roundStats.escapedHungry++;
      }
      this.bunnies = [];
      this.projectiles = [];
      this.beginHarvest();
    }
  }

  private growCrops(dt: number): void {
    for (let i = 0; i < N; i++) {
      const c = this.tiles[i].crop;
      if (c) c.growth += dt * this.growthMult[i] * this.climateGrowth;
    }
  }

  private spawn(e: SpawnEntry): void {
    const def = BUNNIES[e.kind];
    let x: number;
    let y: number;
    if (e.burrow < 0 || this.burrows.length === 0) {
      x = CRATER_SPAWN.x + 0.5;
      y = CRATER_SPAWN.y + 0.5;
    } else {
      const b = this.burrows[e.burrow];
      x = b.x + 0.5;
      y = b.y + 0.5;
    }
    let hp = Math.round(def.hp * bunnyHpScale(this.round));
    if (def.boss) hp += BOSS_HP_PER_APPEARANCE * Math.max(0, Math.floor(this.round / BOSS_EVERY) - 1);
    this.bunnies.push({
      id: this.nextId++, kind: e.kind, x, y, hp, maxHp: hp,
      state: 'seek', resume: 'seek', path: [], pathIdx: 0, epoch: -1, target: -1, chewTile: -1,
      eaten: 0, fed: false, repath: 0, timer: 0, sx: 0, sy: 0, ex: 0, ey: 0, kx: 0, ky: 0,
      wet: 0, flash: 0, facing: x < COLS / 2 ? 1 : -1, moving: false, hop: this.rng(), tick: 0,
      ox: (this.rng() - 0.5) * 0.35, oy: (this.rng() - 0.5) * 0.25, dead: false, gone: false,
    });
    this.emit({ t: 'spawn', x, y, kind: e.kind });
  }

  // ------------------------------------------------------------ harvest

  private beginHarvest(): void {
    this.phase = 'harvest';
    this.phaseTime = 0;
    this.harvestQueue = [];
    for (let i = 0; i < N; i++) {
      const c = this.tiles[i].crop;
      if (!c) continue;
      const def = CROPS[c.kind];
      if (c.growth >= def.growTime) {
        const value = Math.max(1, Math.round(def.sellValue * SEASONS[this.season].sell * (c.hp / def.hp)));
        this.harvestQueue.push({ i, value, kind: c.kind });
      }
    }
    this.harvestTimer = 0.6;
  }

  private stepHarvest(dt: number): void {
    this.harvestTimer -= dt;
    while (this.harvestTimer <= 0) {
      const h = this.harvestQueue.shift();
      if (!h) {
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
      this.harvestTimer += this.harvestQueue.length > 0 ? 0.1 : 1.1;
    }
  }

  /** Skip the coin animation. */
  finishHarvestNow(): void {
    if (this.phase !== 'harvest') return;
    while (this.phase === 'harvest') this.stepHarvest(10);
  }

  // ------------------------------------------------------------ planning actions

  get plot(): Rect {
    return plotRect(this.plotLevel);
  }

  owns(i: number): boolean {
    return inRect(this.plot, tileX(i), tileY(i));
  }

  itemCost(item: ShopItem): number {
    if (item.type === 'crop') return CROPS[item.kind].seedCost;
    if (item.type === 'defense') return DEFENSES[item.kind].cost;
    return 0;
  }

  /** Why an item can't go on a tile, or null if it can. */
  placeProblem(item: ShopItem, i: number): string | null {
    if (this.phase !== 'planning') return 'Wait for the planning phase.';
    if (i < 0 || i >= N || !this.owns(i)) return "That's not your land.";
    const t = this.tiles[i];
    if (item.type === 'remove') return t.crop || t.structure ? null : 'Nothing there.';
    if (item.type === 'upgrade') {
      if (!t.structure) return 'Pick a defense to upgrade.';
      if (t.structure.level >= MAX_LEVEL) return 'Already as good as it gets.';
      if (this.credits < upgradeCost(t.structure.kind, t.structure.level)) return 'Not enough credits.';
      return null;
    }
    if (t.crop || t.structure) return 'That spot is taken.';
    if (this.credits < this.itemCost(item)) return 'Not enough credits.';
    return null;
  }

  place(item: ShopItem, i: number): boolean {
    const problem = this.placeProblem(item, i);
    if (problem) {
      this.emit({ t: 'error', msg: problem });
      return false;
    }
    if (item.type === 'remove') return this.removeAt(i);
    if (item.type === 'upgrade') return this.upgradeAt(i);
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

  expandCost(): number | null {
    const next = PLOT_LEVELS[this.plotLevel + 1];
    return next ? next.cost : null;
  }

  expandPlot(): boolean {
    const cost = this.expandCost();
    if (this.phase !== 'planning' || cost === null || this.credits < cost) return false;
    this.credits -= cost;
    this.roundStats.spent += cost;
    this.plotLevel++;
    this.emit({ t: 'buy' });
    return true;
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

  slingUpgradeCost(): number | null {
    const next = SLING_LEVELS[this.slingLevel + 1];
    return next ? next.cost : null;
  }

  upgradeSling(): boolean {
    const cost = this.slingUpgradeCost();
    if (this.phase !== 'planning' || cost === null || this.credits < cost) return false;
    this.credits -= cost;
    this.roundStats.spent += cost;
    this.slingLevel++;
    this.emit({ t: 'buy' });
    return true;
  }

  // ------------------------------------------------------------ the sling

  /** Fire at a point in tile units. Returns false while reloading. */
  fireSling(x: number, y: number): boolean {
    if ((this.phase !== 'round' && this.phase !== 'sundown') || this.slingCd > 0) return false;
    const sling = SLING_LEVELS[this.slingLevel];
    this.slingCd = sling.reload;
    let best: Bunny | null = null;
    let bestD = Infinity;
    for (const b of this.bunnies) {
      if (b.dead || !this.isSurfaced(b)) continue;
      const def = BUNNIES[b.kind];
      const cy = b.y - (def.boss ? 0.6 : def.kind === 'fat' ? 0.35 : 0.3);
      const d = Math.hypot(b.x - x, cy - y);
      if (d <= def.size / 16 + 0.1 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    this.emit({ t: 'sling', x, y, hit: !!best });
    if (best) this.damageBunny(best, sling.damage);
    return true;
  }

  // ------------------------------------------------------------ shared sim helpers

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  isSurfaced(b: Bunny): boolean {
    if (!BUNNIES[b.kind].digger) return true;
    return b.state === 'eat' || b.state === 'spooked';
  }

  damageBunny(b: Bunny, dmg: number): void {
    if (b.dead || b.gone) return;
    b.hp -= dmg;
    b.flash = 0.12;
    if (b.hp > 0) {
      this.emit({ t: 'hit', x: b.x, y: b.y });
      return;
    }
    b.dead = true;
    this.stats.kills++;
    this.roundStats.kills++;
    this.emit({ t: 'poof', x: b.x, y: b.y, kind: b.kind });
    if (BUNNIES[b.kind].boss) {
      this.credits += BOSS_BOUNTY;
      this.roundStats.bounty += BOSS_BOUNTY;
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
            this.growthMult[j] = SPRINKLER_GROWTH;
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
      v: SAVE_VERSION, seed: this.seed, round: this.round, credits: this.credits, plotLevel: this.plotLevel,
      slingLevel: this.slingLevel, breedBonus: this.breedBonus, stats: { ...this.stats }, tiles,
    };
  }

  loadSave(d: SaveData): void {
    this.seed = d.seed;
    this.round = d.round;
    this.credits = d.credits;
    this.plotLevel = Math.min(d.plotLevel, PLOT_LEVELS.length - 1);
    this.slingLevel = Math.min(d.slingLevel, SLING_LEVELS.length - 1);
    this.breedBonus = d.breedBonus;
    this.stats = { ...d.stats };
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
    this.enterPlanning();
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

  bunniesLeft(): number {
    return this.wave.length - this.spawnIdx + this.bunnies.length;
  }

  waveCounts(): Partial<Record<BunnyKind, number>> {
    const out: Partial<Record<BunnyKind, number>> = {};
    for (const w of this.wave) out[w.kind] = (out[w.kind] ?? 0) + 1;
    return out;
  }

  cropCount(): number {
    return this.tiles.reduce((n, t) => n + (t.crop ? 1 : 0), 0);
  }
}
