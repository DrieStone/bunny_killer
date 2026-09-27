// Draws the farm: a textured ground baked once per layout, y-sorted sprites with soft shadows,
// particles, time-of-day lighting, and a little ambient life. World units are 32px tiles.
import {
  BUNNIES, COLS, CROPS, DEFENSES, defenseStats, MAX_LEVEL, ROUND_SECONDS, ROWS, type Season, SLING_LEVELS, TILE,
  upgradeCost, WORLD_H, WORLD_W,
} from '../config';
import type { Classic, ClassicEvent } from '../classic';
import { CLASSIC_RELOAD, CLASSIC_SECONDS } from '../classic';
import type { Game } from '../game';
import { hashSeed } from '../rng';
import type { Bunny, Dog, GameEvent, ShopItem, Structure } from '../types';
import { CRATER, HOUSE, idx, inMap, inRect, plotRect, SCENERY, type Scenery, tileX, tileY } from '../world';
import { BUNNY_COLORS } from './palette';
import { dottedCircle, Particles, pixelDisc, pixelLine } from './particles';
import { drawText, OUTLINE, textWidth } from './pixels';
import { forSeason, type Img, sprites } from './sprites';

export interface View {
  mouseX: number; // world pixels
  mouseY: number;
  mouseIn: boolean;
  hoverTile: number; // -1 when off the map
  selected: ShopItem | null;
  previewExpand: boolean;
}

interface Drawable {
  y: number;
  draw: () => void;
}

const T = TILE;
const rand = (a: number, b: number, n: number) => hashSeed(a, b, n) / 4294967296;

// ---------------------------------------------------------------- palette for the ground

const GRASS_BY_SEASON: Record<Season, string[]> = {
  spring: ['#4f8f35', '#5fa03c', '#6fb244', '#80c24e', '#93d25a'],
  summer: ['#58882a', '#6a9c30', '#7eb03a', '#95c246', '#aed455'],
  fall: ['#6a6f2c', '#7c8233', '#93933d', '#a9a248', '#c0ae56'],
  winter: ['#b9c8d8', '#cdd9e6', '#dde6f0', '#ebf1f7', '#f8fbfd'],
};
const LEAVES = ['#e0892e', '#c9562a', '#f2c14e', '#a8412a'];
const BLADE_DARK = '#3f7a2b';
const BLADE_LIGHT = '#a9e06a';
const SOIL = { hi: '#a86f42', body: '#8d5835', mid: '#7a4a2c', furrow: '#5d361f', deep: '#4a2a18', clod: '#b47a4a' };
const PATH = ['#c9a36f', '#b98f5c', '#a67c4c', '#d8b884'];
const FLOWERS = ['#ffffff', '#ffe066', '#ff9ec4', '#c7a6ff', '#8fd3ff'];

/** Smooth value noise in [0,1], deterministic. */
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = rand(x0, y0, seed);
  const b = rand(x0 + 1, y0, seed);
  const c = rand(x0, y0 + 1, seed);
  const d = rand(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

function hexRGB(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------- renderer

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private season: Season = 'spring';
  private weatherFx: { x: number; y: number; v: number; s: number; p: number }[] = [];
  private fogPhase = 0;
  readonly fx = new Particles();
  private clock = 0;
  private dusk = 0;
  private clouds = Array.from({ length: 4 }, (_, i) => ({
    x: rand(i, 1, 5) * WORLD_W, y: rand(i, 2, 5) * WORLD_H, r: 90 + rand(i, 3, 5) * 90, v: 6 + rand(i, 4, 5) * 6,
  }));
  private butterflies = Array.from({ length: 4 }, (_, i) => ({
    x: rand(i, 7, 9) * WORLD_W, y: rand(i, 8, 9) * WORLD_H, t: rand(i, 9, 9) * 10, c: FLOWERS[i % FLOWERS.length],
    vx: (rand(i, 10, 9) - 0.5) * 30, vy: (rand(i, 11, 9) - 0.5) * 20,
  }));
  private smokeTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  // ------------------------------------------------------------ events -> effects

  handle(events: GameEvent[]): void {
    const fx = this.fx;
    for (const e of events) {
      const x = 'x' in e ? e.x * T : 0;
      const y = 'y' in e ? e.y * T : 0;
      switch (e.t) {
        case 'poof': {
          const pal = BUNNY_COLORS[e.kind];
          const boss = BUNNIES[e.kind].boss;
          const n = boss ? 3 : 1;
          const cy = y + 2 - 8 * n;
          for (let i = 0; i < 8 * n; i++) fx.puff(x, cy, (5 + n * 3) * 1.4, '#ffffff', 0.5);
          fx.burst(x, cy, 26 * n, [pal.fur, pal.light, '#ffffff', pal.dark], 150 * Math.sqrt(n), { grav: 40, life: 0.9, size: 2 });
          for (let i = 0; i < 6 * n; i++) {
            fx.add({
              x: x + (Math.random() - 0.5) * 16 * n, y: cy - 4, vx: (Math.random() - 0.5) * 50, vy: -36 - Math.random() * 20,
              grav: 30, drag: 2, size: 3, color: i % 2 ? '#ffffff' : pal.fur, life: 1.3 + Math.random() * 0.6,
            });
          }
          if (boss) fx.ring(x, cy, 70, '#9dff6b', 0.6);
          break;
        }
        case 'hit':
          fx.burst(x, y - 10, 7, ['#ffffff', '#ffe98a'], 110, { grav: 0, life: 0.22, size: 2 });
          break;
        case 'sling':
          fx.streak(WORLD_W / 2, WORLD_H + 4, x, y, '#f4ecd8', 2);
          if (!e.hit) {
            fx.burst(x, y, 7, ['#a0703f', '#d0a878'], 70, { life: 0.35, size: 2 });
            fx.puff(x, y, 4, '#e8dcc4', 0.3);
          }
          break;
        case 'snap':
          fx.burst(x, y - 4, 10, ['#ffffff', '#c9d6e6'], 120, { grav: 0, life: 0.25, size: 2 });
          fx.text(x, y - 26, 'SNAP!', '#ffe98a', 0.8);
          break;
        case 'scare':
          fx.ring(x, y, e.r * T, '#ffffff', 0.5);
          // a startled crow takes off from the scarecrow
          fx.add({ kind: 'crow', x: x + 6, y: y - 34, vx: 60 + Math.random() * 30, vy: -50, life: 1.4, grav: -10, drag: 0.2 });
          break;
        case 'spray':
          fx.ring(x, y, e.r * T, '#8fd3ff', 0.45);
          for (let i = 0; i < 40; i++) {
            const a = (i / 40) * Math.PI * 2;
            fx.add({
              x, y: y - 10, vx: Math.cos(a) * e.r * T * 2.3, vy: Math.sin(a) * e.r * T * 1.5 - 22,
              drag: 4.5, grav: 90, color: i % 3 ? '#8fd3ff' : '#ffffff', life: 0.5, size: 2,
            });
          }
          break;
        case 'bite':
          fx.burst(x, y - 8, 5, ['#ffffff'], 80, { grav: 0, life: 0.2, size: 2 });
          fx.text(x, y - 30, 'CHOMP', '#ffffff', 0.6);
          break;
        case 'chomp':
          fx.burst(x + (Math.random() - 0.5) * 12, y - 4, 3, ['#5fb04a', '#a9e06a'], 60, { life: 0.4, size: 2 });
          break;
        case 'chew':
          fx.burst(x, y - 6, 3, ['#d9a066', '#8a5530'], 60, { life: 0.4, size: 2 });
          break;
        case 'cropLost':
          fx.burst(x, y, 14, ['#5fb04a', '#a9e06a', '#8d5835'], 110, { size: 2 });
          fx.text(x, y - 30, 'EATEN', '#ff9a9a', 1);
          break;
        case 'broken':
          fx.burst(x, y - 8, 20, ['#d9a066', '#8a5530', '#c9d6e6'], 140, { size: 2 });
          for (let i = 0; i < 5; i++) fx.puff(x, y - 8, 8, '#e0d4bc');
          break;
        case 'coin':
          fx.text(x, y - 26, `+${e.amount}¢`, '#ffe24a', 1.4);
          fx.burst(x, y - 12, 7, ['#ffe24a', '#ffffff'], 80, { grav: 0, life: 0.4, size: 2 });
          break;
        case 'upgrade':
          fx.ring(x, y, 26, '#ffe24a', 0.5);
          fx.burst(x, y - 10, 16, ['#ffe24a', '#ffffff', '#f7c948'], 110, { grav: 60, life: 0.7, size: 2 });
          fx.text(x, y - 34, `LEVEL ${e.level}!`, '#ffe24a', 1.1);
          break;
        case 'place':
        case 'remove':
          for (let i = 0; i < 4; i++) fx.puff(x, y + 8, 4, '#c79a6a', 0.35);
          break;
        case 'spawn':
        case 'dig':
          fx.burst(x, y, 9, ['#a0703f', '#6b4428'], 80, { life: 0.4, size: 2 });
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------ frame

  render(g: Game, view: View, dt: number): void {
    this.clock += dt;
    this.fx.update(dt);
    const ctx = this.ctx;
    const title = g.phase === 'title';
    this.season = title ? 'spring' : g.season;
    const key = `${g.plotLevel}:${this.season}`;
    if (!this.bg || this.bgKey !== key) this.buildBackground(g.plotLevel);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.bg!, 0, 0);

    if (!title) this.drawBurrows(g);
    if (g.phase === 'planning') this.drawPlanningUnderlay(g, view);

    // everything standing on the ground: shadows first, then sprites back to front
    const list: Drawable[] = [];
    const shadows: [number, number, number][] = [];
    this.collectScenery(list, shadows);
    this.collectTiles(g, list, shadows);
    for (const b of g.bunnies) this.collectBunny(g, b, list, shadows);
    for (const d of g.dogs) this.collectDog(d, list, shadows);
    for (const d of g.dogs) this.drawLeash(d);
    this.drawShadows(shadows);
    list.sort((p, q) => p.y - q.y);
    for (const d of list) d.draw();

    this.drawCraterGlow();
    for (const p of g.projectiles) this.drawPebble(p.x * T, p.y * T);
    this.ambient(g, dt);
    this.fx.draw(ctx);
    this.drawBars(g);
    this.drawLevels(g);
    if (g.phase === 'planning') this.drawPlanningOverlay(g, view);
    this.drawWeather(g, dt);
    this.drawLight(g, dt);
    if ((g.phase === 'round' || g.phase === 'sundown') && view.mouseIn) this.drawCrosshair(g, view);
  }

  /** Blank the effects between games. */
  reset(): void {
    this.fx.clear();
    this.dusk = 0;
  }

  // ------------------------------------------------------------ the ground

  private buildBackground(level: number): void {
    const c = document.createElement('canvas');
    c.width = WORLD_W;
    c.height = WORLD_H;
    const ctx = c.getContext('2d')!;
    const plot = level >= 0 ? plotRect(level) : null;
    const img = ctx.createImageData(WORLD_W, WORLD_H);
    const data = img.data;
    const season = this.season;
    const grass = GRASS_BY_SEASON[season].map(hexRGB);
    const winter = season === 'winter';
    const path = PATH.map(hexRGB);
    const pathDist = this.pathField(plot);

    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const o = (y * WORLD_W + x) * 4;
        const tx = (x / T) | 0;
        const ty = (y / T) | 0;
        let col: [number, number, number];
        if (plot && inRect(plot, tx, ty)) {
          col = hexRGB(this.soilColor(x, y, tx, ty, plot));
        } else {
          // big soft patches of lighter and darker grass, dithered into 5 tones
          const v = valueNoise(x, y, 120, 1) * 0.55 + valueNoise(x, y, 26, 2) * 0.3 + valueNoise(x, y, 7, 3) * 0.15;
          const d = BAYER[(y & 3) * 4 + (x & 3)] * 0.14;
          const k = Math.max(0, Math.min(4, Math.floor((v + d - 0.18) * 7.2)));
          col = grass[k];
          // the dirt path from the house to the plot
          const pd = pathDist(x, y);
          if (pd < 11 + valueNoise(x, y, 5, 4) * 4) {
            const pv = valueNoise(x, y, 9, 5) + BAYER[(y & 3) * 4 + (x & 3)] * 0.3;
            col = path[pv > 0.72 ? 3 : pv > 0.5 ? 0 : pv > 0.3 ? 1 : 2];
            if (pd > 9.5) col = path[2];
            if (winter && pv > 0.55) col = [214, 222, 232]; // packed snow on the path
          } else if (winter) {
            // thin spots where the grass shows through, feathered with dither instead of hard-edged
            const thin = valueNoise(x, y, 11, 6) * 0.7 + valueNoise(x, y, 4, 7) * 0.3 + BAYER[(y & 3) * 4 + (x & 3)] * 0.18;
            if (thin < 0.2) col = [118, 146, 104];
            else if (thin < 0.25) col = [165, 186, 160];
          }
        }
        data[o] = col[0];
        data[o + 1] = col[1];
        data[o + 2] = col[2];
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // grass tufts, clover and wildflowers on top of the texture (autumn leaves, or bare snow in winter)
    for (let n = 0; n < (winter ? 260 : 950); n++) {
      const x = Math.floor(rand(n, 1, 21) * WORLD_W);
      const y = Math.floor(rand(n, 2, 21) * WORLD_H);
      const tx = (x / T) | 0;
      const ty = (y / T) | 0;
      if (plot && inRect({ x0: plot.x0, y0: plot.y0, x1: plot.x1, y1: plot.y1 + 1 }, tx, ty)) continue;
      if (pathDist(x, y) < 12) continue;
      const r = rand(n, 3, 21);
      if (winter) {
        ctx.fillStyle = r < 0.5 ? '#9fb0a0' : '#c3d0dc';
        ctx.fillRect(x, y - 2, 1, 2);
        ctx.fillRect(x + 2, y - 1, 1, 1);
      } else if (r < 0.66) this.tuft(ctx, x, y, n);
      else if (r < 0.9) this.clover(ctx, x, y);
      else if (season === 'fall') {
        ctx.fillStyle = LEAVES[Math.floor(rand(n, 4, 21) * LEAVES.length)];
        ctx.fillRect(x, y, 2, 1);
        ctx.fillRect(x + 1, y - 1, 1, 1);
      } else this.flower(ctx, x, y, FLOWERS[Math.floor(rand(n, 4, 21) * FLOWERS.length)]);
    }
    // pebbles on the path
    for (let n = 0; n < 60; n++) {
      const x = Math.floor(rand(n, 5, 22) * WORLD_W);
      const y = Math.floor(rand(n, 6, 22) * WORLD_H);
      if (pathDist(x, y) > 8) continue;
      ctx.fillStyle = '#8f7a62';
      ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = '#d9c7a5';
      ctx.fillRect(x, y, 1, 1);
    }
    if (plot) this.plotEdge(ctx, plot);
    if (plot && winter) {
      // frost on the furrow tops
      for (let n = 0; n < 700; n++) {
        const x = plot.x0 * T + Math.floor(rand(n, 8, 61) * (plot.x1 - plot.x0 + 1) * T);
        const y = plot.y0 * T + Math.floor(rand(n, 9, 61) * (plot.y1 - plot.y0 + 1) * 4) * 8;
        ctx.fillStyle = n % 3 ? '#e8f0f8' : '#ffffff';
        ctx.fillRect(x, y, 2, 1);
      }
    }
    this.bg = c;
    this.bgKey = `${level}:${season}`;
  }

  /** Distance (px) to the path that runs from the farmhouse door down and across to the plot. */
  private pathField(plot: { x0: number; y0: number; x1: number; y1: number } | null): (x: number, y: number) => number {
    const doorX = (HOUSE.x + 2.05) * T;
    const doorY = (HOUSE.y + HOUSE.h) * T;
    const bendY = 6.5 * T;
    const endX = (plot ? plot.x0 : 8) * T;
    const endY = plot ? Math.min(Math.max(bendY + T, (plot.y0 + plot.y1 + 1) * T * 0.5), (plot.y1 + 0.5) * T) : bendY;
    const segs: [number, number, number, number][] = [
      [doorX, doorY, doorX, bendY],
      [doorX, bendY, endX - 2 * T, bendY],
      [endX - 2 * T, bendY, endX, endY],
    ];
    return (x, y) => {
      let best = Infinity;
      for (const [x0, y0, x1, y1] of segs) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
        const d = Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
        if (d < best) best = d;
      }
      return best;
    };
  }

  private soilColor(x: number, y: number, tx: number, ty: number, plot: { x0: number; y0: number; x1: number; y1: number }): string {
    const ly = y - ty * T;
    const row = ly % 8; // four raised furrows per tile
    const n = rand(x, y, 31);
    let c = row === 0 ? SOIL.hi : row < 4 ? SOIL.body : row < 6 ? SOIL.mid : SOIL.furrow;
    if (n < 0.05) c = SOIL.clod;
    else if (n > 0.95) c = SOIL.deep;
    // a darker rim where the tilled soil meets the grass
    const edge = Math.min(x - plot.x0 * T, (plot.x1 + 1) * T - 1 - x, y - plot.y0 * T, (plot.y1 + 1) * T - 1 - y);
    if (edge < 2) c = SOIL.deep;
    else if (edge < 4 && row !== 0) c = SOIL.furrow;
    void tx;
    return c;
  }

  private plotEdge(ctx: CanvasRenderingContext2D, plot: { x0: number; y0: number; x1: number; y1: number }): void {
    if (this.season === 'winter') return;
    // grass spilling over the soil edge so the plot sits in the meadow instead of on it
    const x0 = plot.x0 * T;
    const y0 = plot.y0 * T;
    const x1 = (plot.x1 + 1) * T;
    const y1 = (plot.y1 + 1) * T;
    for (let x = x0; x < x1; x += 3) {
      if (rand(x, 1, 41) < 0.7) this.tuft(ctx, x, y0 + 1, x);
      if (rand(x, 2, 41) < 0.5) this.tuft(ctx, x, y1 + 3, x + 7);
    }
    for (let y = y0; y < y1; y += 3) {
      if (rand(y, 3, 41) < 0.5) this.tuft(ctx, x0 - 1, y + 3, y);
      if (rand(y, 4, 41) < 0.5) this.tuft(ctx, x1 + 1, y + 3, y + 3);
    }
  }

  private tuft(ctx: CanvasRenderingContext2D, x: number, y: number, n: number): void {
    // three blades leaning out from a common root: dark stems, a light tip on the tallest
    const h = 3 + Math.floor(rand(n, 7, 23) * 3);
    ctx.fillStyle = BLADE_DARK;
    ctx.fillRect(x, y - h, 1, h);
    ctx.fillRect(x - 1, y - h + 2, 1, h - 2);
    ctx.fillRect(x - 2, y - h + 3, 1, 1);
    ctx.fillRect(x + 1, y - h + 1, 1, h - 1);
    ctx.fillRect(x + 2, y - h + 2, 1, 1);
    ctx.fillStyle = BLADE_LIGHT;
    ctx.fillRect(x, y - h - 1, 1, 1);
    if (h > 4) ctx.fillRect(x + 2, y - h + 1, 1, 1);
  }

  private clover(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#4c9a3a';
    ctx.fillRect(x - 2, y - 1, 2, 2);
    ctx.fillRect(x + 1, y - 1, 2, 2);
    ctx.fillRect(x - 1, y - 3, 2, 2);
    ctx.fillStyle = '#78c457';
    ctx.fillRect(x - 2, y - 1, 1, 1);
    ctx.fillRect(x - 1, y - 3, 1, 1);
  }

  private flower(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = '#3f7a2b';
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillStyle = color;
    ctx.fillRect(x - 1, y - 3, 3, 1);
    ctx.fillRect(x, y - 4, 1, 3);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(x, y - 3, 1, 1);
  }

  // ------------------------------------------------------------ sprites

  /** Queue a sprite drawn with its bottom-center at (x, y). */
  private put(list: Drawable[], img: Img, x: number, y: number, opts: {
    flip?: boolean; sx?: number; sy?: number; alpha?: number; sort?: number; lift?: number;
  } = {}): void {
    const { flip = false, sx = 1, sy = 1, alpha = 1, lift = 0 } = opts;
    list.push({
      y: opts.sort ?? y,
      draw: () => this.blit(img, x, y - lift, flip, sx, sy, alpha),
    });
  }

  private blit(img: Img, x: number, y: number, flip = false, sx = 1, sy = 1, alpha = 1): void {
    const ctx = this.ctx;
    const w = img.width * sx;
    const h = img.height * sy;
    ctx.globalAlpha = alpha;
    if (!flip && sx === 1 && sy === 1) {
      ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height));
    } else {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(flip ? -1 : 1, 1);
      ctx.drawImage(img, Math.round(-w / 2), Math.round(-h), Math.round(w), Math.round(h));
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private collectScenery(list: Drawable[], shadows: [number, number, number][]): void {
    const sc = sprites().scenery;
    for (const o of SCENERY) {
      let img = sc[o.kind];
      if (!img) continue;
      if (o.kind === 'flowers' && this.season === 'winter') continue;
      if (o.kind === 'tree_oak' || o.kind === 'tree_apple' || o.kind === 'bush' || o.kind === 'flowers') {
        img = forSeason(img, o.kind, this.season);
      }
      const cx = (o.x + o.w / 2) * T;
      const by = (o.y + o.h) * T;
      const { dy, shadow } = SCENERY_PLACE[o.kind];
      if (shadow > 0) shadows.push([cx + shadow * 0.25, by - 3 + dy, shadow]);
      this.put(list, img, cx, by + dy, { sort: by - 1 });
    }
  }

  private collectTiles(g: Game, list: Drawable[], shadows: [number, number, number][]): void {
    const sp = sprites();
    for (let i = 0; i < g.tiles.length; i++) {
      const t = g.tiles[i];
      const cx = tileX(i) * T + T / 2;
      const by = tileY(i) * T + T;
      if (t.crop) {
        const c = t.crop;
        const stage = g.cropStage(c);
        const img = stage === 0 ? sp.seed : stage === 1 ? sp.sprout : stage === 2 ? sp.crops[c.kind].young : sp.crops[c.kind].ripe;
        const shake = c.shake > 0 ? Math.round(Math.sin(this.clock * 60)) : 0;
        // ripe crops breathe a little so the field feels alive
        const sway = stage >= 2 ? 1 + Math.sin(this.clock * 2 + i) * 0.015 : 1;
        const hurt = c.hp < CROPS[c.kind].hp * 0.5;
        this.put(list, img, cx + shake, by - 2, { sy: sway, sort: by - 3, alpha: hurt ? 0.85 : 1 });
        if (stage === 3 && Math.sin(this.clock * 2.5 + i * 1.7) > 0.985) {
          this.fx.add({ kind: 'sparkle', x: cx + (rand(i, 1, 51) - 0.5) * 18, y: by - 14 - rand(i, 2, 51) * 10, life: 0.5, color: '#ffffff' });
        }
      }
      const s = t.structure;
      if (s) this.collectStructure(g, i, s, cx, by, list, shadows);
    }
  }

  private collectStructure(
    g: Game, i: number, s: Structure, cx: number, by: number, list: Drawable[], shadows: [number, number, number][],
  ): void {
    const d = sprites().defenses;
    const shake = s.shake > 0 ? Math.round(Math.sin(this.clock * 70)) : 0;
    const x = cx + shake;
    switch (s.kind) {
      case 'fence': {
        const tx = tileX(i);
        const ty = tileY(i);
        const f = (dx: number, dy: number) =>
          inMap(tx + dx, ty + dy) && g.tiles[idx(tx + dx, ty + dy)].structure?.kind === 'fence';
        const mask = (f(0, -1) ? 1 : 0) | (f(1, 0) ? 2 : 0) | (f(0, 1) ? 4 : 0) | (f(-1, 0) ? 8 : 0);
        const img = sprites().fence[mask];
        shadows.push([cx + 3, by - 6, 8]);
        list.push({ y: by - 4, draw: () => this.ctx.drawImage(img, tx * T + shake, ty * T - 12) });
        return;
      }
      case 'trap':
        // flat on the ground: under everything else
        list.push({ y: by - 30, draw: () => this.blit(s.cd > 0 ? d.trapShut : d.trapOpen, x, by - 4) });
        return;
      case 'scarecrow': {
        const scaring = s.anim < 0.6;
        const wob = scaring ? Math.sin(s.anim * 40) * 0.08 : Math.sin(this.clock * 1.3 + i) * 0.015;
        shadows.push([cx + 4, by - 4, 11]);
        this.put(list, d.scarecrow, x, by - 1, { sx: 1 + wob, sy: 1 - Math.abs(wob) * 0.5, lift: scaring ? Math.abs(Math.sin(s.anim * 20)) * 3 : 0 });
        return;
      }
      case 'turret': {
        const fired = s.anim < 0.18;
        shadows.push([cx + 4, by - 4, 11]);
        this.put(list, d.turret, x, by - 1, { sy: fired ? 0.9 : 1, sx: fired ? 1.06 : 1 });
        return;
      }
      case 'sprinkler': {
        shadows.push([cx + 2, by - 5, 9]);
        const bob = s.anim < 0.3 ? Math.sin(s.anim * 50) * 0.06 : 0;
        this.put(list, d.sprinkler, x, by - 3, { sy: 1 + bob });
        if ((g.phase === 'round' || g.phase === 'sundown') && Math.random() < 0.12) {
          const a = Math.random() * Math.PI * 2;
          this.fx.add({ x: cx + Math.cos(a) * 8, y: by - 20, vx: Math.cos(a) * 30, vy: -30, grav: 120, color: '#8fd3ff', life: 0.4 });
        }
        return;
      }
      case 'doghouse':
        shadows.push([cx + 4, by - 4, 16]);
        this.put(list, d.doghouse, x, by);
        return;
    }
  }

  private collectBunny(g: Game, b: Bunny, list: Drawable[], shadows: [number, number, number][]): void {
    const def = BUNNIES[b.kind];
    const art = sprites().bunnies[b.kind];
    let px = b.x * T;
    let py = b.y * T + 7;
    if (b.state === 'eat') {
      px += b.ox * T;
      py += b.oy * T;
    }
    if (!g.isSurfaced(b)) {
      const wob = b.moving ? Math.round(Math.sin(this.clock * 22 + b.id)) : 0;
      shadows.push([px, py - 2, 9]);
      this.put(list, sprites().mound, px + wob, py, { sy: 1 + Math.sin(this.clock * 18 + b.id) * 0.05 });
      if (b.moving && Math.random() < 0.3) {
        this.fx.add({ x: px, y: py - 4, vx: (Math.random() - 0.5) * 60, vy: -40, grav: 160, color: '#a0703f', life: 0.35, size: 2 });
      }
      return;
    }
    const flip = b.facing < 0;
    const flash = b.flash > 0;
    let frame = 0;
    let lift = 0;
    let sx = 1;
    let sy = 1;
    const cycle = b.hop % 1;
    if (b.state === 'eat' || b.state === 'chew') {
      frame = Math.floor(this.clock * 4 + b.id) % 2 === 0 ? art.eat[0] : art.eat[1];
      if (art.squash) sy = Math.floor(this.clock * 4 + b.id) % 2 === 0 ? 0.94 : 1;
    } else if (b.moving) {
      if (art.squash) {
        // one pose, bounced: squash on landing, stretch in the air
        const s = Math.sin(cycle * Math.PI * 2);
        sy = 1 + s * 0.1;
        sx = 1 - s * 0.07;
        lift = Math.max(0, Math.sin(cycle * Math.PI)) * (def.boss ? 10 : 6);
      } else {
        frame = Math.floor(cycle * art.frames.length) % art.frames.length;
        lift = frame >= 2 && frame <= 6 ? Math.sin(((frame - 2) / 4) * Math.PI) * 6 : 0;
      }
    } else if (!art.squash) {
      // idle: a slow breath and the occasional twitch
      frame = Math.sin(this.clock * 1.7 + b.id * 3) > 0.93 ? 1 : 0;
    } else {
      sy = 1 + Math.sin(this.clock * 2 + b.id) * 0.02;
    }
    const img = flash ? art.flash[frame] : art.frames[frame];
    const shadowW = (img.width / 2.6) * (1 - lift / 30);
    shadows.push([px, py - 1, Math.max(4, shadowW)]);
    if (def.boss) {
      list.push({ y: py - 0.5, draw: () => this.bossGlow(px, py - 22) });
    }
    this.put(list, img, px, py, { flip, sx, sy, lift });
    if (b.wet > 0) {
      list.push({
        y: py + 0.5,
        draw: () => {
          const t = Math.floor(this.clock * 8 + b.id);
          this.ctx.fillStyle = '#8fd3ff';
          this.ctx.fillRect(Math.round(px - 8 + (t % 3) * 6), Math.round(py - 18 + ((t * 7) % 14)), 2, 3);
        },
      });
    }
    if (b.state === 'spooked') {
      list.push({ y: py + 1, draw: () => drawText(this.ctx, '!', Math.round(px - 2), Math.round(py - img.height - 14 - lift), '#ffffff', '#c0392b', 2, 1) });
    }
  }

  private bossGlow(x: number, y: number): void {
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 4);
    const grd = ctx.createRadialGradient(x, y, 4, x, y, 46);
    grd.addColorStop(0, `rgba(157,255,107,${0.35 + pulse * 0.15})`);
    grd.addColorStop(1, 'rgba(157,255,107,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - 46, y - 46, 92, 92);
    if (Math.random() < 0.3) {
      this.fx.add({ x: x + (Math.random() - 0.5) * 40, y: y + 10, vy: -30, color: '#b8ff8a', life: 0.7, size: 2 });
    }
  }

  private collectDog(d: Dog, list: Drawable[], shadows: [number, number, number][]): void {
    const dog = sprites().dog;
    const px = d.x * T;
    const py = d.y * T + 6;
    const img = d.moving ? dog.run[Math.floor(d.run * 14) % dog.run.length] : dog.stand;
    const lunge = d.cd > 0.6 ? 4 * d.facing : 0; // right after a bite
    shadows.push([px, py - 1, 9]);
    this.put(list, img, px + lunge, py, { flip: d.facing < 0 });
  }

  private drawLeash(d: Dog): void {
    const ctx = this.ctx;
    const hx = tileX(d.home) * T + T / 2;
    const hy = tileY(d.home) * T + T - 6;
    const ex = Math.round(d.x * T - d.facing * 4);
    const ey = Math.round(d.y * T - 6);
    // a sagging rope
    const steps = 16;
    const len = Math.hypot(ex - hx, ey - hy);
    const sag = Math.max(0, 14 - len * 0.1);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = hx + (ex - hx) * t;
      const y = hy + (ey - hy) * t + Math.sin(t * Math.PI) * sag;
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
      ctx.fillStyle = '#b08a5a';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  private drawShadows(shadows: [number, number, number][]): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(28, 40, 12, 0.24)';
    for (const [x, y, w] of shadows) {
      const rx = Math.round(w);
      const ry = Math.max(2, Math.round(w * 0.32));
      for (let dy = -ry; dy <= ry; dy++) {
        const hw = Math.round(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
        ctx.fillRect(Math.round(x) - hw, Math.round(y) + dy, hw * 2, 1);
      }
    }
  }

  private drawPebble(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
    ctx.fillStyle = '#b8bec8';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
  }

  private drawBurrows(g: Game): void {
    const ctx = this.ctx;
    const hole = sprites().scenery.burrow;
    const counts = new Array(g.burrows.length).fill(0);
    for (const w of g.wave) if (w.burrow >= 0) counts[w.burrow]++;
    g.burrows.forEach((b, n) => {
      const cx = b.x * T + T / 2;
      const cy = b.y * T + T / 2;
      this.blit(hole, cx, cy + 8);
      ctx.fillStyle = '#1e120a';
      ctx.fillRect(cx - 5, cy + 1, 10, 3);
      if (g.phase !== 'planning') return;
      // a bouncing arrow into the field, with the head count
      const bob = Math.round(Math.sin(this.clock * 5 + n) * 3);
      const dx = b.x === 0 ? 1 : b.x === COLS - 1 ? -1 : 0;
      const dy = b.y === 0 ? 1 : b.y === ROWS - 1 ? -1 : 0;
      const ax = cx + dx * (26 + bob);
      const ay = cy + dy * (26 + bob);
      const arrow = (col: string, grow: number) => {
        ctx.fillStyle = col;
        for (let k = 0; k < 9 + grow; k++) {
          const len = Math.max(0, 9 + grow - k);
          if (dx !== 0) ctx.fillRect(ax + dx * (k - grow), ay - len, 1, len * 2 + 1);
          else ctx.fillRect(ax - len, ay + dy * (k - grow), len * 2 + 1, 1);
        }
        // the shaft
        if (dx !== 0) ctx.fillRect(ax - dx * (8 + grow), ay - 3 - grow, 8 + grow, 7 + grow * 2);
        else ctx.fillRect(ax - 3 - grow, ay - dy * (8 + grow), 7 + grow * 2, 8 + grow);
      };
      arrow(OUTLINE, 1);
      arrow('#ff5a4a', 0);
      const label = `${counts[n]}`;
      const tw = textWidth(label, 3);
      const tx = dx !== 0 ? cx + dx * 54 - (dx < 0 ? tw : 0) : cx - tw / 2;
      const ty = dy !== 0 ? cy + dy * 54 - (dy < 0 ? 15 : 0) : cy - 7;
      drawText(ctx, label, Math.round(tx), Math.round(ty), '#ffffff', OUTLINE, 3, 2);
    });
  }

  private drawCraterGlow(): void {
    const ctx = this.ctx;
    const cx = (CRATER.x + 1) * T;
    const cy = (CRATER.y + 1) * T - 6;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 2.2);
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34 + pulse * 8);
    grd.addColorStop(0, `rgba(120,255,90,${0.22 + pulse * 0.18})`);
    grd.addColorStop(1, 'rgba(120,255,90,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(cx - 44, cy - 44, 88, 88);
    ctx.globalCompositeOperation = 'source-over';
    if (Math.random() < 0.08) this.fx.add({ x: cx + (Math.random() - 0.5) * 16, y: cy, vy: -24, color: '#b8ff8a', life: 1.1, size: 2 });
  }

  // ------------------------------------------------------------ ambient life

  private ambient(g: Game | null, dt: number): void {
    const ctx = this.ctx;
    // chimney smoke
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = 0.45;
      this.fx.add({
        kind: 'puff', x: (HOUSE.x + 0.95) * T, y: HOUSE.y * T - 24, vx: 8 + Math.random() * 6, vy: -14,
        size: 5, color: '#e8e4dc', life: 2.2, drag: 0.3,
      });
    }
    // butterflies drift around the meadow
    for (const b of this.butterflies) {
      b.t += dt;
      b.vx += (Math.sin(b.t * 0.7) * 20 - b.vx) * dt;
      b.vy += (Math.cos(b.t * 0.9) * 14 - b.vy) * dt;
      b.x = (b.x + b.vx * dt + WORLD_W) % WORLD_W;
      b.y = Math.min(WORLD_H - 10, Math.max(20, b.y + b.vy * dt));
      const flap = Math.floor(b.t * 12) % 2;
      const x = Math.round(b.x);
      const y = Math.round(b.y + Math.sin(b.t * 5) * 3);
      ctx.fillStyle = b.c;
      if (flap) {
        ctx.fillRect(x - 3, y - 2, 2, 3);
        ctx.fillRect(x + 2, y - 2, 2, 3);
      } else {
        ctx.fillRect(x - 2, y - 1, 1, 2);
        ctx.fillRect(x + 2, y - 1, 1, 2);
      }
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(x, y - 2, 1, 3);
    }
    // the pond twinkles
    const pond = SCENERY.find((o) => o.kind === 'pond');
    if (pond && Math.random() < 0.06) {
      this.fx.add({ kind: 'sparkle', x: (pond.x + 0.4 + Math.random() * 1.2) * T, y: (pond.y + 0.8 + Math.random() * 0.8) * T, life: 0.5, color: '#ffffff' });
    }
    void g;
  }

  // ------------------------------------------------------------ overlays

  private bar(x: number, y: number, w: number, frac: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, w + 2, 5);
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(Math.round(x), Math.round(y), w, 3);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w * Math.max(0, Math.min(1, frac)))), 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w * Math.max(0, Math.min(1, frac)))), 1);
  }

  private drawBars(g: Game): void {
    for (let i = 0; i < g.tiles.length; i++) {
      const t = g.tiles[i];
      const x = tileX(i) * T + 6;
      const y = tileY(i) * T + T - 4;
      if (t.crop) {
        const max = CROPS[t.crop.kind].hp;
        if (t.crop.hp < max - 0.01) this.bar(x, y, 20, t.crop.hp / max, t.crop.hp / max > 0.5 ? '#7ddc4a' : '#f0a030');
        else if (g.phase === 'planning' && t.crop.growth > 0 && g.cropStage(t.crop) < 3) {
          this.bar(x, y, 20, t.crop.growth / CROPS[t.crop.kind].growTime, '#8fd3ff');
        }
      }
      const s = t.structure;
      if (s && s.kind !== 'trap') {
        const max = defenseStats(s.kind, s.level).hp;
        if (s.hp < max - 0.01) this.bar(x, tileY(i) * T - 14, 20, s.hp / max, s.hp / max > 0.5 ? '#c9d6e6' : '#ff6a5a');
      }
    }
    for (const b of g.bunnies) {
      if (b.maxHp > 1 && b.hp < b.maxHp && g.isSurfaced(b)) {
        const def = BUNNIES[b.kind];
        const w = def.boss ? 44 : 20;
        const h = def.boss ? 70 : def.kind === 'fat' ? 42 : 32;
        this.bar(b.x * T - w / 2, b.y * T + 7 - h, w, b.hp / b.maxHp, def.boss ? '#9dff6b' : '#ff6a5a');
      }
    }
  }

  private drawPlanningUnderlay(g: Game, view: View): void {
    const ctx = this.ctx;
    if (view.previewExpand && g.plotLevel < 3) {
      const now = plotRect(g.plotLevel);
      const next = plotRect(g.plotLevel + 1);
      ctx.globalAlpha = 0.45 + 0.15 * Math.sin(this.clock * 5);
      ctx.fillStyle = SOIL.body;
      for (let y = next.y0; y <= next.y1; y++) {
        for (let x = next.x0; x <= next.x1; x++) if (!inRect(now, x, y)) ctx.fillRect(x * T, y * T, T, T);
      }
      ctx.globalAlpha = 1;
    }
    const hovered = view.hoverTile >= 0 ? g.tiles[view.hoverTile].structure : null;
    const showSprinklers = hovered?.kind === 'sprinkler' || (view.selected?.type === 'defense' && view.selected.kind === 'sprinkler');
    if (showSprinklers) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#5fb8f0';
      for (let i = 0; i < g.tiles.length; i++) if (g.growthMult[i] > 1) ctx.fillRect(tileX(i) * T, tileY(i) * T, T, T);
      ctx.globalAlpha = 1;
    }
  }

  private drawPlanningOverlay(g: Game, view: View): void {
    const ctx = this.ctx;
    const i = view.hoverTile;
    if (i >= 0) {
      const s = g.tiles[i].structure;
      if (s && DEFENSES[s.kind].radius > 1 && view.selected?.type !== 'upgrade') {
        this.range(i, defenseStats(s.kind, s.level).radius, '#ffffff');
      }
    }
    if (i < 0 || !view.mouseIn) return;
    const tx = tileX(i) * T;
    const ty = tileY(i) * T;
    const item = view.selected;
    if (!item) {
      if (g.owns(i)) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ffffff';
        this.frame(tx, ty, T, T);
        ctx.globalAlpha = 1;
      }
      return;
    }
    const problem = g.placeProblem(item, i);
    if (item.type === 'upgrade') {
      const s = g.tiles[i].structure;
      if (!s) return;
      ctx.fillStyle = problem ? '#ff4a3a' : '#ffe24a';
      this.frame(tx, ty, T, T);
      this.frame(tx + 1, ty + 1, T - 2, T - 2);
      const label = s.level >= MAX_LEVEL ? 'MAX' : `LV${s.level + 1} ${upgradeCost(s.kind, s.level)}¢`;
      drawText(ctx, label, tx + 16 - (textWidth(label, 2) >> 1), ty - 14, problem ? '#ff9a9a' : '#ffe24a', OUTLINE, 2, 1);
      if (s.level < MAX_LEVEL && DEFENSES[s.kind].radius > 1) this.range(i, defenseStats(s.kind, s.level + 1).radius, '#ffe24a');
      return;
    }
    if (item.type === 'remove') {
      if (problem) return;
      ctx.fillStyle = '#ff4a3a';
      this.frame(tx, ty, T, T);
      this.frame(tx + 1, ty + 1, T - 2, T - 2);
      for (let k = 0; k < 2; k++) {
        pixelLine(ctx, tx + 6 + k, ty + 6, tx + 25 + k, ty + 25);
        pixelLine(ctx, tx + 25 + k, ty + 6, tx + 6 + k, ty + 25);
      }
      const refund = g.removeValue(i);
      const label = refund > 0 ? `+${refund}¢` : '0¢';
      drawText(ctx, label, tx + 16 - (textWidth(label, 2) >> 1), ty - 14, refund > 0 ? '#ffe24a' : '#ffffff', OUTLINE, 2, 1);
      return;
    }
    const icon = placementPreview(item);
    if (!icon) return;
    ctx.globalAlpha = problem ? 0.35 : 0.75;
    if (item.type === 'defense' && item.kind === 'fence') ctx.drawImage(icon, tx, ty - 12);
    else this.blit(icon, tx + T / 2, ty + T - 2, false, 1, 1, problem ? 0.35 : 0.75);
    ctx.globalAlpha = 1;
    ctx.fillStyle = problem ? '#ff4a3a' : '#ffffff';
    this.frame(tx, ty, T, T);
    if (item.type === 'defense' && DEFENSES[item.kind].radius > 1) this.range(i, DEFENSES[item.kind].radius, problem ? '#ff8a7a' : '#ffffff');
  }

  private range(i: number, r: number, color: string): void {
    const ctx = this.ctx;
    const cx = tileX(i) * T + T / 2;
    const cy = tileY(i) * T + T / 2;
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = color;
    pixelDisc(ctx, cx, cy, r * T);
    ctx.globalAlpha = 0.95;
    dottedCircle(ctx, cx, cy, r * T, 5, this.clock * 0.5, 2);
    ctx.globalAlpha = 1;
  }

  private frame(x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
  }

  /** Little gold stars on upgraded defenses. */
  private drawLevels(g: Game): void {
    const ctx = this.ctx;
    for (let i = 0; i < g.tiles.length; i++) {
      const s = g.tiles[i].structure;
      if (!s || s.level < 2) continue;
      const x = tileX(i) * T + 3;
      const y = tileY(i) * T + T - 8;
      for (let k = 0; k < s.level - 1; k++) {
        const sx = x + k * 7;
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(sx - 1, y - 1, 7, 7);
        ctx.fillStyle = '#ffe24a';
        ctx.fillRect(sx + 2, y, 1, 5);
        ctx.fillRect(sx, y + 2, 5, 1);
        ctx.fillRect(sx + 1, y + 1, 3, 3);
        ctx.fillStyle = '#fff6c0';
        ctx.fillRect(sx + 2, y + 1, 1, 1);
      }
      if (s.level >= MAX_LEVEL && Math.sin(this.clock * 3 + i * 2.3) > 0.97) {
        this.fx.add({ kind: 'sparkle', x: tileX(i) * T + 6 + rand(i, 3, 71) * 20, y: tileY(i) * T - 6, life: 0.4, color: '#ffe24a' });
      }
    }
  }

  /** Rain, snow, fog, and falling leaves. */
  private drawWeather(g: Game, dt: number): void {
    const ctx = this.ctx;
    const w = g.phase === 'title' ? 'sunny' : g.weather;
    const want = w === 'rain' ? 160 : w === 'snow' ? 140 : this.season === 'fall' ? 18 : 0;
    const fx = this.weatherFx;
    while (fx.length < want) {
      fx.push({ x: Math.random() * WORLD_W, y: Math.random() * WORLD_H, v: 0.6 + Math.random() * 0.8, s: Math.random(), p: Math.random() * 6 });
    }
    if (fx.length > want) fx.length = want;
    if (w === 'rain') {
      ctx.fillStyle = 'rgba(190, 215, 255, 0.55)';
      for (const d of fx) {
        d.y += 420 * d.v * dt;
        d.x -= 90 * d.v * dt;
        if (d.y > WORLD_H) {
          if (Math.random() < 0.35) this.fx.add({ kind: 'ring', x: d.x, y: WORLD_H * Math.random(), size: 6, color: '#d6e6ff', life: 0.3 });
          d.y = -10;
          d.x = Math.random() * (WORLD_W + 120);
        }
        pixelLine(ctx, d.x, d.y, d.x + 3, d.y - 12);
      }
    } else if (w === 'snow') {
      for (const f of fx) {
        f.p += dt * 2;
        f.y += 34 * f.v * dt;
        f.x += Math.sin(f.p) * 14 * dt;
        if (f.y > WORLD_H) {
          f.y = -4;
          f.x = Math.random() * WORLD_W;
        }
        ctx.fillStyle = f.s > 0.7 ? '#ffffff' : '#e6eef8';
        const size = f.s > 0.6 ? 2 : 1;
        ctx.fillRect(Math.round(f.x), Math.round(f.y), size, size);
      }
    } else if (this.season === 'fall') {
      for (const l of fx) {
        l.p += dt * 3;
        l.y += 26 * l.v * dt;
        l.x += (Math.sin(l.p) * 30 + 12) * dt;
        if (l.y > WORLD_H || l.x > WORLD_W) {
          l.y = -4;
          l.x = Math.random() * WORLD_W;
        }
        ctx.fillStyle = LEAVES[Math.floor(l.s * LEAVES.length)];
        const flip = Math.sin(l.p * 2) > 0;
        ctx.fillRect(Math.round(l.x), Math.round(l.y), flip ? 3 : 2, flip ? 2 : 3);
      }
    }
    if (w === 'fog') {
      this.fogPhase += dt;
      ctx.fillStyle = 'rgba(235, 240, 245, 0.18)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      for (let k = 0; k < 7; k++) {
        const cx = ((rand(k, 1, 81) * WORLD_W + this.fogPhase * (10 + k * 3)) % (WORLD_W + 300)) - 150;
        const cy = rand(k, 2, 81) * WORLD_H;
        const r = 120 + rand(k, 3, 81) * 120;
        const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
        grd.addColorStop(0, 'rgba(240, 244, 248, 0.42)');
        grd.addColorStop(1, 'rgba(240, 244, 248, 0)');
        ctx.fillStyle = grd;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
    if (w === 'rain') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(200, 210, 228)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Time of day: warm morning, clear noon, golden afternoon, violet sundown, blue evening. */
  private drawLight(g: Game, dt: number): void {
    const ctx = this.ctx;
    let target = 0;
    if (g.phase === 'round') target = Math.max(0, (g.time / ROUND_SECONDS - 0.62) / 0.38) * 0.55;
    else if (g.phase === 'sundown') target = 0.85;
    else if (g.phase === 'harvest' || g.phase === 'summary') target = 1;
    this.dusk += (target - this.dusk) * Math.min(1, dt * 1.6);
    // drifting cloud shadows
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x - c.r > WORLD_W) c.x = -c.r;
      const grd = ctx.createRadialGradient(c.x, c.y, c.r * 0.2, c.x, c.y, c.r);
      grd.addColorStop(0, 'rgba(20, 40, 60, 0.10)');
      grd.addColorStop(1, 'rgba(20, 40, 60, 0)');
      ctx.fillStyle = grd;
      ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    }
    if (this.dusk > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      const d = this.dusk;
      const r = Math.round(255 - d * 85);
      const gg = Math.round(255 - d * 125);
      const b = Math.round(255 - d * 60);
      ctx.fillStyle = `rgb(${r},${gg},${b})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.globalCompositeOperation = 'source-over';
      // lamplight in the farmhouse windows as evening falls
      if (d > 0.4) {
        ctx.globalCompositeOperation = 'lighter';
        const a = (d - 0.4) * 0.9;
        for (const [wx, wy] of [[HOUSE.x * T + 26, HOUSE.y * T + 30], [HOUSE.x * T + 60, HOUSE.y * T + 40]]) {
          const grd = ctx.createRadialGradient(wx, wy, 1, wx, wy, 20);
          grd.addColorStop(0, `rgba(255, 200, 90, ${a})`);
          grd.addColorStop(1, 'rgba(255, 200, 90, 0)');
          ctx.fillStyle = grd;
          ctx.fillRect(wx - 20, wy - 20, 40, 40);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    } else if (g.phase === 'round' && g.time < ROUND_SECONDS * 0.15) {
      // soft morning warmth
      ctx.globalAlpha = 0.08 * (1 - g.time / (ROUND_SECONDS * 0.15));
      ctx.fillStyle = '#ffd08a';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.globalAlpha = 1;
    }
    // a gentle vignette
    const v = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.45, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  private drawCrosshair(g: Game, view: View): void {
    this.crosshair(view, g.slingCd / SLING_LEVELS[g.slingLevel].reload);
  }

  /** The sling's sights; `reloading` is 1 just after a shot and 0 when ready. */
  private crosshair(view: View, reloading: number): void {
    const ctx = this.ctx;
    const x = Math.round(view.mouseX);
    const y = Math.round(view.mouseY);
    const ready = reloading <= 0;
    const col = ready ? '#ffffff' : '#a0a0a0';
    const arms: [number, number, number, number][] = [
      [x - 12, y - 1, 7, 2], [x + 6, y - 1, 7, 2], [x - 1, y - 12, 2, 7], [x - 1, y + 6, 2, 7],
    ];
    ctx.fillStyle = OUTLINE;
    for (const [ax, ay, w, h] of arms) ctx.fillRect(ax - 1, ay - 1, w + 2, h + 2);
    ctx.fillRect(x - 2, y - 2, 4, 4);
    ctx.fillStyle = col;
    for (const [ax, ay, w, h] of arms) ctx.fillRect(ax, ay, w, h);
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.globalAlpha = 0.9;
    dottedCircle(ctx, x, y, 9, 4, this.clock * 2, 1);
    ctx.globalAlpha = 1;
    if (!ready) this.bar(x - 11, y + 17, 22, 1 - reloading, '#ffe24a');
  }

  // ------------------------------------------------------------ Classic Mode

  handleClassic(events: ClassicEvent[]): void {
    const fx = this.fx;
    for (const e of events) {
      const x = e.x * T;
      const y = e.y * T;
      switch (e.t) {
        case 'shot':
          fx.streak(WORLD_W / 2, WORLD_H + 4, x, y, '#f4ecd8', 2);
          break;
        case 'miss':
          fx.burst(x, y, 7, ['#a0703f', '#d0a878'], 70, { life: 0.35, size: 2 });
          break;
        case 'hit':
          this.handle([{ t: 'hit', x: e.x, y: e.y }]);
          break;
        case 'kill': {
          const kind = e.kind === 'speedy' ? 'speedy' : e.kind === 'fat' ? 'fat' : 'common';
          this.handle([{ t: 'poof', x: e.x, y: e.y + 0.2, kind }]);
          if (e.kind === 'golden') fx.burst(x, y - 10, 30, ['#ffe24a', '#fff6c0', '#ffffff'], 180, { grav: 60, life: 1, size: 2 });
          fx.text(x, y - 36, `+${e.points}`, e.kind === 'golden' ? '#ffe24a' : '#ffffff', 1);
          break;
        }
        case 'dog':
          fx.text(x, y - 36, 'RUFF! -50', '#ff7a6a', 1.3);
          fx.burst(x, y - 10, 10, ['#ffffff', '#ff7a6a'], 100, { grav: 0, life: 0.4, size: 2 });
          break;
        case 'combo':
          fx.text(x, y - 56, `COMBO X${e.combo}!`, '#ffe24a', 1.4);
          fx.ring(x, y - 10, 60, '#ffe24a', 0.5);
          break;
        case 'popup':
          fx.burst(x, y, 8, ['#a0703f', '#6b4428'], 70, { life: 0.35, size: 2 });
          break;
      }
    }
  }

  renderClassic(c: Classic, view: View, dt: number): void {
    this.clock += dt;
    this.fx.update(dt);
    const ctx = this.ctx;
    this.season = 'spring';
    if (!this.bg || this.bgKey !== '-1:spring') this.buildBackground(-1);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.bg!, 0, 0);
    const hole = sprites().scenery.burrow;
    for (const h of c.holes) this.blit(hole, (h.x + 0.5) * T, (h.y + 0.5) * T + 8);

    const list: Drawable[] = [];
    const shadows: [number, number, number][] = [];
    this.collectScenery(list, shadows);
    const sp = sprites();
    for (const t of c.targets) {
      const px = t.x * T;
      const py = t.y * T + 7;
      const flip = t.vx < 0;
      if (t.kind === 'popup') {
        const rise = Math.min(1, t.age / 0.15, Math.max(0, (t.life - t.age) / 0.15));
        const img = (t.flash > 0 ? sp.bunnies.common.flash : sp.bunnies.common.frames)[t.age % 1 < 0.5 ? 0 : 1];
        list.push({
          y: py,
          draw: () => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(px - 20, py - 60, 40, 60 - 7);
            ctx.clip();
            this.blit(img, px, py - 7 + (1 - rise) * img.height);
            ctx.restore();
          },
        });
        continue;
      }
      if (t.kind === 'dog') {
        const img = sp.dog.run[Math.floor(t.age * 14) % sp.dog.run.length];
        shadows.push([px, py - 1, 9]);
        this.put(list, img, px, py, { flip });
        continue;
      }
      const art = t.kind === 'golden' ? sp.golden : t.kind === 'fat' ? sp.bunnies.fat : t.kind === 'speedy' ? sp.bunnies.speedy : sp.bunnies.common;
      const cycle = t.hop % 1;
      let frame = 0;
      let lift = 0;
      let sx = 1;
      let sy = 1;
      if (art.squash) {
        const s = Math.sin(cycle * Math.PI * 2);
        sy = 1 + s * 0.1;
        sx = 1 - s * 0.07;
        lift = Math.max(0, Math.sin(cycle * Math.PI)) * 6;
      } else {
        frame = Math.floor(cycle * art.frames.length) % art.frames.length;
        lift = frame >= 2 && frame <= 6 ? Math.sin(((frame - 2) / 4) * Math.PI) * 6 : 0;
      }
      const img = t.flash > 0 ? art.flash[frame] : art.frames[frame];
      shadows.push([px, py - 1, Math.max(4, (img.width / 2.6) * (1 - lift / 30))]);
      this.put(list, img, px, py, { flip, sx, sy, lift });
      if (t.kind === 'golden' && Math.random() < 0.5) {
        this.fx.add({ kind: 'sparkle', x: px + (Math.random() - 0.5) * 20, y: py - 10 - Math.random() * 16, life: 0.35, color: '#fff6c0' });
      }
    }
    this.drawShadows(shadows);
    list.sort((p, q) => p.y - q.y);
    for (const d of list) d.draw();
    this.drawCraterGlow();
    this.ambient(null, dt);
    this.fx.draw(ctx);
    // the last ten seconds glow red at the edges
    const left = CLASSIC_SECONDS - c.time;
    const v = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.45, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, left < 10 && !c.done ? `rgba(160,20,10,${0.25 + 0.15 * Math.sin(this.clock * 8)})` : 'rgba(0,0,0,0.22)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    if (view.mouseIn && !c.done) this.crosshair(view, c.reload / CLASSIC_RELOAD);
  }
}

// how each kind of scenery sits on its footprint: nudge down (dy) and shadow width
const SCENERY_PLACE: Record<Scenery['kind'], { dy: number; shadow: number }> = {
  farmhouse: { dy: 4, shadow: 0 },
  crater: { dy: 14, shadow: 0 },
  pond: { dy: 4, shadow: 0 },
  tree_oak: { dy: 4, shadow: 20 },
  tree_apple: { dy: 4, shadow: 20 },
  bush: { dy: 0, shadow: 11 },
  stump: { dy: 0, shadow: 13 },
  haybale: { dy: 0, shadow: 14 },
  rocks: { dy: -6, shadow: 0 },
  flowers: { dy: -4, shadow: 0 },
};

function placementPreview(item: ShopItem): Img | null {
  const sp = sprites();
  if (item.type === 'upgrade' || item.type === 'remove') return null;
  if (item.type === 'crop') return sp.crops[item.kind].ripe;
  if (item.type === 'defense') {
    switch (item.kind) {
      case 'fence': return sp.fence[0];
      case 'trap': return sp.defenses.trapOpen;
      case 'scarecrow': return sp.defenses.scarecrow;
      case 'sprinkler': return sp.defenses.sprinkler;
      case 'turret': return sp.defenses.turret;
      case 'doghouse': return sp.defenses.doghouse;
    }
  }
  return null;
}
