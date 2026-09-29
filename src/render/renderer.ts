// Draws the farm: a textured ground baked once per layout, y-sorted sprites with soft shadows,
// particles, time-of-day lighting, and a little ambient life. World units are 32px tiles.
import {
  BUNNIES, COLS, COMBOS, CROPS, DEFENSES, type DefenseKind, defenseStats, LOT_COUNT, lotPrice, MAX_LEVEL, ROUND_SECONDS, ROWS, type Season, SMOKE_BOMB, TILE, WEAPONS,
  weaponStats,
  upgradeCost, WORLD_H, WORLD_W,
} from '../config';
import type { Classic, ClassicEvent } from '../classic';
import { CLASSIC_RELOAD, CLASSIC_SECONDS } from '../classic';
import type { Game } from '../game';
import { hashSeed } from '../rng';
import type { Bunny, Dog, GameEvent, ShopItem, Structure } from '../types';
import { CRATER, currentMap, idx, inCrater, inMap, lotOfTile, lotRect, SCENERY, type Scenery, tileAt, tileX, tileY, WATER } from '../world';
import { BUNNY_COLORS } from './palette';
import { dottedCircle, Particles, pixelDisc, pixelLine } from './particles';
import { drawText, OUTLINE, PixelGrid, textWidth } from './pixels';
import { menuBunny, merchantCart } from './icons';
import { dither, monoGround } from './mono';
import { type BunnyArt, forSeason, type Img, monoSprites, type SpriteSet, sprites } from './sprites';

let mono = false; // 1993 Mode: black and white
/** The sprites to draw with: in black and white in 1993 Mode. */
const sheet = (): SpriteSet => (mono ? monoSprites() : sprites());

let tagIcon: Img | null = null;
const menuBunnyIcon = (): Img => (tagIcon ??= menuBunny());

export interface View {
  mouseX: number; // world pixels
  mouseY: number;
  mouseIn: boolean;
  hoverTile: number; // -1 when off the map
  selected: ShopItem | null;
}

interface Drawable {
  y: number;
  draw: () => void;
}

const T = TILE;
/** The opening: when the asteroid starts to fall, when it lands, and when it's over. */
const INTRO = { fall: 0.9, impact: 2.3, end: 6.2 };

const SMOKE = ['#7c7c86', '#8e8e98', '#a4a4ae', '#b8b8c2']; // smoke-bomb smoke, darkest to lightest

/** Crumbs a nibbling bunny sends flying, by crop. */
const CRUMBS: Record<string, string[]> = {
  radish: ['#d2334a', '#f0e6e8', '#5fb04a'], lettuce: ['#7ac74f', '#b8e88a'], carrot: ['#f28b2a', '#ffb45a', '#5fb04a'],
  sunflower: ['#f2c23a', '#7a4f2e'], corn: ['#f2d04a', '#fff08a', '#7ac74f'], tomato: ['#e0402c', '#ff7a5a', '#5fb04a'],
  strawberry: ['#e03050', '#ff8a9a', '#5fb04a'], pumpkin: ['#e8802a', '#ffb060'], watermelon: ['#e0404a', '#4aa03a', '#1a1423'],
  golden: ['#ffd84a', '#fff6c8', '#ffffff'],
};

/** Take `bites` round bites out of a sprite's edge, and outline where the bites were. */
function biteOut(src: Img, bites: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const w = c.width;
  const h = c.height;
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 <= x0) return c;
  const r = Math.max(3, Math.round((x1 - x0) * 0.22));
  const spots = [[x1 + 1, y0 + (y1 - y0) * 0.3], [x0 - 1, y0 + (y1 - y0) * 0.55]].slice(0, bites);
  const gone = new Uint8Array(w * h);
  for (const [cx, cy] of spots) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h || Math.hypot(x - cx, y - cy) > r) continue;
        const o = (y * w + x) * 4;
        if (d[o + 3] === 0) continue;
        d[o + 3] = 0;
        gone[y * w + x] = 1;
      }
    }
  }
  // a dark edge along each bite, like the sprite's own outline
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (d[o + 3] === 0) continue;
      const by = (dx: number, dy: number) => x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h && gone[(y + dy) * w + x + dx];
      if (by(1, 0) || by(-1, 0) || by(0, 1) || by(0, -1)) {
        d[o] = 0x1a;
        d[o + 1] = 0x14;
        d[o + 2] = 0x23;
      }
    }
  }
  ctx.putImageData(im, 0, 0);
  return c;
}
/** Deterministic noise in [0,1). hashSeed alone leaves streaks down the columns, so mix it well. */
function rand(a: number, b: number, n: number): number {
  let h = hashSeed(a, b, n);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- palette for the ground

// close tones, so the ground stays quiet and everything standing on it reads
const GRASS_BY_SEASON: Record<Season, string[]> = {
  spring: ['#5a9a3a', '#64a640', '#6eb045', '#79ba4b', '#86c653'],
  summer: ['#63922d', '#6e9f32', '#7aab38', '#87b73f', '#96c448'],
  fall: ['#767a31', '#818637', '#8e913c', '#9b9b42', '#aaa64a'],
  winter: ['#c6d3e1', '#d2dde9', '#dde6f0', '#e8eff6', '#f3f7fb'],
};
const LEAVES = ['#e0892e', '#c9562a', '#f2c14e', '#a8412a'];
const BLADE_DARK = '#3f7a2b';
const BLADE_LIGHT = '#a9e06a';
const SOIL = { hi: '#86593a', body: '#744c31', mid: '#69442b', furrow: '#573823', deep: '#442b1a', clod: '#8f6443' };
const RIVER = { deep: '#2c6aa0', body: '#3a80bb', light: '#62a6dc', foam: '#cfeaff', bank: '#a88b58', mud: '#6e5a3a' };
const RIVER_WINTER = { deep: '#5a8fb8', body: '#78a8cc', light: '#a8cce6', foam: '#f2faff', bank: '#b8a888', mud: '#7c6c52' };
const BRIDGE = { plank: '#9a6a3c', light: '#b8834e', gap: '#5e3c20', rail: '#6e4626', post: '#4e301a' };
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
  readonly canvas: HTMLCanvasElement; // the one on the page: a whole-number multiple of the world
  private world: HTMLCanvasElement; // where everything is drawn, one pixel per art pixel
  private ctx: CanvasRenderingContext2D;
  private out: CanvasRenderingContext2D;
  zoom = 1;
  private mono: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; data: ImageData; px: Uint32Array } | null = null;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private meadow: HTMLCanvasElement | null = null; // the grass layer, one per season
  private meadowKey = '';
  private soilTiles: HTMLCanvasElement[] = [];
  private shade: CanvasPattern | null = null; // 1993 Mode's shade for land not yet bought
  private comboAt = new Map<string, number>(); // when a combo last popped at a spot
  private celebrateAt = -1; // when the victory began (renderer clock), or -1
  private introAt = -1; // when the opening began (renderer clock), or -1
  private introBoom = false;
  private shake = 0; // 0..1: how hard the ground's jumping
  private flash = 0; // 0..1: a white flash over everything
  private lastGame: Game | null = null;
  private bites = new Map<Img, Img[]>(); // crop sprites with bites out of them
  private capLanded = true;
  private season: Season = 'spring';
  private weatherFx: { x: number; y: number; v: number; s: number; p: number }[] = [];
  private fogPhase = 0;
  readonly fx = new Particles();
  private clock = 0;
  private dusk = 0;
  private night = 0; // 1 during The Last Night
  private clouds = Array.from({ length: 4 }, (_, i) => ({
    x: rand(i, 1, 5) * WORLD_W, y: rand(i, 2, 5) * WORLD_H, r: 90 + rand(i, 3, 5) * 90, v: 6 + rand(i, 4, 5) * 6,
  }));
  private butterflies = Array.from({ length: 4 }, (_, i) => ({
    x: rand(i, 7, 9) * WORLD_W, y: rand(i, 8, 9) * WORLD_H, t: rand(i, 9, 9) * 10, c: FLOWERS[i % FLOWERS.length],
    vx: (rand(i, 10, 9) - 0.5) * 30, vy: (rand(i, 11, 9) - 0.5) * 20,
  }));
  private rest = { x: -99, y: -99, since: 0 }; // where the mouse settled, for the hover label

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.world = document.createElement('canvas');
    this.ctx = this.newWorld(false);
    this.out = canvas.getContext('2d', { alpha: false })!;
    this.setZoom(1);
  }

  private newWorld(readBack: boolean): CanvasRenderingContext2D {
    this.world = document.createElement('canvas');
    this.world.width = WORLD_W;
    this.world.height = WORLD_H;
    // a frame that gets read back every time is quicker kept in memory than on the graphics card
    const ctx = this.world.getContext('2d', { willReadFrequently: readBack })!;
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  get monochrome(): boolean {
    return mono;
  }

  /** 1993 Mode: the farm is drawn just the same, then dithered to black and white on its way to the page. */
  setMonochrome(on: boolean): void {
    if (on === mono) return;
    mono = on;
    this.ctx = this.newWorld(on);
    this.mono = null;
    this.bg = null; // the ground gets redrawn to suit
    this.bgKey = '';
    this.soilTiles = [];
    if (!on) return;
    const canvas = document.createElement('canvas');
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.createImageData(WORLD_W, WORLD_H);
    this.mono = { canvas, ctx, data, px: new Uint32Array(data.data.buffer) };
  }

  /** The finished frame, in black and white if it's 1993. */
  private finished(): HTMLCanvasElement {
    const m = this.mono;
    if (!m) return this.world;
    try {
      dither(this.ctx.getImageData(0, 0, WORLD_W, WORLD_H).data, m.px, WORLD_W, WORLD_H);
    } catch {
      // the browser won't hand back pixels (a page opened from disk with loose image files): stay in color
      this.setMonochrome(false);
      return this.world;
    }
    m.ctx.putImageData(m.data, 0, 0);
    return m.canvas;
  }

  /** Size the page canvas so every art pixel becomes a `zoom` x `zoom` block of device pixels. */
  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.canvas.width = WORLD_W * zoom;
    this.canvas.height = WORLD_H * zoom;
  }

  /** Copy the finished frame to the page, blocky. */
  private present(): void {
    const frame = this.finished();
    this.out.imageSmoothingEnabled = false;
    if (this.shake > 0) {
      // the ground jumps: whole art pixels only
      const z = this.canvas.width / WORLD_W;
      const dx = Math.round((Math.random() - 0.5) * 6 * this.shake) * z;
      const dy = Math.round((Math.random() - 0.5) * 6 * this.shake) * z;
      this.out.fillStyle = '#000';
      this.out.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.out.drawImage(frame, dx, dy, this.canvas.width, this.canvas.height);
      return;
    }
    this.out.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
  }

  // ------------------------------------------------------------ the opening: the night the asteroid came down

  /** Seconds into the opening, or -1 when it isn't playing. */
  get introTime(): number {
    return this.introAt < 0 ? -1 : this.clock - this.introAt;
  }

  startIntro(): void {
    this.introAt = this.clock;
    this.introBoom = false;
    this.fx.clear();
  }

  stopIntro(): void {
    this.introAt = -1;
    this.shake = 0;
    this.flash = 0;
  }

  private drawIntro(dt: number): void {
    const t = this.introTime;
    if (t < 0) return;
    if (t > INTRO.end) {
      this.stopIntro();
      return;
    }
    const ctx = this.ctx;
    const cx = (CRATER.x + 1) * T;
    const cy = (CRATER.y + 1) * T - 6;
    // night, lifting a while after the impact
    const lift = Math.max(0, Math.min(1, (t - INTRO.impact - 1.3) / 1.9));
    const night = 0.84 * (1 - lift);
    if (night > 0) {
      ctx.fillStyle = `rgba(8, 14, 44, ${night})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.globalAlpha = night / 0.84;
      for (let n = 0; n < 80; n++) {
        if (Math.sin(this.clock * 3 + n * 1.7) < -0.5) continue;
        ctx.fillStyle = n % 6 ? '#dfe8ff' : '#fff6c8';
        ctx.fillRect(Math.floor(rand(n, 1, 91) * WORLD_W), Math.floor(rand(n, 2, 91) * WORLD_H * 0.75), 1, 1);
      }
      ctx.globalAlpha = 1;
      this.fx.draw(ctx); // sparks and debris shine through the dark
    }
    if (t < INTRO.impact) {
      // the asteroid, coming in fast and green over the treetops
      const k = Math.max(0, (t - INTRO.fall) / (INTRO.impact - INTRO.fall));
      if (k > 0) {
        const e = k * k;
        const x = -60 + (cx + 60) * e;
        const y = -90 + (cy + 90) * e;
        for (let n = 0; n < 4; n++) {
          this.fx.add({
            x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: -60 - Math.random() * 60, vy: -80 - Math.random() * 50,
            color: n === 0 ? '#ffffff' : n === 1 ? '#fff1a8' : '#9dff6b', life: 0.5 + Math.random() * 0.3, size: 2,
          });
        }
        ctx.globalCompositeOperation = 'lighter';
        const grd = ctx.createRadialGradient(x, y, 1, x, y, 26);
        grd.addColorStop(0, 'rgba(160,255,120,0.9)');
        grd.addColorStop(1, 'rgba(120,255,90,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(x - 26, y - 26, 52, 52);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#2a3326';
        pixelDisc(ctx, x, y, 5);
        ctx.fillStyle = '#9dff6b';
        pixelDisc(ctx, x - 1, y - 1, 2);
      }
      if (t > 0.4) this.caption('Autumn, 1993.', Math.min(1, (t - 0.4) * 2));
    } else if (!this.introBoom) {
      // impact
      this.introBoom = true;
      this.shake = 1;
      this.flash = 1;
      this.fx.burst(cx, cy, 90, ['#6b4a2a', '#8a6a3a', '#9dff6b', '#ffffff', '#3a2a1a'], 260, { grav: 180, life: 1.4, size: 3 });
      for (let n = 0; n < 24; n++) this.fx.puff(cx + (Math.random() - 0.5) * 80, cy + (Math.random() - 0.5) * 30, 14, n % 2 ? '#8a7a64' : '#a8987e', 1.6);
      this.fx.ring(cx, cy, 120, '#fff6c8', 0.7);
      this.fx.ring(cx, cy, 70, '#9dff6b', 0.9);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 240, ${this.flash})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      this.flash = Math.max(0, this.flash - dt * 1.4);
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (t > INTRO.impact + 1.2) this.caption('Years later...', Math.min(1, (t - INTRO.impact - 1.2) * 1.5) * Math.min(1, (INTRO.end - t) * 2));
  }

  /** Big white pixel words low in the middle of the field. */
  private caption(text: string, alpha: number): void {
    const w = textWidth(text) * 2;
    this.ctx.globalAlpha = Math.max(0, alpha);
    drawText(this.ctx, text, Math.round(WORLD_W / 2 - w / 2), Math.round(WORLD_H * 0.78), '#ffffff', OUTLINE, 2);
    this.ctx.globalAlpha = 1;
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
        case 'fire':
          if (e.weapon === 'sling' || e.weapon === 'pellet') {
            // a pebble (or a pellet) whips in from the porch
            fx.streak(WORLD_W / 2, WORLD_H + 4, x, y, e.weapon === 'sling' ? '#f4ecd8' : '#ffe98a', e.weapon === 'sling' ? 2 : 1);
            if (!e.hit) {
              fx.burst(x, y, e.weapon === 'sling' ? 7 : 3, ['#a0703f', '#d0a878'], 70, { life: 0.3, size: e.weapon === 'sling' ? 2 : 1 });
              if (e.weapon === 'sling') fx.puff(x, y, 4, '#e8dcc4', 0.3);
            }
          } else {
            // a thump from the porch as the potato or firework goes up
            for (let i = 0; i < 4; i++) fx.puff(WORLD_W / 2, WORLD_H - 6, 6, e.weapon === 'rocket' ? '#fff0c0' : '#e8dcc4', 0.4);
          }
          break;
        case 'blast':
          if (e.weapon === 'spud') {
            fx.burst(x, y, 22, ['#c8964a', '#e8c890', '#8a5a2a', '#fff6d8'], 150, { grav: 160, life: 0.55, size: 2 });
            for (let i = 0; i < 5; i++) fx.puff(x, y + 2, 7, '#d8c8a8', 0.5);
            fx.ring(x, y, e.r * T, '#e8c890', 0.35);
            fx.text(x, y - 22, 'SPLAT', '#fff0c0', 0.6);
          } else {
            // a firework: a bright starburst in three colors, sparks falling
            const colors = [['#ff5a5a', '#ffd84a', '#ffffff'], ['#5ad0ff', '#c8a0ff', '#ffffff'], ['#7aff6a', '#ffd84a', '#ffffff']][
              Math.floor(Math.random() * 3)];
            fx.burst(x, y - 6, 60, colors, 260 * Math.min(1.4, e.r / 1.4), { grav: 70, life: 0.9, size: 2, drag: 2.5 });
            fx.ring(x, y - 6, e.r * T, colors[0], 0.45);
            for (let i = 0; i < 12; i++) fx.add({ kind: 'sparkle', x: x + (Math.random() - 0.5) * e.r * T * 1.4, y: y - 6 + (Math.random() - 0.5) * e.r * T, life: 0.6, color: '#ffffff' });
            fx.text(x, y - 34, 'BOOM!', colors[1], 0.8);
          }
          break;
        case 'clang':
          fx.burst(x, y - 20, 9, ['#ffffff', '#fff6a0', '#cdd4de'], 150, { grav: 60, life: 0.3, size: 1 });
          fx.text(x, y - 36, 'CLANG', '#cdd4de', 0.6);
          break;
        case 'potOff':
          // the pot goes spinning off
          fx.add({ x, y: y - 20, vx: (Math.random() < 0.5 ? -1 : 1) * 70, vy: -120, grav: 320, size: 5, color: '#8f98a6', life: 0.9 });
          break;
        case 'thunk':
          fx.burst(x, y + 4, 12, ['#a0703f', '#6b4428', '#d0a878'], 110, { life: 0.4, size: 2 });
          break;
        case 'thump':
          fx.ring(x, y + 6, e.r * T, '#d8c8a8', 0.4);
          for (let i = 0; i < 6; i++) fx.puff(x + (Math.random() - 0.5) * 20, y + 12, 6, '#d8c8a8', 0.45);
          break;
        case 'sting':
          for (let i = 0; i < 4; i++) {
            fx.add({ kind: 'dot', x: x + (Math.random() - 0.5) * 20, y: y - 14 + (Math.random() - 0.5) * 14, color: i % 2 ? '#1e1e28' : '#ffd84a', life: 0.35, size: 2 });
          }
          fx.text(x, y - 34, 'BZZT', '#ffd84a', 0.5);
          break;
        case 'steal':
          fx.text(x, y - 36, 'YOINK!', '#ff9a6a', 0.9);
          fx.burst(x, y, 10, ['#a0703f', '#6b4428'], 90, { life: 0.4, size: 2 });
          break;
        case 'drop':
          fx.text(x, y - 30, 'SAVED!', '#7aff6a', 1);
          for (let i = 0; i < 6; i++) fx.add({ kind: 'sparkle', x: x + (Math.random() - 0.5) * 20, y: y - 10 - Math.random() * 14, life: 0.5, color: '#ffffff' });
          break;
        case 'till':
          fx.burst(x, y + 2, 10, ['#8d5835', '#5d361f', '#b47a4a'], 80, { life: 0.4, size: 2 });
          break;
        case 'buyLand':
          fx.text(x, y - 12, 'SOLD!', '#ffe24a', 1.2);
          for (let n = 0; n < 16; n++) {
            this.fx.add({ kind: 'sparkle', x: x + (Math.random() - 0.5) * T * 4, y: y + (Math.random() - 0.5) * T * 4, life: 0.5 + Math.random() * 0.4, color: '#ffffff' });
          }
          break;
        case 'zap':
          fx.burst(x, y - 8, 6, ['#bfe6ff', '#ffffff', '#fff6a0'], 120, { grav: 0, life: 0.2, size: 1 });
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
        case 'chomp': {
          // crumbs the color of whatever's being eaten
          const crop = this.lastGame?.tiles[tileAt(e.x, e.y + 0.3)]?.crop ?? this.lastGame?.tiles[tileAt(e.x, e.y)]?.crop;
          const colors = crop ? CRUMBS[crop.kind] : ['#5fb04a', '#a9e06a'];
          fx.burst(x + (Math.random() - 0.5) * 12, y - 4, 5, colors, 70, { grav: 140, life: 0.45, size: 2 });
          break;
        }
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
        case 'combo': {
          // not too chatty: one pop per spot every second and a half
          const key = `${Math.round(x / T)},${Math.round(y / T)}`;
          if ((this.comboAt.get(key) ?? -9) > this.clock - 1.5) break;
          this.comboAt.set(key, this.clock);
          fx.text(x, y - 30, 'COMBO!', '#ffe24a', 0.8);
          fx.burst(x, y - 10, 10, ['#ffe24a', '#ffffff'], 90, { grav: 0, life: 0.4, size: 2 });
          break;
        }
        case 'order':
          fx.text(x, y - 20, `ORDER FILLED! +${e.amount}¢`, '#ffe24a', 2.2);
          fx.burst(x, y - 10, 50, ['#ffe24a', '#ff6a5a', '#8fd3ff', '#7ddc4a', '#ffffff'], 190, { grav: 70, life: 1.3, size: 2 });
          break;
        case 'golden':
          for (let n = 0; n < 12; n++) {
            this.fx.add({ kind: 'sparkle', x: x + (Math.random() - 0.5) * T * 2, y: y + (Math.random() - 0.5) * T, life: 0.6, color: '#fff1a8' });
          }
          break;
        case 'prize':
          fx.ring(x, y - 8, 40, '#ffe24a', 0.7);
          fx.burst(x, y - 10, 36, ['#ffe24a', '#fff1a8', '#ffffff', '#f2c23a'], 170, { grav: 50, life: 1, size: 2 });
          fx.text(x, y - 40, e.short, '#ffe24a', 1.8);
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
        case 'dodge':
          for (let i = 0; i < 5; i++) fx.puff(x, y - 8, 4, '#e8e8f0', 0.3);
          fx.text(x, y - 34, 'DODGE', '#d0d4ff', 0.7);
          break;
        case 'brood':
          fx.burst(x, y, 14, ['#a0703f', '#6b4428', '#c2a8ee'], 90, { life: 0.5, size: 2 });
          break;
        case 'smoke': {
          // the bomb goes in with a whump, and grey smoke boils up out of the hole
          const cy = y - 6;
          fx.ring(x, cy, 56, '#c8c8d0', 0.6);
          for (let i = 0; i < 16; i++) {
            fx.add({
              kind: 'puff', x: x + (Math.random() - 0.5) * 30, y: cy + (Math.random() - 0.5) * 10,
              vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40, size: 7 + Math.random() * 6,
              color: SMOKE[i % SMOKE.length], life: 1 + Math.random() * 0.6, drag: 1.5,
            });
          }
          fx.text(x, cy - 34, 'FWOOMP', '#e0e0e8', 1.1);
          break;
        }
        case 'project': {
          const cx = (CRATER.x + 1) * T;
          const cy = (CRATER.y + 1) * T - 6;
          fx.burst(cx, cy, 50, ['#9aa3b0', '#c79a6a', '#9dff6b'], 170, { grav: 90, life: 1, size: 2 });
          for (let i = 0; i < 10; i++) fx.puff(cx, cy + 8, 9, '#d8cbb0', 0.8);
          fx.ring(cx, cy, 70, '#9dff6b', 0.7);
          break;
        }
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------ frame

  render(g: Game, view: View, dt: number): void {
    this.clock += dt;
    this.lastGame = g;
    this.fx.update(dt);
    const ctx = this.ctx;
    const title = g.phase === 'title';
    this.season = title ? 'spring' : g.season;
    const key = `${currentMap()}:${title ? 'title' : g.tillEpoch}:${this.season}`;
    if (!this.bg || this.bgKey !== key) this.buildBackground(title ? null : g.tilled, key);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.bg!, 0, 0);

    if (!title) this.drawBurrows(g);
    if (g.phase === 'planning') this.drawPlanningUnderlay(g, view);

    // everything standing on the ground: shadows first, then sprites back to front
    const list: Drawable[] = [];
    const shadows: [number, number, number][] = [];
    this.collectScenery(list, shadows);
    if (!title) this.collectCraterWorks(g, list);
    if (!title) this.collectCart(g, list, shadows);
    this.collectTiles(g, list, shadows);
    for (const b of g.bunnies) this.collectBunny(g, b, list, shadows);
    for (const d of g.dogs) this.collectDog(d, list, shadows);
    for (const d of g.dogs) this.drawLeash(d);
    this.drawShadows(shadows);
    list.sort((p, q) => p.y - q.y);
    for (const d of list) d.draw();

    if (title || !g.sealed) this.drawCraterGlow(title ? 0 : g.project);
    else if (this.celebrateAt >= 0 && !this.capLanded) {
      // the last of the glow, going out as the cap comes down
      this.ctx.globalAlpha = Math.max(0, 1 - (this.clock - this.celebrateAt) / 1.8);
      this.drawCraterGlow(g.project);
      this.ctx.globalAlpha = 1;
    }
    if (g.phase === 'victory') this.fireworks();
    if (!title) this.smokeCrater(g);
    if (!title) this.drawWeatherEvent(g);
    for (const p of g.projectiles) this.drawPebble(p.x * T, p.y * T);
    this.drawShells(g);
    this.drawHose(g);
    this.ambient(g, dt);
    this.fx.draw(ctx);
    this.drawBars(g);
    this.drawLevels(g);
    if (g.phase === 'planning') {
      this.drawLand(g, view);
      this.drawBurrowTags(g);
      this.drawPlanningOverlay(g, view);
    }
    this.drawWeather(g, dt);
    this.drawLight(g, view, dt);
    if ((g.phase === 'round' || g.phase === 'sundown') && view.mouseIn) this.drawCrosshair(g, view);
    if (!title) this.drawHoverLabel(g, view);
    this.drawIntro(dt);
    this.present();
  }

  /** Blank the effects between games. */
  reset(): void {
    this.fx.clear();
    this.dusk = 0;
    this.night = 0;
    this.celebrateAt = -1;
    this.capLanded = true;
  }

  // ------------------------------------------------------------ the ground

  /**
   * The ground: the season's meadow, with tilled soil stamped onto every tilled tile. The meadow is cached,
   * so tilling a tile (which rebuilds this) stays quick even while you drag the hoe along a row.
   */
  private buildBackground(tilled: Uint8Array | null, key: string): void {
    const c = document.createElement('canvas');
    c.width = WORLD_W;
    c.height = WORLD_H;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(this.meadowFor(this.season), 0, 0);
    this.paintRiver(ctx);
    if (tilled) {
      const winter = this.season === 'winter';
      if (this.soilTiles.length === 0) this.soilTiles = [0, 1, 2, 3].map((v) => this.soilTile(v));
      const soil = (x: number, y: number) => inMap(x, y) && tilled[idx(x, y)] === 1;
      for (let i = 0; i < tilled.length; i++) {
        if (!tilled[i]) continue;
        const tx = tileX(i);
        const ty = tileY(i);
        const px = tx * T;
        const py = ty * T;
        ctx.drawImage(this.soilTiles[hashSeed(tx, ty, 5) % 4], px, py);
        // a darker rim wherever the soil meets grass
        const rim = (x: number, y: number, w: number, h: number, ox: number, oy: number) => {
          ctx.fillStyle = SOIL.deep;
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = SOIL.furrow;
          ctx.fillRect(x + ox, y + oy, w, h);
        };
        if (!soil(tx, ty - 1)) rim(px, py, T, 2, 0, 2);
        if (!soil(tx, ty + 1)) rim(px, py + T - 2, T, 2, 0, -2);
        if (!soil(tx - 1, ty)) rim(px, py, 2, T, 2, 0);
        if (!soil(tx + 1, ty)) rim(px + T - 2, py, 2, T, -2, 0);
        if (winter) {
          // frost on the furrow tops
          for (let n = 0; n < 12; n++) {
            ctx.fillStyle = n % 3 ? '#e8f0f8' : '#ffffff';
            ctx.fillRect(px + Math.floor(rand(i, n, 61) * (T - 2)), py + Math.floor(rand(i, n, 62) * 4) * 8, 2, 1);
          }
        }
      }
      // grass spilling over the soil's edges, so the fields sit in the meadow instead of on it
      if (!winter) {
        for (let i = 0; i < tilled.length; i++) {
          if (!tilled[i]) continue;
          const px = tileX(i) * T;
          const py = tileY(i) * T;
          for (let k = 0; k < T; k += 3) {
            if (!soil(tileX(i), tileY(i) - 1) && rand(px + k, py, 41) < 0.7) this.tuft(ctx, px + k, py + 1, px + k);
            if (!soil(tileX(i), tileY(i) + 1) && rand(px + k, py, 42) < 0.5) this.tuft(ctx, px + k, py + T + 3, px + k + 7);
            if (!soil(tileX(i) - 1, tileY(i)) && rand(px, py + k, 43) < 0.5) this.tuft(ctx, px - 1, py + k + 3, py + k);
            if (!soil(tileX(i) + 1, tileY(i)) && rand(px, py + k, 44) < 0.5) this.tuft(ctx, px + T + 1, py + k + 3, py + k + 3);
          }
        }
      }
    }
    if (mono) monoGround(c);
    this.bg = c;
    this.bgKey = key;
  }

  /** River Bend's river: water with ripples and muddy banks, and plank bridges where it can be crossed. */
  private paintRiver(ctx: CanvasRenderingContext2D): void {
    const c = this.season === 'winter' ? RIVER_WINTER : RIVER;
    const wet = (x: number, y: number) => !inMap(x, y) || WATER[idx(x, y)] > 0;
    for (let i = 0; i < WATER.length; i++) {
      if (!WATER[i]) continue;
      const tx = tileX(i);
      const ty = tileY(i);
      const px = tx * T;
      const py = ty * T;
      ctx.fillStyle = c.body;
      ctx.fillRect(px, py, T, T);
      // slow ripples and darker eddies
      for (let n = 0; n < 7; n++) {
        const rx = px + Math.floor(rand(i, n, 71) * (T - 6));
        const ry = py + Math.floor(rand(i, n, 72) * (T - 2));
        ctx.fillStyle = n % 3 ? c.light : c.deep;
        ctx.fillRect(rx, ry, 3 + Math.floor(rand(i, n, 73) * 4), 1);
      }
      // banks: mud, then a line of foam where the water meets land
      const bank = (x: number, y: number, w: number, h: number, fx: number, fy: number, fw: number, fh: number) => {
        ctx.fillStyle = c.bank;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = c.mud;
        ctx.fillRect(fx, fy, fw, fh);
      };
      if (!wet(tx, ty - 1)) { bank(px, py, T, 3, px, py + 3, T, 1); ctx.fillStyle = c.foam; ctx.fillRect(px, py + 4, T, 1); }
      if (!wet(tx, ty + 1)) { bank(px, py + T - 3, T, 3, px, py + T - 4, T, 1); ctx.fillStyle = c.foam; ctx.fillRect(px, py + T - 5, T, 1); }
      if (!wet(tx - 1, ty)) { bank(px, py, 3, T, px + 3, py, 1, T); ctx.fillStyle = c.foam; ctx.fillRect(px + 4, py, 1, T); }
      if (!wet(tx + 1, ty)) { bank(px + T - 3, py, 3, T, px + T - 4, py, 1, T); ctx.fillStyle = c.foam; ctx.fillRect(px + T - 5, py, 1, T); }
      if (WATER[i] === 2) this.paintBridge(ctx, px, py, wet(tx, ty - 1) || wet(tx, ty + 1));
    }
  }

  /** Planks across a river tile. `across` means the river runs up and down here, so the bridge runs left to right. */
  private paintBridge(ctx: CanvasRenderingContext2D, px: number, py: number, across: boolean): void {
    // work in "along the bridge" (u) and "across the deck" (v) so both directions share one drawing
    const at = (u: number, v: number, w: number, h: number) =>
      (across ? ctx.fillRect(px + u, py + v, w, h) : ctx.fillRect(px + v, py + u, h, w));
    const deck0 = 5;
    const deck1 = T - 5;
    ctx.fillStyle = BRIDGE.plank;
    at(0, deck0, T, deck1 - deck0);
    for (let u = 0; u < T; u += 4) {
      ctx.fillStyle = BRIDGE.gap;
      at(u, deck0, 1, deck1 - deck0);
      ctx.fillStyle = BRIDGE.light;
      at(u + 1, deck0, 1, 2);
    }
    // rails along both edges, with posts at the ends
    ctx.fillStyle = BRIDGE.rail;
    at(0, deck0 - 2, T, 2);
    at(0, deck1, T, 2);
    ctx.fillStyle = BRIDGE.post;
    for (const u of [1, T - 4]) {
      at(u, deck0 - 4, 3, 4);
      at(u, deck1, 3, 4);
    }
  }

  /** The meadow for a season: soft patches of grass, tufts, clover and flowers (leaves in fall, snow in winter). */
  private meadowFor(season: Season): HTMLCanvasElement {
    if (this.meadow && this.meadowKey === season) return this.meadow;
    const c = document.createElement('canvas');
    c.width = WORLD_W;
    c.height = WORLD_H;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(WORLD_W, WORLD_H);
    const data = img.data;
    const grass = GRASS_BY_SEASON[season].map(hexRGB);
    const winter = season === 'winter';
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const o = (y * WORLD_W + x) * 4;
        // big soft patches of lighter and darker grass, dithered into 5 tones
        const v = valueNoise(x, y, 110, 1) * 0.65 + valueNoise(x, y, 34, 2) * 0.35;
        const d = BAYER[(y & 3) * 4 + (x & 3)] * 0.07;
        let col = grass[Math.max(0, Math.min(4, Math.floor((v + d - 0.2) * 6.2) + 1))];
        if (winter) {
          // thin spots where the grass shows through, feathered with dither instead of hard-edged
          const thin = valueNoise(x, y, 30, 6) * 0.75 + valueNoise(x, y, 9, 7) * 0.25 + BAYER[(y & 3) * 4 + (x & 3)] * 0.1;
          if (thin < 0.17) col = [128, 154, 112];
          else if (thin < 0.21) col = [172, 190, 168];
        }
        data[o] = col[0];
        data[o + 1] = col[1];
        data[o + 2] = col[2];
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    for (let n = 0; n < (winter ? 140 : 380); n++) {
      const x = Math.floor(rand(n, 1, 21) * WORLD_W);
      const y = Math.floor(rand(n, 2, 21) * WORLD_H);
      const r = rand(n, 3, 21);
      if (winter) {
        ctx.fillStyle = r < 0.5 ? '#9fb0a0' : '#c3d0dc';
        ctx.fillRect(x, y - 2, 1, 2);
        ctx.fillRect(x + 2, y - 1, 1, 1);
      } else if (r < 0.62) this.tuft(ctx, x, y, n);
      else if (r < 0.82) this.clover(ctx, x, y);
      else if (season === 'fall') {
        ctx.fillStyle = LEAVES[Math.floor(rand(n, 4, 21) * LEAVES.length)];
        ctx.fillRect(x, y, 2, 1);
        ctx.fillRect(x + 1, y - 1, 1, 1);
      } else this.flower(ctx, x, y, FLOWERS[Math.floor(rand(n, 4, 21) * FLOWERS.length)]);
    }
    this.meadow = c;
    this.meadowKey = season;
    return c;
  }

  /** One tile of tilled soil: four raised furrows, a few clods. */
  private soilTile(variant: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = T;
    c.height = T;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < T; y++) {
      const row = y % 8;
      for (let x = 0; x < T; x++) {
        const n = rand(x + variant * 97, y, 31);
        if (mono) {
          // plowed rows in black and white: a wide lit ridge, shading down into the furrow's line
          const dark = row < 4 ? false : row === 4 ? (x + y) % 4 === 0 : row === 6 || (x + y) % 2 === 0;
          ctx.fillStyle = (n < 0.02 ? false : n > 0.98 ? true : dark) ? '#000000' : '#ffffff';
          ctx.fillRect(x, y, 1, 1);
          continue;
        }
        let col = row === 0 ? SOIL.hi : row < 4 ? SOIL.body : row < 6 ? SOIL.mid : SOIL.furrow;
        if (n < 0.02) col = SOIL.clod;
        else if (n > 0.98) col = SOIL.deep;
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  /** A quarter of the pixels black, in a diagonal lattice. */
  private dots(): CanvasPattern {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 4, 4);
    ctx.fillStyle = '#000000';
    for (const [x, y] of [[0, 0], [2, 0], [1, 2], [3, 2]]) ctx.fillRect(x, y, 1, 1);
    return this.ctx.createPattern(c, 'repeat')!;
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
    flip?: boolean; alpha?: number; sort?: number; lift?: number;
  } = {}): void {
    const { flip = false, alpha = 1, lift = 0 } = opts;
    list.push({
      y: opts.sort ?? y,
      draw: () => this.blit(img, x, y - lift, flip, alpha),
    });
  }

  /** Sprites land on whole art pixels and are never scaled, so every pixel stays the same size. */
  private blit(img: Img, x: number, y: number, flip = false, alpha = 1): void {
    const ctx = this.ctx;
    const left = Math.round(x - img.width / 2);
    const top = Math.round(y - img.height);
    ctx.globalAlpha = alpha;
    if (!flip) {
      ctx.drawImage(img, left, top);
    } else {
      ctx.save();
      ctx.translate(left + img.width, top);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Where a hopping bunny is in its jump: which frame, and how high off the ground. */
  private hopPose(art: BunnyArt, cycle: number, height: number): { frame: number; lift: number } {
    if (art.squash) {
      // one pose: crouched as it lands and takes off, stretched on the way up
      const frame = cycle > 0.9 || cycle < 0.06 ? 1 : cycle < 0.32 ? 2 : 0;
      return { frame, lift: frame === 1 ? 0 : Math.round(Math.sin(cycle * Math.PI) * height) };
    }
    const frame = Math.floor(cycle * art.frames.length) % art.frames.length;
    return { frame, lift: frame >= 2 && frame <= 6 ? Math.round(Math.sin(((frame - 2) / 4) * Math.PI) * 6) : 0 };
  }

  /** The merchant's cart, parked by the farm for the morning. */
  private collectCart(g: Game, list: Drawable[], shadows: [number, number, number][]): void {
    const i = g.merchantTile();
    if (i < 0) return;
    const cx = tileX(i) * T + T / 2;
    const by = tileY(i) * T + T - 2;
    shadows.push([cx, by - 1, 15]);
    this.put(list, merchantCart(), cx, by, { sort: by - 1 });
    if (Math.sin(this.clock * 3) > 0.9) this.fx.add({ kind: 'sparkle', x: cx + (Math.random() - 0.5) * 24, y: by - 22, life: 0.4, color: '#ffe24a' });
  }

  private collectScenery(list: Drawable[], shadows: [number, number, number][]): void {
    const sc = sheet().scenery;
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
    const sp = sheet();
    for (let i = 0; i < g.tiles.length; i++) {
      const t = g.tiles[i];
      const cx = tileX(i) * T + T / 2;
      const by = tileY(i) * T + T;
      if (t.crop) {
        const c = t.crop;
        const stage = g.cropStage(c);
        const whole = stage === 0 ? sp.seed : stage === 1 ? sp.sprout : stage === 2 ? sp.crops[c.kind].young : sp.crops[c.kind].ripe;
        const shake = c.shake > 0 ? Math.round(Math.sin(this.clock * 60)) : 0;
        // eaten down: a bite out of it, then two
        const left = c.hp / CROPS[c.kind].hp;
        const img = stage >= 2 && left <= 0.67 ? this.bitten(whole, left <= 0.34 ? 2 : 1) : whole;
        this.put(list, img, cx + shake, by - 2, { sort: by - 3 });
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
    const d = sheet().defenses;
    const shake = s.shake > 0 ? Math.round(Math.sin(this.clock * 70)) : 0;
    const x = cx + shake;
    switch (s.kind) {
      case 'fence': {
        const tx = tileX(i);
        const ty = tileY(i);
        const f = (dx: number, dy: number) =>
          inMap(tx + dx, ty + dy) && g.tiles[idx(tx + dx, ty + dy)].structure?.kind === 'fence';
        const mask = (f(0, -1) ? 1 : 0) | (f(1, 0) ? 2 : 0) | (f(0, 1) ? 4 : 0) | (f(-1, 0) ? 8 : 0);
        const img = sheet().fence[mask];
        shadows.push([cx + 3, by - 6, 8]);
        list.push({ y: by - 4, draw: () => this.ctx.drawImage(img, tx * T + shake, ty * T - 12) });
        return;
      }
      case 'trap':
        // flat on the ground: under everything else
        list.push({ y: by - 30, draw: () => this.blit(s.cd > 0 ? d.trapShut : d.trapOpen, x, by - 4) });
        return;
      case 'scarecrow': {
        // a scare is a little jig: hops and spins, in whole pixels
        const scaring = s.anim < 0.6;
        shadows.push([cx + 4, by - 4, 11]);
        this.put(list, d.scarecrow, x, by - 1, {
          flip: scaring && Math.floor(s.anim * 10) % 2 === 1,
          lift: scaring ? Math.round(Math.abs(Math.sin(s.anim * 20)) * 3) : 0,
        });
        return;
      }
      case 'turret': {
        const fired = s.anim < 0.18; // kicks back a pixel
        shadows.push([cx + 4, by - 4, 11]);
        this.put(list, d.turret, x, by - 1, { lift: fired ? -1 : 0 });
        return;
      }
      case 'sprinkler': {
        // turns while the sun is up, whirls right after it soaks a bunny
        shadows.push([cx + 1, by - 5, 10]);
        const live = g.phase === 'round' || g.phase === 'sundown';
        const spin = sheet().sprinklerSpin;
        const f = live ? Math.floor(this.clock * (s.anim < 0.6 ? 18 : 6) + i) % spin.length : 0;
        this.put(list, spin[f], x, by - 2);
        if (live && Math.random() < 0.2) {
          const a = Math.random() * Math.PI * 2;
          this.fx.add({
            x: cx + Math.cos(a) * 10, y: by - 21 + Math.sin(a) * 4, vx: Math.cos(a) * 36, vy: Math.sin(a) * 14 - 28,
            grav: 120, color: Math.random() < 0.3 ? '#ffffff' : '#8fd3ff', life: 0.45,
          });
        }
        return;
      }
      case 'doghouse':
        shadows.push([cx + 4, by - 4, 16]);
        this.put(list, d.doghouse, x, by);
        return;
      case 'thumper': {
        // the weight comes down with a bang, then hauls back up
        shadows.push([cx + 2, by - 4, 11]);
        this.put(list, s.anim < 0.3 ? d.thumperDown : d.thumperUp, x, by + 1);
        return;
      }
      case 'decoy':
        shadows.push([cx + 2, by - 3, 6]);
        this.put(list, d.decoy, x, by - 1, { alpha: s.hp < defenseStats('decoy', s.level).hp * 0.35 ? 0.8 : 1 });
        return;
      case 'beehive': {
        shadows.push([cx + 3, by - 4, 11]);
        this.put(list, d.beehive, x, by);
        list.push({ y: by + 0.2, draw: () => this.bees(cx, by - 14, i) });
        return;
      }
    }
  }

  /** A few bees buzzing lazy loops round their hive. */
  private bees(cx: number, cy: number, seed: number): void {
    const ctx = this.ctx;
    for (let k = 0; k < 4; k++) {
      const t = this.clock * (1.3 + k * 0.4) + seed + k * 1.7;
      const x = Math.round(cx + Math.cos(t) * (7 + k * 2) + Math.sin(t * 2.3) * 2);
      const y = Math.round(cy + Math.sin(t * 1.3) * (4 + k) - k);
      ctx.fillStyle = '#1e1e28';
      ctx.fillRect(x, y, 2, 1);
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(x + 1, y, 1, 1);
      if (Math.floor(this.clock * 20 + k) % 2) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y - 1, 1, 1);
      }
    }
  }

  private collectBunny(g: Game, b: Bunny, list: Drawable[], shadows: [number, number, number][]): void {
    const def = BUNNIES[b.kind];
    if (def.golden && Math.random() < 0.5) {
      // a trail of glitter behind the golden bunny
      this.fx.add({ kind: 'sparkle', x: b.x * T + (Math.random() - 0.5) * 12, y: b.y * T - 4 + (Math.random() - 0.5) * 10, life: 0.45, color: '#fff1a8' });
    }
    // a Pot-Head whose pot got knocked off is just a bunny
    const art = b.kind === 'pothead' && b.armor <= 0 ? sheet().bunnies.common : sheet().bunnies[b.kind];
    let px = b.x * T;
    let py = b.y * T + 7;
    if (b.state === 'eat') {
      px += b.ox * T;
      py += b.oy * T;
    }
    if (!g.isSurfaced(b)) {
      const wob = b.moving ? Math.round(Math.sin(this.clock * 22 + b.id)) : 0;
      shadows.push([px, py - 2, 9]);
      this.put(list, sheet().mound, px + wob, py);
      if (b.moving && Math.random() < 0.3) {
        this.fx.add({ x: px, y: py - 4, vx: (Math.random() - 0.5) * 60, vy: -40, grav: 160, color: '#a0703f', life: 0.35, size: 2 });
      }
      return;
    }
    const flip = b.facing < 0;
    const flash = b.flash > 0;
    let frame = 0;
    let lift = 0;
    if (def.digger && b.popped > 0 && b.state !== 'eat') {
      // up out of its tunnel: standing in its own little hole, looking around
      this.put(list, sheet().mound, px, py + 3, { sort: py - 1 });
      frame = Math.floor(this.clock * 3 + b.id) % 2;
    } else if (b.state === 'eat' || b.state === 'chew') {
      frame = Math.floor(this.clock * 4 + b.id) % 2 === 0 ? art.eat[0] : art.eat[1];
    } else if (b.moving) {
      ({ frame, lift } = this.hopPose(art, b.hop % 1, def.boss ? 10 : 6));
      // a Leaper clears whatever defense it's over in one big bound
      if (def.leaps) {
        const s = g.tiles[idx(Math.floor(b.x), Math.floor(b.y))]?.structure;
        if (s && DEFENSES[s.kind].blocks) lift += 12;
      }
    } else if (!art.squash) {
      // idle: the occasional twitch
      frame = Math.sin(this.clock * 1.7 + b.id * 3) > 0.93 ? 1 : 0;
    }
    const img = flash ? art.flash[frame] : art.frames[frame];
    const running = b.moving && (b.state === 'flee' || b.state === 'exit' || b.state === 'spooked');
    if (running && b.fed && !def.boss && !def.golden) {
      // full: a heavier hop, and a waddle from side to side
      lift = Math.round(lift * 0.6);
      px += Math.floor(this.clock * 6 + b.id) % 2 ? 1 : -1;
      if (Math.random() < 0.004) this.fx.puff(px + 4 * b.facing, py - img.height + 6, 3, '#ffffff', 0.5);
    } else if (running && !def.golden) {
      // scared: motion lines streaming off behind it
      const back = -b.facing;
      const t = Math.floor(this.clock * 12 + b.id);
      list.push({
        y: py + 0.4,
        draw: () => {
          this.ctx.fillStyle = 'rgba(255,255,255,0.85)';
          for (let k = 0; k < 3; k++) {
            const len = 4 + ((t + k) % 3) * 2;
            const x0 = Math.round(px + back * (img.width / 2 + 2 + ((t + k * 2) % 4)));
            this.ctx.fillRect(back > 0 ? x0 : x0 - len, Math.round(py - 6 - k * 5 - lift), len, 1);
          }
        },
      });
      if (b.state === 'spooked' && Math.random() < 0.02) {
        this.fx.add({ x: px - 3 * back, y: py - img.height - lift, vx: back * 20, vy: -30, grav: 120, color: '#8fd3ff', life: 0.5, size: 2 });
      }
    }
    const shadowW = (img.width / 2.6) * (1 - lift / 30);
    shadows.push([px, py - 1, Math.max(4, shadowW)]);
    if (def.boss) {
      list.push({ y: py - 0.5, draw: () => this.bossGlow(px, py - 22) });
    }
    // a bunny at a crop draws in front of it, so you can see who's eating
    const sort = b.state === 'eat' ? Math.max(py, (Math.floor(b.y) + 1) * T) : py;
    this.put(list, img, px, py, { flip, lift, sort });
    if (b.carry) {
      // a Bandit runs with its loot held up over its head
      const loot = sheet().crops[b.carry.crop.kind].ripe;
      const bob = Math.round(Math.sin(this.clock * 12 + b.id));
      this.put(list, loot, px, py - img.height + 10 - lift + bob, { sort: sort + 0.1 });
    }
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
      const mark = exclaim();
      list.push({ y: py + 1, draw: () => this.ctx.drawImage(mark, Math.round(px - mark.width / 2), Math.round(py - img.height - 12 - lift)) });
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
    const dog = sheet().dog;
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

  /** Potatoes and fireworks arcing out from the porch toward where they'll land. */
  private drawShells(g: Game): void {
    const ctx = this.ctx;
    for (const sh of g.shells) {
      const t = 1 - Math.max(0, sh.t) / sh.flight; // 0 at launch, 1 on landing
      const x0 = WORLD_W / 2;
      const y0 = WORLD_H + 8;
      const tx = sh.x * T;
      const ty = sh.y * T;
      const x = Math.round(x0 + (tx - x0) * t);
      const y = Math.round(y0 + (ty - y0) * t - Math.sin(t * Math.PI) * (sh.weapon === 'rocket' ? 90 : 60));
      // where it's coming down
      ctx.globalAlpha = 0.25 + t * 0.35;
      ctx.fillStyle = '#1c280c';
      this.ellipse(tx, ty, 2 + t * 5, 1 + t * 2);
      ctx.globalAlpha = 1;
      if (sh.weapon === 'spud') {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(x - 3, y - 2, 7, 5);
        ctx.fillStyle = '#c8964a';
        ctx.fillRect(x - 2, y - 1, 5, 3);
        ctx.fillStyle = '#e8c890';
        ctx.fillRect(x - 2, y - 1, 2, 1);
      } else {
        ctx.fillStyle = OUTLINE;
        ctx.fillRect(x - 2, y - 4, 5, 9);
        ctx.fillStyle = '#d8322a';
        ctx.fillRect(x - 1, y - 3, 3, 6);
        ctx.fillStyle = '#ffd84a';
        ctx.fillRect(x - 1, y - 4, 3, 1);
        if (Math.random() < 0.8) this.fx.add({ kind: 'sparkle', x, y: y + 6, life: 0.3, color: Math.random() < 0.5 ? '#ffd84a' : '#ffffff' });
      }
    }
  }

  /** The garden hose, from the porch to wherever it's pointed, with spray flying off the end. */
  private drawHose(g: Game): void {
    const aim = g.hoseAim;
    if (!aim || g.weapon !== 'hose' || (g.phase !== 'round' && g.phase !== 'sundown')) return;
    const ctx = this.ctx;
    const x0 = WORLD_W / 2 - 40;
    const y0 = WORLD_H + 4;
    const tx = aim.x * T;
    const ty = aim.y * T;
    const steps = Math.max(8, Math.floor(Math.hypot(tx - x0, ty - y0) / 3));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      // the stream sags a little and wobbles
      const x = Math.round(x0 + (tx - x0) * t + Math.sin(this.clock * 30 + k) * 0.6);
      const y = Math.round(y0 + (ty - y0) * t - Math.sin(t * Math.PI) * 18);
      ctx.fillStyle = '#5aaee8';
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = k % 3 === 0 ? '#ffffff' : '#bfe6ff';
      ctx.fillRect(x, y - 1, 1, 1);
    }
    const r = weaponStats('hose', g.weapons.hose).radius * T;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add({
        x: tx, y: ty, vx: Math.cos(a) * r * 2.2, vy: Math.sin(a) * r * 1.2 - 30, grav: 160, drag: 3,
        color: i % 2 ? '#ffffff' : '#8fd3ff', life: 0.35,
      });
    }
    if (Math.random() < 0.25) this.fx.add({ kind: 'splash', x: tx + (Math.random() - 0.5) * r, y: ty + (Math.random() - 0.5) * r * 0.6, color: '#d6e6ff', life: 0.3 });
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
    const mound = sheet().scenery.burrow;
    const planning = g.phase === 'planning';
    const counts = g.burrowCounts();
    g.burrows.forEach((b, n) => {
      const cx = b.x * T + T / 2;
      const cy = b.y * T + T / 2;
      this.blit(mound, cx, cy + 8);
      // the way in: a dark opening in the dirt
      ctx.fillStyle = '#3a2416';
      this.ellipse(cx, cy + 3, 7, 4);
      ctx.fillStyle = '#120a06';
      this.ellipse(cx, cy + 4, 5, 2.5);
      const left = counts[n];
      if (left <= 0) return;
      // somebody's home: ears poke up out of the hole now and then
      const peek = Math.sin(this.clock * 1.8 + n * 1.7);
      if (planning && peek > 0.2) this.ears(cx, cy + 3, Math.round((peek - 0.2) * 9));
    });
  }

  /** The head-count tags go on top of everything, so trees and houses can't hide them. */
  private drawBurrowTags(g: Game): void {
    const counts = g.burrowCounts();
    g.burrows.forEach((b, n) => {
      if (counts[n] > 0) this.burrowTag(b.x, b.y, b.x * T + T / 2, b.y * T + T / 2, counts[n], n);
    });
  }

  private ellipse(cx: number, cy: number, rx: number, ry: number): void {
    const ctx = this.ctx;
    const r = Math.ceil(ry);
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
      if (w > 0) ctx.fillRect(Math.round(cx) - w, Math.round(cy) + dy, w * 2, 1);
    }
  }

  /** Two bunny ears rising `h` pixels out of a hole. */
  private ears(cx: number, cy: number, h: number): void {
    if (h <= 0) return;
    const ctx = this.ctx;
    for (const ex of [cx - 4, cx + 1]) {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(ex - 1, cy - h - 1, 5, h + 1);
      ctx.fillStyle = '#9c6b4c';
      ctx.fillRect(ex, cy - h, 3, h);
      ctx.fillStyle = '#f29bb0';
      if (h > 3) ctx.fillRect(ex + 1, cy - h + 1, 1, h - 2);
    }
  }

  /** A little System 7 tag, "(bunny) ×6", pointing at the burrow it belongs to. */
  private burrowTag(bx: number, by: number, cx: number, cy: number, count: number, n: number): void {
    const ctx = this.ctx;
    const icon = menuBunnyIcon();
    const label = `×${count}`;
    const w = 3 + icon.width + 3 + textWidth(label) + 5;
    const h = 22;
    const dx = bx === 0 ? 1 : bx === COLS - 1 ? -1 : 0;
    const dy = by === 0 ? 1 : by === ROWS - 1 ? -1 : 0;
    const bob = Math.round(Math.sin(this.clock * 3 + n) * 1.5);
    let x: number;
    let y: number;
    if (dx !== 0) {
      x = dx > 0 ? cx + 20 : cx - 20 - w;
      y = cy - h / 2 + bob;
    } else {
      x = cx - w / 2;
      y = dy > 0 ? cy + 16 + bob : cy - 18 - h + bob;
    }
    x = Math.round(Math.max(2, Math.min(WORLD_W - w - 4, x)));
    y = Math.round(Math.max(2, Math.min(WORLD_H - h - 4, y)));
    // drop shadow, frame, paper
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 2, y + 2, w, h);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 1, y, w - 2, h);
    ctx.fillRect(x, y + 1, w, h - 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // the pointer toward the hole
    const tip = (px: number, py: number, ox: number, oy: number) => {
      for (let k = 0; k < 6; k++) {
        const len = 5 - k;
        ctx.fillStyle = '#000000';
        if (ox !== 0) ctx.fillRect(px + ox * k, py - len - 1, 1, len * 2 + 3);
        else ctx.fillRect(px - len - 1, py + oy * k, len * 2 + 3, 1);
        if (len > 0) {
          ctx.fillStyle = '#ffffff';
          if (ox !== 0) ctx.fillRect(px + ox * k, py - len, 1, len * 2 + 1);
          else ctx.fillRect(px - len, py + oy * k, len * 2 + 1, 1);
        }
      }
    };
    if (dx > 0) tip(x, y + h / 2, -1, 0);
    else if (dx < 0) tip(x + w - 1, y + h / 2, 1, 0);
    else if (dy > 0) tip(Math.round(Math.max(x + 8, Math.min(x + w - 9, cx))), y, 0, -1);
    else tip(Math.round(Math.max(x + 8, Math.min(x + w - 9, cx))), y + h - 1, 0, 1);
    ctx.drawImage(icon, x + 3, y + 3);
    drawText(ctx, label, x + 3 + icon.width + 3, y + 8, '#000000', null);
  }

  /** A crop sprite with one or two bites out of its edge, the bites outlined like the rest of it. */
  private bitten(src: Img, bites: number): Img {
    let set = this.bites.get(src);
    if (!set) {
      set = [src, biteOut(src, 1), biteOut(src, 2)];
      this.bites.set(src, set);
    }
    return set[bites];
  }

  /** Today's event, over the field: a dry cast for a drought, and hail when it comes. */
  private drawWeatherEvent(g: Game): void {
    const ctx = this.ctx;
    if (g.event?.kind === 'drought') {
      ctx.fillStyle = 'rgba(255, 206, 110, 0.13)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    if (g.hail > 0) {
      ctx.fillStyle = 'rgba(150, 170, 200, 0.18)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      for (let n = 0; n < 22; n++) {
        // each stone a two-pixel pellet with a faint trail above it
        const x = Math.random() * WORLD_W;
        const y = Math.random() * WORLD_H * 0.85;
        const life = 0.12 + Math.random() * 0.1;
        this.fx.add({ kind: 'dot', x, y, vx: -40, vy: 460, color: n % 3 ? '#f4f9ff' : '#c8dcf2', size: 2, life });
        this.fx.add({ kind: 'dot', x: x + 1, y: y - 4, vx: -40, vy: 460, color: '#a8c0dc', size: 1, life });
      }
      for (let n = 0; n < 3; n++) this.fx.add({ kind: 'sparkle', x: Math.random() * WORLD_W, y: Math.random() * WORLD_H, life: 0.2, color: '#ffffff' });
    }
  }

  /** A smoke bomb went in: grey smoke keeps rolling out until the Buck does. */
  private smokeCrater(g: Game): void {
    if (!g.smoking || Math.random() > 0.28) return;
    // a thick column, leaning back over the field (the crater sits near the edge of the map)
    this.fx.add({
      kind: 'puff', x: (CRATER.x + 1) * T + (Math.random() - 0.5) * 20, y: (CRATER.y + 1) * T - 10,
      vx: -5 + (Math.random() - 0.5) * 8, vy: -16 - Math.random() * 14, size: 6 + Math.random() * 6,
      color: SMOKE[Math.floor(Math.random() * SMOKE.length)], life: 2 + Math.random(), drag: 0.25,
    });
  }

  /** The crater's glow, brighter and busier the angrier it is. */
  private drawCraterGlow(anger: number): void {
    const ctx = this.ctx;
    const cx = (CRATER.x + 1) * T;
    const cy = (CRATER.y + 1) * T - 6;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * (2.2 + anger * 0.8));
    const r = (34 + pulse * 8) * (1 + anger * 0.2);
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grd.addColorStop(0, `rgba(120,255,90,${0.22 + pulse * 0.18 + anger * 0.07})`);
    grd.addColorStop(1, 'rgba(120,255,90,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
    if (Math.random() < 0.08 * (1 + anger)) {
      this.fx.add({ x: cx + (Math.random() - 0.5) * 16, y: cy, vy: -24 - anger * 8, color: '#b8ff8a', life: 1.1, size: 2 });
    }
  }

  /** The Crater Project going up: survey stakes, then a concrete collar, then the cap hanging ready. */
  private collectCraterWorks(g: Game, list: Drawable[]): void {
    if (g.project <= 0) return;
    const img = sheet().scenery.crater;
    const by = (CRATER.y + CRATER.h) * T;
    const top = by + SCENERY_PLACE.crater.dy - img.height;
    const cx = (CRATER.x + 1) * T;
    const cy = top + 31; // the middle of the rim
    const ring = (rx: number, ry: number, n: number, phase: number) => Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2 + phase;
      return [Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry)] as [number, number];
    }).sort((p, q) => p[1] - q[1]);
    const ctx = this.ctx;
    list.push({
      y: by - 0.5, // right after the crater itself
      draw: () => {
        if (g.project >= 2) {
          // a concrete collar around the lip of the hole
          for (const [x, y] of ring(29, 19, 18, 0)) {
            ctx.fillStyle = OUTLINE;
            ctx.fillRect(x - 3, y - 2, 7, 5);
            ctx.fillStyle = '#9ea3ab';
            ctx.fillRect(x - 2, y - 1, 5, 3);
            ctx.fillStyle = '#d5d8de';
            ctx.fillRect(x - 2, y - 1, 5, 1);
          }
        }
        // survey stakes on the rim, strung together
        const stakes = ring(38, 25, 10, 0.3);
        const around = [...stakes].sort((p, q) => Math.atan2(p[1] - cy, (p[0] - cx) / 1.5) - Math.atan2(q[1] - cy, (q[0] - cx) / 1.5));
        ctx.fillStyle = '#f4ecd8';
        around.forEach(([x, y], k) => {
          const [nx, ny] = around[(k + 1) % around.length];
          pixelLine(ctx, x, y - 5, nx, ny - 5);
        });
        for (const [x, y] of stakes) {
          ctx.fillStyle = OUTLINE;
          ctx.fillRect(x - 1, y - 8, 3, 9);
          ctx.fillRect(x + 1, y - 9, 5, 4);
          ctx.fillStyle = '#d9a066';
          ctx.fillRect(x, y - 7, 1, 7);
          ctx.fillStyle = '#ff7a1a';
          ctx.fillRect(x + 1, y - 8, 4, 2);
        }
        if (g.lastNight) this.drawCap(cx, top, 0);
        else if (g.sealed) this.drawCap(cx, top, this.capDrop(cx, cy));
      },
    });
  }

  /** How far down the cap is (0 hanging, 1 home). It comes down when the crater is sealed, with a thud of dust. */
  private capDrop(cx: number, cy: number): number {
    if (this.celebrateAt < 0) return 1;
    const t = Math.min(1, (this.clock - this.celebrateAt - 0.4) / 1.4);
    if (t >= 1 && !this.capLanded) {
      this.capLanded = true;
      for (let n = 0; n < 16; n++) this.fx.puff(cx + (Math.random() - 0.5) * 70, cy + 6, 10, n % 2 ? '#c8b89a' : '#a8987a', 0.9);
      this.fx.ring(cx, cy, 60, '#e8dcc0', 0.6);
    }
    return Math.max(0, t) ** 2; // slow, then down it comes
  }

  /** The victory: the cap goes on, then fireworks. */
  celebrate(): void {
    this.celebrateAt = this.clock;
    this.capLanded = false;
  }

  private fireworks(): void {
    if (this.celebrateAt < 0 || this.clock - this.celebrateAt < 2 || Math.random() > 0.1) return;
    const x = (3 + Math.random() * 16) * T;
    const y = (1.5 + Math.random() * 5.5) * T;
    const shells = [['#ff5a5a', '#ffd0d0'], ['#5ab8ff', '#d0ecff'], ['#ffe24a', '#fff6c8'], ['#7ddc4a', '#d8ffc8'], ['#e07aff', '#f6d8ff']];
    const [a, b] = shells[Math.floor(Math.random() * shells.length)];
    this.fx.burst(x, y, 60, [a, b, '#ffffff'], 190, { grav: 45, life: 1.3, size: 3 });
    this.fx.burst(x, y, 20, ['#ffffff'], 60, { grav: 20, life: 0.5, size: 2 });
    this.fx.ring(x, y, 44, a, 0.55);
  }

  /** The cap, hanging on chains over the crater waiting for dawn (drop 0), or home on the rim (drop 1). */
  private drawCap(cx: number, top: number, drop: number): void {
    const ctx = this.ctx;
    const hang = top - 18 + (drop > 0 ? 0 : Math.sin(this.clock * 1.4) * 2);
    const y = Math.round(hang + (top + 36 - hang) * drop); // home: right over the hole
    ctx.fillStyle = '#5d6470';
    if (drop < 1) {
      for (const dx of [-20, 0, 20]) {
        for (let k = 0; k < 22; k++) {
          const t = k / 22;
          ctx.globalAlpha = (1 - t) * (1 - drop);
          ctx.fillRect(Math.round(cx + dx * (1 - t * 0.7)), y - 4 - k * 3, 2, 2);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = OUTLINE;
    this.ellipse(cx, y + 3, 34, 14);
    ctx.fillStyle = '#5d6470';
    this.ellipse(cx, y + 3, 33, 13);
    ctx.fillStyle = '#9aa3b0';
    this.ellipse(cx, y, 33, 11);
    ctx.fillStyle = '#c3cad4';
    this.ellipse(cx - 8, y - 3, 14, 3);
    ctx.fillStyle = '#5d6470';
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(a) * 28), Math.round(y + Math.sin(a) * 8), 1, 1);
    }
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(cx - 6, y - 5, 12, 4);
    ctx.fillStyle = '#c3cad4';
    ctx.fillRect(cx - 5, y - 4, 10, 2);
  }

  // ------------------------------------------------------------ ambient life

  private ambient(g: Game | null, dt: number): void {
    const ctx = this.ctx;
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
    // the pond and the river twinkle
    const pond = SCENERY.find((o) => o.kind === 'pond');
    if (pond && Math.random() < 0.06) {
      this.fx.add({ kind: 'sparkle', x: (pond.x + 0.4 + Math.random() * 1.2) * T, y: (pond.y + 0.8 + Math.random() * 0.8) * T, life: 0.5, color: '#ffffff' });
    }
    if (currentMap() === 'river' && Math.random() < 0.3) {
      const i = Math.floor(Math.random() * WATER.length);
      if (WATER[i] === 1) {
        this.fx.add({ kind: 'sparkle', x: (tileX(i) + 0.2 + Math.random() * 0.6) * T, y: (tileY(i) + 0.3 + Math.random() * 0.4) * T, life: 0.45, color: '#ffffff' });
      }
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
        const h = sheet().bunnies[b.kind].frames[0].height + (def.boss ? 12 : 6);
        this.bar(b.x * T - w / 2, b.y * T + 7 - h, w, b.hp / b.maxHp, def.boss ? '#9dff6b' : '#ff6a5a');
      }
    }
  }

  private drawPlanningUnderlay(g: Game, view: View): void {
    const ctx = this.ctx;
    const hovered = view.hoverTile >= 0 ? g.tiles[view.hoverTile].structure : null;
    const showSprinklers = hovered?.kind === 'sprinkler' || (view.selected?.type === 'defense' && view.selected.kind === 'sprinkler');
    if (showSprinklers) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#5fb8f0';
      for (let i = 0; i < g.tiles.length; i++) if (g.sprinklerGrowth(i) > 1) ctx.fillRect(tileX(i) * T, tileY(i) * T, T, T);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Planning: land that isn't yours goes dark. Lots for sale get a dotted outline, and with the land tool in
   * hand the lot under the mouse lights up with its price.
   */
  private drawLand(g: Game, view: View): void {
    const ctx = this.ctx;
    const hoverLot = view.selected?.type === 'land' && view.hoverTile >= 0 ? lotOfTile(view.hoverTile) : -1;
    const bomb = view.selected?.type === 'smoke';
    ctx.globalCompositeOperation = 'multiply';
    // land that isn't yours yet sits in shade; in black and white, a sprinkling of dots
    ctx.fillStyle = mono ? (this.shade ??= this.dots()) : 'rgb(118, 122, 150)';
    for (let y = 0; y < ROWS; y++) {
      let run = -1;
      for (let x = 0; x <= COLS; x++) {
        const i = idx(Math.min(x, COLS - 1), y);
        const dark = x < COLS && !g.owns(i) && !(hoverLot >= 0 && lotOfTile(i) === hoverLot) && !(bomb && inCrater(i));
        if (dark && run < 0) run = x;
        if (!dark && run >= 0) {
          ctx.fillRect(run * T, y * T, (x - run) * T, T);
          run = -1;
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // dotted outlines round the lots still for sale
    ctx.fillStyle = '#ffffff';
    for (let n = 0; n < LOT_COUNT; n++) {
      if (g.lots[n]) continue;
      const r = lotRect(n);
      const x0 = r.x0 * T;
      const y0 = r.y0 * T;
      const w = (r.x1 - r.x0 + 1) * T;
      const h = (r.y1 - r.y0 + 1) * T;
      ctx.globalAlpha = n === hoverLot ? 1 : 0.22;
      for (let k = 0; k < w; k += 4) {
        ctx.fillRect(x0 + k, y0, 2, 1);
        ctx.fillRect(x0 + k, y0 + h - 1, 2, 1);
      }
      for (let k = 0; k < h; k += 4) {
        ctx.fillRect(x0, y0 + k, 1, 2);
        ctx.fillRect(x0 + w - 1, y0 + k, 1, 2);
      }
    }
    ctx.globalAlpha = 1;
    if (hoverLot >= 0 && !g.lots[hoverLot]) {
      const r = lotRect(hoverLot);
      const price = lotPrice(g.lotsBought);
      this.tag(`BUY THIS LOT: ${price}¢`, (r.x0 + r.x1 + 1) / 2 * T, (r.y0 + r.y1 + 1) / 2 * T + 6, g.credits < price ? '#b0281c' : '#000000');
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
      if (s && !view.selected) this.drawCombos(g, i, s.kind, s.level);
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
    if (item.type === 'land') return; // the whole lot lights up instead
    if (item.type === 'smoke') {
      if (!inCrater(i)) return;
      ctx.fillStyle = problem ? '#ff4a3a' : '#ffffff';
      this.frame((CRATER.x - 1) * T, (CRATER.y - 1) * T, (CRATER.w + 2) * T, (CRATER.h + 2) * T);
      this.tag(problem ? problem.replace(/\.$/, '').toUpperCase() : `THROW IT IN: ${SMOKE_BOMB}¢`, (CRATER.x + 1) * T,
        (CRATER.y - 1) * T - 2, problem ? '#b0281c' : '#000000');
      return;
    }
    if (item.type === 'till') {
      // a patch of soil where the hoe would go
      if (!problem) {
        ctx.globalAlpha = 0.7;
        if (this.soilTiles.length === 0) this.soilTiles = [0, 1, 2, 3].map((v) => this.soilTile(v));
        ctx.drawImage(this.soilTiles[0], tx, ty);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = problem ? '#ff4a3a' : '#ffffff';
      this.frame(tx, ty, T, T);
      return;
    }
    if (item.type === 'crop' && problem && g.owns(i) && !g.tilled[i] && !g.tiles[i].crop && !g.tiles[i].structure) {
      ctx.fillStyle = '#ff4a3a';
      this.frame(tx, ty, T, T);
      this.tag('TILL FIRST (H)', tx + T / 2, ty - 3, '#b0281c');
      return;
    }
    if (item.type === 'upgrade') {
      const s = g.tiles[i].structure;
      if (!s) return;
      ctx.fillStyle = problem ? '#ff4a3a' : '#ffe24a';
      this.frame(tx, ty, T, T);
      this.frame(tx + 1, ty + 1, T - 2, T - 2);
      const label = s.level >= MAX_LEVEL ? 'MAX LEVEL' : `LEVEL ${s.level + 1}: ${upgradeCost(s.kind, s.level)}¢`;
      this.tag(label, tx + T / 2, ty - 3, problem ? '#b0281c' : '#000000');
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
      this.tag(refund > 0 ? `SELL +${refund}¢` : 'CLEAR', tx + T / 2, ty - 3, '#000000');
      return;
    }
    const icon = placementPreview(item);
    if (!icon) return;
    ctx.globalAlpha = problem ? 0.35 : 0.75;
    if (item.type === 'defense' && item.kind === 'fence') ctx.drawImage(icon, tx, ty - 12);
    else this.blit(icon, tx + T / 2, ty + T - 2, false, problem ? 0.35 : 0.75);
    ctx.globalAlpha = 1;
    ctx.fillStyle = problem ? '#ff4a3a' : '#ffffff';
    this.frame(tx, ty, T, T);
    if (item.type === 'defense' && DEFENSES[item.kind].radius > 1) this.range(i, DEFENSES[item.kind].radius, problem ? '#ff8a7a' : '#ffffff');
    if (item.type === 'defense' && !problem) this.drawCombos(g, i, item.kind, 1);
  }

  /** Defenses (and sunflowers) that would work with this one, for gold links in the morning. */
  private comboPartners(g: Game, i: number, kind: DefenseKind, level: number): number[] {
    const x = tileX(i);
    const y = tileY(i);
    const within = (j: number, r: number) => Math.hypot(tileX(j) - x, tileY(j) - y) <= r;
    const R = (k: DefenseKind, lv: number) => defenseStats(k, lv).radius;
    const out: number[] = [];
    for (let j = 0; j < g.tiles.length && out.length < 8; j++) {
      if (j === i) continue;
      const t = g.tiles[j];
      const s = t.structure;
      let pair = false;
      switch (kind) {
        case 'beehive': pair = t.crop?.kind === 'sunflower' && within(j, R('beehive', level)); break;
        case 'trap': pair = s?.kind === 'decoy' && within(j, COMBOS.baitRange); break;
        case 'decoy': pair = s?.kind === 'trap' && within(j, COMBOS.baitRange); break;
        case 'scarecrow': pair = s?.kind === 'sprinkler' && within(j, R('scarecrow', level) + R('sprinkler', s.level)); break;
        case 'sprinkler': pair = s?.kind === 'scarecrow' && within(j, R('sprinkler', level) + R('scarecrow', s.level)); break;
        case 'turret': pair = s?.kind === 'thumper' && within(j, R('turret', level) + R('thumper', s.level)); break;
        case 'thumper': pair = s?.kind === 'turret' && within(j, R('thumper', level) + R('turret', s.level)); break;
        case 'doghouse': pair = !!s && DEFENSES[s.kind].blocks && within(j, R('doghouse', level)); break;
        case 'fence': pair = s?.kind === 'doghouse' && within(j, R('doghouse', s.level)); break;
        default: break;
      }
      if (pair) out.push(j);
    }
    return out;
  }

  /** Gold dotted links from a defense to its combo partners, each with a little star. */
  private drawCombos(g: Game, i: number, kind: DefenseKind, level: number): void {
    const ctx = this.ctx;
    const x0 = tileX(i) * T + T / 2;
    const y0 = tileY(i) * T + T / 2;
    ctx.fillStyle = '#ffe24a';
    for (const j of this.comboPartners(g, i, kind, level)) {
      const x1 = tileX(j) * T + T / 2;
      const y1 = tileY(j) * T + T / 2;
      const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 4));
      const phase = Math.floor(this.clock * 8) % 2;
      for (let k = phase; k <= n; k += 2) {
        ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n) - 1, Math.round(y0 + ((y1 - y0) * k) / n) - 1, 2, 2);
      }
      ctx.fillRect(x1 - 1, y1 - 5, 2, 10);
      ctx.fillRect(x1 - 5, y1 - 1, 10, 2);
      ctx.fillRect(x1 - 2, y1 - 2, 4, 4);
    }
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

  /** A little System 7 label, black text on white, centered over (cx, bottom). */
  private tag(text: string, cx: number, bottom: number, color = '#000000'): void {
    const ctx = this.ctx;
    const w = textWidth(text) + 8;
    const h = 13;
    const x = Math.round(Math.max(1, Math.min(WORLD_W - w - 3, cx - w / 2)));
    const y = Math.round(Math.max(1, Math.min(WORLD_H - h - 3, bottom - h)));
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 2, y + 2, w, h);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    drawText(ctx, text, x + 4, y + 3, color, null);
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
          if (Math.random() < 0.35) this.fx.add({ kind: 'splash', x: d.x, y: WORLD_H * Math.random(), color: '#d6e6ff', life: 0.25 });
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
      ctx.fillStyle = 'rgba(235, 240, 245, 0.07)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      for (let k = 0; k < 7; k++) {
        const cx = ((rand(k, 1, 81) * WORLD_W + this.fogPhase * (10 + k * 3)) % (WORLD_W + 300)) - 150;
        const cy = rand(k, 2, 81) * WORLD_H;
        const r = 120 + rand(k, 3, 81) * 120;
        const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
        grd.addColorStop(0, 'rgba(240, 244, 248, 0.26)');
        grd.addColorStop(1, 'rgba(240, 244, 248, 0)');
        ctx.fillStyle = grd;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
    if (w === 'rain') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(214, 222, 236)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Time of day: warm morning, clear noon, golden afternoon, violet sundown, blue evening. The Last Night is night. */
  private drawLight(g: Game, view: View, dt: number): void {
    const ctx = this.ctx;
    let target = 0;
    const nightfall = g.lastNight && (g.phase === 'round' || g.phase === 'sundown');
    if (nightfall) target = 0;
    else if (g.phase === 'round') target = Math.max(0, (g.time / ROUND_SECONDS - 0.62) / 0.38) * 0.55;
    else if (g.phase === 'sundown') target = 0.85;
    else if (g.phase === 'harvest' || g.phase === 'summary') target = 1;
    this.dusk += (target - this.dusk) * Math.min(1, dt * 1.6);
    this.night += ((nightfall ? 1 : 0) - this.night) * Math.min(1, dt * 1.2);
    // drifting cloud shadows
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x - c.r > WORLD_W) c.x = -c.r;
      if (mono) continue; // soft light only comes out as blotches in black and white
      const grd = ctx.createRadialGradient(c.x, c.y, c.r * 0.2, c.x, c.y, c.r);
      grd.addColorStop(0, 'rgba(20, 40, 60, 0.10)');
      grd.addColorStop(1, 'rgba(20, 40, 60, 0)');
      ctx.fillStyle = grd;
      ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
    }
    if (mono) {
      // no tints in black and white
    } else if (this.dusk > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      const d = this.dusk;
      const r = Math.round(255 - d * 85);
      const gg = Math.round(255 - d * 125);
      const b = Math.round(255 - d * 60);
      ctx.fillStyle = `rgb(${r},${gg},${b})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.globalCompositeOperation = 'source-over';
    } else if (g.phase === 'round' && g.time < ROUND_SECONDS * 0.15) {
      // soft morning warmth
      ctx.globalAlpha = 0.08 * (1 - g.time / (ROUND_SECONDS * 0.15));
      ctx.fillStyle = '#ffd08a';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.globalAlpha = 1;
    }
    if (this.night > 0.01) this.drawNight(g, view);
    if (mono) return;
    // a gentle vignette
    const v = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.45, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  /** Once the mouse rests on something, name it in a little tag above the pointer. */
  private drawHoverLabel(g: Game, view: View): void {
    const now = performance.now();
    if (Math.abs(view.mouseX - this.rest.x) > 3 || Math.abs(view.mouseY - this.rest.y) > 3) {
      this.rest = { x: view.mouseX, y: view.mouseY, since: now };
    }
    const tool = view.selected?.type;
    if (!view.mouseIn || tool === 'upgrade' || tool === 'remove' || g.hoseAim) return;
    const live = g.phase === 'round' || g.phase === 'sundown';
    if (now - this.rest.since < (live ? 450 : 250)) return;
    const label = this.nameAt(g, view);
    if (label) this.tag(label, view.mouseX, view.mouseY - (live ? 16 : 6));
  }

  private nameAt(g: Game, view: View): string | null {
    const mx = view.mouseX / T;
    const my = view.mouseY / T;
    let best: Bunny | null = null;
    let bestD = Infinity;
    for (const b of g.bunnies) {
      if (b.dead) continue;
      const def = BUNNIES[b.kind];
      const cy = b.y - (g.isSurfaced(b) ? def.aim : 0);
      const d = Math.hypot(b.x - mx, cy - my);
      if (d <= def.size / 16 + 0.15 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (best) return g.isSurfaced(best) ? BUNNIES[best.kind].name : `${BUNNIES[best.kind].name}, digging`;
    for (const d of g.dogs) if (Math.hypot(d.x - mx, d.y - 0.2 - my) < 0.5) return 'Guard dog';
    if (view.hoverTile >= 0 && view.hoverTile === g.merchantTile()) return "Merchant's cart";
    const i = view.hoverTile;
    if (i < 0) return null;
    const t = g.tiles[i];
    if (t.structure) {
      const s = t.structure;
      const name = DEFENSES[s.kind].name;
      if (s.kind === 'trap' && s.cd > 0 && live(g)) return `${name}, resetting`;
      return s.level > 1 ? `${name} (level ${s.level})` : name;
    }
    if (t.crop) {
      const name = CROPS[t.crop.kind].name;
      const stage = g.cropStage(t.crop);
      return stage === 0 ? `${name} seeds` : stage === 1 ? `${name} sprout` : stage === 2 ? `Young ${name.toLowerCase()}` : `Ripe ${name.toLowerCase()}`;
    }
    const tx = tileX(i);
    const ty = tileY(i);
    if (g.burrows.some((b) => b.x === tx && b.y === ty)) return g.phase === 'planning' ? null : 'Burrow'; // tagged already
    const sc = SCENERY.find((o) => tx >= o.x && ty >= o.y && tx < o.x + o.w && ty < o.y + o.h);
    return sc ? SCENERY_NAMES[sc.kind] : null;
  }

  /** Moonlight blue over everything, the crater blazing, and a lantern where you aim. */
  private drawNight(g: Game, view: View): void {
    const ctx = this.ctx;
    const n = this.night;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${Math.round(255 - n * 120)},${Math.round(255 - n * 105)},${Math.round(255 - n * 45)})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x: number, y: number, r: number, color: string, a: number) => {
      const grd = ctx.createRadialGradient(x, y, 1, x, y, r);
      grd.addColorStop(0, `rgba(${color},${a})`);
      grd.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 3);
    glow((CRATER.x + 1) * T, (CRATER.y + 1) * T - 6, 90, '120,255,90', (0.22 + pulse * 0.1) * n);
    if (view.mouseIn) glow(view.mouseX, view.mouseY, 78, '255,232,176', 0.22 * n);
    ctx.globalCompositeOperation = 'source-over';
    void g;
  }

  private drawCrosshair(g: Game, view: View): void {
    const kind = g.weapon;
    const st = weaponStats(kind, g.weapons[kind]);
    const ctx = this.ctx;
    // how far each weapon reaches: the pellet scatter, the splash, the spray
    const reach = WEAPONS[kind].splash || kind === 'hose' ? st.radius * T : st.spread ? st.spread * T : 0;
    if (reach > 0) {
      ctx.fillStyle = kind === 'hose' ? '#bfe6ff' : '#ffffff';
      ctx.globalAlpha = 0.7;
      dottedCircle(ctx, view.mouseX, view.mouseY, reach, 4, -this.clock, 1);
      ctx.globalAlpha = 1;
    }
    this.crosshair(view, g.reloadFrac());
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
    if (!this.bg || this.bgKey !== 'classic:spring') this.buildBackground(null, 'classic:spring');
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.bg!, 0, 0);
    const hole = sheet().scenery.burrow;
    for (const h of c.holes) this.blit(hole, (h.x + 0.5) * T, (h.y + 0.5) * T + 8);

    const list: Drawable[] = [];
    const shadows: [number, number, number][] = [];
    this.collectScenery(list, shadows);
    const sp = sheet();
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
            this.blit(img, px, py - 7 + Math.round((1 - rise) * img.height));
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
      const { frame, lift } = this.hopPose(art, t.hop % 1, 6);
      const img = t.flash > 0 ? art.flash[frame] : art.frames[frame];
      shadows.push([px, py - 1, Math.max(4, (img.width / 2.6) * (1 - lift / 30))]);
      this.put(list, img, px, py, { flip, lift });
      if (t.kind === 'golden' && Math.random() < 0.5) {
        this.fx.add({ kind: 'sparkle', x: px + (Math.random() - 0.5) * 20, y: py - 10 - Math.random() * 16, life: 0.35, color: '#fff6c0' });
      }
    }
    this.drawShadows(shadows);
    list.sort((p, q) => p.y - q.y);
    for (const d of list) d.draw();
    this.drawCraterGlow(0);
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
    this.present();
  }
}

const live = (g: Game) => g.phase === 'round' || g.phase === 'sundown';

const SCENERY_NAMES: Record<Scenery['kind'], string> = {
  crater: 'The crater', pond: 'Pond', tree_oak: 'Oak tree', tree_apple: 'Apple tree',
  bush: 'Bush', stump: 'Stump', haybale: 'Hay bale', rocks: 'Rocks', flowers: 'Wildflowers',
};

// how each kind of scenery sits on its footprint: nudge down (dy) and shadow width
const SCENERY_PLACE: Record<Scenery['kind'], { dy: number; shadow: number }> = {
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
  const sp = sheet();
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
      case 'thumper': return sp.defenses.thumperUp;
      case 'decoy': return sp.defenses.decoy;
      case 'beehive': return sp.defenses.beehive;
    }
  }
  return null;
}

let exclaimImg: Img | null = null;
/** The "!" over a spooked bunny. */
function exclaim(): Img {
  exclaimImg ??= PixelGrid.fromRows(
    ['.rr.', 'rwwr', 'rwwr', 'rwwr', 'rwwr', '.rr.', 'rwwr', '.rr.'],
    { r: '#c0392b', w: '#ffffff' },
  ).outlined().canvas();
  return exclaimImg;
}
