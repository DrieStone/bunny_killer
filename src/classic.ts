// Classic Mode: the original Bunny Killer shooting gallery, played on the farm. Sixty seconds,
// bunnies bolting across the field and popping out of burrows. Sling them for points, keep a combo
// going, and whatever you do, don't hit the dog.
import { COLS, ROWS } from './config';
import { makeRng, type Rng } from './rng';

export const CLASSIC_SECONDS = 60;
export const CLASSIC_RELOAD = 0.22;

export type TargetKind = 'common' | 'speedy' | 'fat' | 'golden' | 'dog' | 'popup';

export interface Target {
  id: number;
  kind: TargetKind;
  x: number; // tile units, the point under its feet
  y: number;
  vx: number;
  hp: number;
  age: number;
  life: number; // pop-ups duck back down after this long
  hop: number;
  flash: number;
  dead: boolean;
}

export interface ClassicEvent {
  t: 'hit' | 'kill' | 'miss' | 'dog' | 'shot' | 'popup' | 'combo';
  x: number;
  y: number;
  points?: number;
  kind?: TargetKind;
  combo?: number;
}

const POINTS: Record<TargetKind, number> = { common: 10, speedy: 25, fat: 30, golden: 100, popup: 15, dog: -50 };
const HP: Record<TargetKind, number> = { common: 1, speedy: 1, fat: 3, golden: 1, popup: 1, dog: 1 };

export class Classic {
  time = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  shots = 0;
  hits = 0;
  reload = 0;
  targets: Target[] = [];
  events: ClassicEvent[] = [];
  holes: { x: number; y: number }[] = [];
  done = false;
  private rng: Rng;
  private nextSpawn = 0.6;
  private nextPop = 3;
  private nextDog = 14;
  private nextGold = 20;
  private id = 1;

  constructor(seed = (Math.random() * 2 ** 31) | 0) {
    this.rng = makeRng(seed);
    for (let n = 0; n < 6; n++) this.holes.push({ x: 4 + Math.floor(this.rng() * (COLS - 8)), y: 4 + Math.floor(this.rng() * (ROWS - 7)) });
  }

  get multiplier(): number {
    return this.combo >= 20 ? 4 : this.combo >= 10 ? 3 : this.combo >= 5 ? 2 : 1;
  }

  get accuracy(): number {
    return this.shots ? this.hits / this.shots : 0;
  }

  update(dt: number): void {
    if (this.done) return;
    this.time += dt;
    this.reload = Math.max(0, this.reload - dt);
    const heat = Math.min(1, this.time / CLASSIC_SECONDS); // things speed up as the clock runs down
    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) {
      const r = this.rng();
      this.runner(r < 0.62 ? 'common' : r < 0.9 ? 'speedy' : 'fat', heat);
      this.nextSpawn = (0.95 - heat * 0.6) * (0.5 + this.rng());
    }
    this.nextPop -= dt;
    if (this.nextPop <= 0) {
      const h = this.holes[Math.floor(this.rng() * this.holes.length)];
      if (!this.targets.some((t) => t.kind === 'popup' && t.x === h.x + 0.5 && t.y === h.y + 0.5)) {
        this.targets.push(this.make('popup', h.x + 0.5, h.y + 0.5, 0, 1.4 - heat * 0.6));
        this.events.push({ t: 'popup', x: h.x + 0.5, y: h.y + 0.5 });
      }
      this.nextPop = 1.2 + this.rng() * 1.8 - heat * 0.6;
    }
    this.nextDog -= dt;
    if (this.nextDog <= 0) {
      this.runner('dog', heat);
      this.nextDog = 9 + this.rng() * 8;
    }
    this.nextGold -= dt;
    if (this.nextGold <= 0) {
      this.runner('golden', heat);
      this.nextGold = 16 + this.rng() * 10;
    }
    for (const t of this.targets) {
      t.age += dt;
      t.flash = Math.max(0, t.flash - dt);
      t.x += t.vx * dt;
      t.hop += dt * (2 + Math.abs(t.vx) * 0.9);
      if (t.kind === 'popup' && t.age > t.life) t.dead = true;
      if (t.x < -2 || t.x > COLS + 2) t.dead = true;
    }
    this.targets = this.targets.filter((t) => !t.dead);
    if (this.time >= CLASSIC_SECONDS) {
      this.done = true;
      this.targets = [];
    }
  }

  private make(kind: TargetKind, x: number, y: number, vx: number, life = 99): Target {
    return { id: this.id++, kind, x, y, vx, hp: HP[kind], age: 0, life, hop: this.rng(), flash: 0, dead: false };
  }

  private runner(kind: TargetKind, heat: number): void {
    const fromLeft = this.rng() < 0.5;
    const base = kind === 'speedy' ? 6.5 : kind === 'golden' ? 9 : kind === 'fat' ? 2.4 : kind === 'dog' ? 5 : 4;
    const speed = base * (0.85 + this.rng() * 0.3) * (1 + heat * 0.45);
    const y = 2.5 + this.rng() * (ROWS - 4);
    this.targets.push(this.make(kind, fromLeft ? -1 : COLS + 1, y, fromLeft ? speed : -speed));
  }

  /** Fire the sling at a point in tile units. Returns false while reloading. */
  fire(x: number, y: number): boolean {
    if (this.done || this.reload > 0) return false;
    this.reload = CLASSIC_RELOAD;
    this.shots++;
    let best: Target | null = null;
    let bestD = Infinity;
    for (const t of this.targets) {
      const r = t.kind === 'fat' ? 0.7 : t.kind === 'popup' ? 0.55 : 0.6;
      const up = t.kind === 'popup' ? 0.25 : 0.35;
      const d = Math.hypot(t.x - x, t.y - up - y);
      if (d <= r && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    this.events.push({ t: 'shot', x, y });
    if (!best) {
      this.combo = 0;
      this.events.push({ t: 'miss', x, y });
      return true;
    }
    if (best.kind === 'dog') {
      best.dead = true;
      this.combo = 0;
      this.score = Math.max(0, this.score + POINTS.dog);
      this.events.push({ t: 'dog', x: best.x, y: best.y, points: POINTS.dog });
      return true;
    }
    this.hits++;
    best.hp--;
    best.flash = 0.12;
    if (best.hp > 0) {
      this.events.push({ t: 'hit', x: best.x, y: best.y, kind: best.kind });
      return true;
    }
    best.dead = true;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const pts = POINTS[best.kind] * this.multiplier;
    this.score += pts;
    this.events.push({ t: 'kill', x: best.x, y: best.y, points: pts, kind: best.kind, combo: this.combo });
    if (this.combo === 5 || this.combo === 10 || this.combo === 20) {
      this.events.push({ t: 'combo', x: best.x, y: best.y, combo: this.multiplier });
    }
    return true;
  }
}
