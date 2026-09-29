// Loads the processed sprite-ai.art sprites (src/art/sprites/*.png, made by scripts/process-sprites.py)
// and a few things drawn in code (fences, the pebble). Everything becomes a canvas so we can derive
// hit-flash silhouettes and icons from it.
import type { BunnyKind, CropKind, Season } from '../config';
import { PixelGrid } from './pixels';

const files = import.meta.glob('../art/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type Img = HTMLCanvasElement;

export interface BunnyArt {
  frames: Img[]; // hop cycle; frame 0 is sitting
  flash: Img[];
  eat: [number, number]; // the two frames that alternate while nibbling
  squash: boolean; // one pose, hopped with squash & stretch: frames are [pose, squashed, stretched]
}

export interface SpriteSet {
  bunnies: Record<BunnyKind, BunnyArt>;
  golden: BunnyArt; // Classic Mode's jackpot bunny
  mound: Img;
  dog: { stand: Img; run: Img[]; flash: Img };
  crops: Record<CropKind, { young: Img; ripe: Img }>;
  seed: Img;
  sprout: Img;
  defenses: {
    scarecrow: Img;
    sprinkler: Img;
    turret: Img;
    doghouse: Img;
    trapOpen: Img;
    trapShut: Img;
    thumperUp: Img;
    thumperDown: Img;
    decoy: Img;
    beehive: Img;
  };
  fence: Img[]; // indexed by neighbor mask: 1 north, 2 east, 4 south, 8 west
  sprinklerSpin: Img[]; // a half turn of the sprinkler's arms
  scenery: Record<string, Img>;
}

let loaded: SpriteSet | null = null;

export function sprites(): SpriteSet {
  if (!loaded) throw new Error('sprites not loaded yet');
  return loaded;
}

function toCanvas(img: HTMLImageElement): Img {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

/** Same shape, solid white: the hit flash. */
export function silhouette(src: Img, color = '#ffffff'): Img {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export async function loadSprites(): Promise<SpriteSet> {
  if (loaded) return loaded;
  const byName: Record<string, Img> = {};
  await Promise.all(
    Object.entries(files).map(
      ([path, url]) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            byName[path.split('/').pop()!.replace('.png', '')] = toCanvas(img);
            resolve();
          };
          img.onerror = () => reject(new Error(`could not load ${path}`));
          img.src = url;
        }),
    ),
  );
  const get = (n: string): Img => {
    const c = byName[n];
    if (!c) throw new Error(`missing sprite ${n}`);
    return c;
  };
  const cycle = (prefix: string) => Array.from({ length: 8 }, (_, i) => get(`${prefix}_${i}`));
  const hopper = (prefix: string): BunnyArt => {
    const frames = cycle(prefix);
    return { frames, flash: frames.map((f) => silhouette(f)), eat: [6, 7], squash: false };
  };
  const still = (name: string): BunnyArt => {
    const f = get(name);
    const k = Math.max(2, Math.round(f.height * 0.06));
    const frames = [f, squashed(f, k), squashed(f, -k)];
    return { frames, flash: frames.map((x) => silhouette(x)), eat: [0, 1], squash: true };
  };
  const crop = (k: CropKind) => ({ young: get(`crop_${k}_young`), ripe: get(`crop_${k}_ripe`) });
  const scenery: Record<string, Img> = {};
  for (const [n, c] of Object.entries(byName)) if (n.startsWith('sc_')) scenery[n.slice(3)] = c;
  const dogStand = get('dog_stand');
  loaded = {
    bunnies: {
      common: hopper('bunny_common'),
      speedy: hopper('bunny_jack'),
      digger: hopper('bunny_digger'),
      fat: still('bunny_fat'),
      kit: hopper('bunny_kit'),
      pothead: hopper('bunny_pothead'),
      leaper: hopper('bunny_leaper'),
      bandit: hopper('bunny_bandit'),
      snowhare: hopper('bunny_snow'),
      ninja: hopper('bunny_ninja'),
      queen: still('bunny_queen'),
      mutant: still('bunny_boss'),
    },
    golden: (() => {
      const frames = cycle('bunny_common').map((f) => gild(f));
      return { frames, flash: frames.map((f) => silhouette(f)), eat: [6, 7] as [number, number], squash: false };
    })(),
    mound: get('digger_mound'),
    dog: { stand: dogStand, run: cycle('dog'), flash: silhouette(dogStand) },
    crops: {
      radish: crop('radish'), lettuce: crop('lettuce'), carrot: crop('carrot'), corn: crop('corn'),
      pumpkin: crop('pumpkin'), strawberry: crop('strawberry'),
      sunflower: { young: makeSunflower(false), ripe: makeSunflower(true) },
      tomato: { young: makeTomato(false), ripe: makeTomato(true) },
      watermelon: { young: makeWatermelon(false), ripe: makeWatermelon(true) },
      golden: { young: goldenCarrot(get('crop_carrot_young')), ripe: goldenCarrot(get('crop_carrot_ripe')) },
    },
    seed: get('crop_seed'),
    sprout: get('crop_sprout'),
    defenses: {
      scarecrow: get('def_scarecrow'),
      sprinkler: makeSprinkler(0),
      turret: get('def_turret'),
      doghouse: get('def_doghouse'),
      trapOpen: makeTrap(true),
      trapShut: makeTrap(false),
      thumperUp: makeThumper(false),
      thumperDown: makeThumper(true),
      decoy: makeDecoy(),
      beehive: makeBeehive(),
    },
    fence: Array.from({ length: 16 }, (_, m) => makeFence(m)),
    sprinklerSpin: [0, 1, 2, 3].map((k) => makeSprinkler((k * Math.PI) / 4)),
    scenery,
  };
  return loaded;
}

/**
 * Squash a pose by whole pixels (k > 0: k rows shorter and k columns wider; k < 0 stretches). Rows come
 * out of, or double up in, the belly and columns in the middle, so the face and feet keep every pixel.
 */
function squashed(src: Img, k: number): Img {
  const w = src.width + k;
  const h = src.height - k;
  const band = Math.round(src.height * 0.62);
  const mid = Math.round(src.width / 2);
  const srcRow = (y: number) => (y < band ? y : k > 0 ? y + k : y < band - k ? band : y + k);
  const srcCol = (x: number) => (x < mid ? x : k < 0 ? x - k : x < mid + k ? mid : x - k);
  const from = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const i = (srcRow(y) * src.width + srcCol(x)) * 4;
      for (let n = 0; n < 4; n++) out.data[o + n] = from[i + n];
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

// ---------------------------------------------------------------- the fence, drawn in code

const WOOD = { light: '#d9a066', mid: '#b97a45', dark: '#8a5530', deep: '#5c3620', outline: '#3a2216', nail: '#6d737d' };

/** A 32px rail fence piece joined toward its fence neighbors. 32x44: art rises 12px above its tile. */
function makeFence(mask: number): Img {
  const W = 32;
  const H = 44;
  const g = new PixelGrid(W, H);
  const oy = 12; // tile top inside the canvas
  const rail = (x: number, y: number, w: number) => {
    g.rect(x, y, w, 4, WOOD.mid);
    g.rect(x, y, w, 1, WOOD.light);
    g.rect(x, y + 3, w, 1, WOOD.dark);
    for (let k = x + 3; k < x + w; k += 7) g.set(k, y + 1, WOOD.dark); // grain
  };
  const railV = (y0: number, y1: number) => {
    g.rect(14, y0, 4, y1 - y0, WOOD.mid);
    g.rect(14, y0, 1, y1 - y0, WOOD.light);
    g.rect(17, y0, 1, y1 - y0, WOOD.dark);
  };
  if (mask & 8) {
    rail(0, oy + 2, 14);
    rail(0, oy + 12, 14);
  }
  if (mask & 2) {
    rail(18, oy + 2, 14);
    rail(18, oy + 12, 14);
  }
  if (mask & 1) railV(0, oy + 4);
  if (mask & 4) railV(oy + 22, H);
  // the post
  g.rect(12, oy - 4, 8, 28, WOOD.mid);
  g.rect(12, oy - 4, 2, 28, WOOD.light);
  g.rect(18, oy - 4, 2, 28, WOOD.dark);
  g.rect(13, oy - 6, 6, 2, WOOD.mid);
  g.rect(14, oy - 7, 4, 1, WOOD.light);
  g.rect(12, oy + 22, 8, 2, WOOD.deep);
  g.set(15, oy + 3, WOOD.nail);
  g.set(15, oy + 13, WOOD.nail);
  return g.outlined(WOOD.outline).canvas();
}

// ---------------------------------------------------------------- the snap trap and sprinkler, drawn in code
// (the generated ones read as a pet bowl and a birdbath)

const PINE = { light: '#f6d49a', mid: '#e0b273', grain: '#c4914f', edge: '#a8723f', under: '#7a4f2a' };
const STEEL = { light: '#f4f6f8', mid: '#b9c0ca', dark: '#6f7885' };
const CHEESE = { light: '#fff08a', mid: '#ffc93a', hole: '#d8961a' };
const TRAP_OUTLINE = '#3a2216';

/** A wooden snap trap, 30x19: set (hammer back, cheese on the pedal) or sprung (hammer down on it). */
function makeTrap(set: boolean): Img {
  const g = new PixelGrid(30, 19);
  // the board: top face, front edge
  g.rect(1, 2, 28, 12, PINE.mid);
  g.rect(1, 2, 28, 1, PINE.light);
  for (const [x, y, w] of [[3, 4, 8], [16, 3, 10], [9, 6, 5], [20, 7, 6], [3, 11, 6], [22, 12, 5]]) g.rect(x, y, w, 1, PINE.grain);
  g.rect(1, 14, 28, 3, PINE.edge);
  g.rect(1, 16, 28, 1, PINE.under);
  // the springs sit on the hinge line across the middle
  const hinge = 8;
  for (const x of [4, 23]) {
    g.rect(x, hinge - 1, 3, 3, STEEL.dark);
    g.set(x + 1, hinge - 1, STEEL.light);
    g.set(x + 1, hinge + 1, STEEL.mid);
  }
  // the bait pedal
  g.rect(11, 10, 8, 3, STEEL.dark);
  g.rect(11, 10, 8, 1, STEEL.mid);
  const cheese = (y: number, squashed: boolean) => {
    if (squashed) {
      g.rect(10, y, 10, 2, CHEESE.mid);
      g.rect(11, y, 7, 1, CHEESE.light);
      g.set(13, y + 1, CHEESE.hole);
      g.set(17, y + 1, CHEESE.hole);
      return;
    }
    // a wedge: pale top face, deeper front face with holes
    g.rect(15, y, 3, 1, CHEESE.light);
    g.rect(13, y + 1, 6, 1, CHEESE.light);
    g.rect(12, y + 2, 7, 1, CHEESE.light);
    g.rect(12, y + 3, 7, 2, CHEESE.mid);
    g.set(14, y + 3, CHEESE.hole);
    g.set(17, y + 4, CHEESE.hole);
  };
  // the hammer: a steel U, laid back over the far half (set) or slammed onto the near half (sprung)
  const u = (y0: number, y1: number, bar: number) => {
    g.rect(5, y0, 2, y1 - y0 + 1, STEEL.mid);
    g.rect(23, y0, 2, y1 - y0 + 1, STEEL.mid);
    g.rect(5, y0, 1, y1 - y0 + 1, STEEL.light);
    g.rect(23, y0, 1, y1 - y0 + 1, STEEL.light);
    g.rect(5, bar, 20, 2, STEEL.mid);
    g.rect(5, bar, 20, 1, STEEL.light);
  };
  if (set) {
    u(3, hinge, 3);
    g.rect(15, 5, 1, 4, STEEL.dark); // the catch wire, holding the hammer back
    cheese(7, false);
  } else {
    cheese(10, true);
    u(hinge, 13, 12);
  }
  return g.outlined(TRAP_OUTLINE).canvas();
}

const SPRINK = {
  base: '#2f6fc4', baseLight: '#5f9ae6', baseDark: '#1f4c8c', hose: '#3f8a3a', hoseLight: '#74c25a',
  brass: '#d9a441', brassLight: '#f7d67a', brassDark: '#9a6a20', steel: '#c3cad4', steelDark: '#7d8794', water: '#bfe6ff',
};

/** A rotary lawn sprinkler, 28x26: blue sled, green hose, brass arms turned to `angle` (radians). */
function makeSprinkler(angle: number): Img {
  const g = new PixelGrid(28, 26);
  const cx = 14;
  const hubY = 9;
  // the hose trails off to the left
  for (const [x, y] of [[1, 23], [2, 23], [3, 23], [4, 22], [5, 22], [6, 21], [7, 21]]) {
    g.rect(x, y, 1, 2, SPRINK.hose);
    g.set(x, y, SPRINK.hoseLight);
  }
  // the sled
  g.ellipse(cx, 21, 8.5, 3.5, SPRINK.baseDark);
  g.ellipse(cx, 20, 7.5, 2.6, SPRINK.base);
  g.rect(cx - 5, 19, 3, 1, SPRINK.baseLight);
  // arms: endpoints on a squashed circle, the far one drawn before the post and the near one after
  const L = 10;
  const ex = Math.round(Math.cos(angle) * L);
  const ey = Math.round(Math.sin(angle) * L * 0.45);
  const arm = (dx: number, dy: number) => {
    g.line(cx, hubY + 1, cx + dx, hubY + 1 + dy, SPRINK.brassDark);
    g.line(cx, hubY, cx + dx, hubY + dy, SPRINK.brass);
    const tx = cx + dx;
    const ty = hubY + dy;
    g.rect(tx - 1, ty - 2, 2, 2, SPRINK.brassDark); // the nozzle, bent up
    g.set(tx - 1, ty - 3, SPRINK.water);
  };
  const [far, near] = ey <= 0 ? [[ex, ey], [-ex, -ey]] : [[-ex, -ey], [ex, ey]];
  arm(far[0], far[1]);
  g.rect(cx - 1, hubY, 2, 20 - hubY, SPRINK.steelDark); // the post
  g.rect(cx - 1, hubY, 1, 20 - hubY, SPRINK.steel);
  arm(near[0], near[1]);
  g.rect(cx - 2, hubY - 1, 4, 3, SPRINK.brassDark); // the hub
  g.rect(cx - 2, hubY - 1, 3, 1, SPRINK.brassLight);
  g.set(cx - 1, hubY, SPRINK.brass);
  return g.outlined(TRAP_OUTLINE).canvas();
}

// ---------------------------------------------------------------- crops and defenses drawn in code

const SOILM = { body: '#563621', hi: '#785434', clod: '#432b1d' };
const LEAF = { dark: '#2f6e24', mid: '#46922f', light: '#72c24a' };
const TIMBER = { light: '#e0b074', mid: '#b98050', dark: '#7d5230' };
const IRON = { light: '#b8c0cc', mid: '#7d8794', dark: '#4a515c' };
const EDGE = '#2a1b14';

/** The little heap of soil every crop sits in. */
function mound(g: PixelGrid, cx: number, bottom: number, rx: number): void {
  g.ellipse(cx, bottom - 2.5, rx, 2.6, SOILM.body);
  g.ellipse(cx - 1, bottom - 3.4, rx - 2.5, 1.2, SOILM.hi);
  for (const dx of [-rx + 3, 1, rx - 3]) g.set(cx + dx, bottom - 2, SOILM.clod);
}

function leafy(g: PixelGrid, x: number, y: number, rx: number, ry: number): void {
  g.ellipse(x, y, rx, ry, LEAF.dark);
  g.ellipse(x - 0.5, y - 0.6, rx - 1, ry - 0.9, LEAF.mid);
  g.set(x - 1, y - 1, LEAF.light);
}

function makeSunflower(ripe: boolean): Img {
  const H = ripe ? 38 : 30;
  const g = new PixelGrid(24, H);
  const cx = 12;
  const bottom = H - 1;
  const top = ripe ? 10 : 9;
  g.rect(cx - 1, top, 2, bottom - 3 - top, LEAF.mid);
  g.rect(cx - 1, top, 1, bottom - 3 - top, LEAF.light);
  leafy(g, cx - 5, bottom - 10, 4, 1.8);
  leafy(g, cx + 5, bottom - (ripe ? 17 : 14), 4, 1.8);
  if (ripe) leafy(g, cx - 5, bottom - 21, 3.5, 1.6);
  mound(g, cx, bottom, 8);
  if (ripe) {
    // a ring of petals round a big seedy middle
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.ellipse(cx + Math.cos(a) * 6.2, top + Math.sin(a) * 5.6, 2.3, 2.3, k % 2 ? '#f7b52c' : '#ffd84a');
    }
    g.ellipse(cx, top, 4.6, 4.2, '#5a3218');
    g.ellipse(cx - 0.5, top - 0.5, 3.2, 2.8, '#7a4a24');
    for (const [dx, dy] of [[-2, -1], [1, -2], [2, 1], [-1, 2], [0, 0]]) g.set(cx + dx, top + dy, '#a06a34');
  } else {
    g.ellipse(cx, top, 3, 3.3, LEAF.mid);
    g.set(cx - 1, top - 1, LEAF.light);
    g.set(cx, top - 3, '#ffd84a');
    g.set(cx + 1, top - 3, '#f7b52c');
  }
  return g.outlined(EDGE).canvas();
}

function makeTomato(ripe: boolean): Img {
  const g = new PixelGrid(26, 34);
  const cx = 12;
  const bottom = 33;
  const stakeTop = ripe ? 3 : 9;
  g.rect(cx, stakeTop, 2, bottom - 3 - stakeTop, TIMBER.mid);
  g.rect(cx + 1, stakeTop, 1, bottom - 3 - stakeTop, TIMBER.dark);
  const clumps = ripe
    ? [[cx - 3, 25, 5, 3.5], [cx + 5, 22, 5, 3.5], [cx - 3, 17, 5, 3.5], [cx + 5, 13, 4.5, 3.2], [cx - 1, 8, 4, 3], [cx + 3, 27, 4, 3]]
    : [[cx - 3, 25, 4, 3], [cx + 5, 23, 4, 3], [cx - 1, 18, 4, 3], [cx + 4, 14, 3.5, 2.6]];
  for (const [x, y, rx, ry] of clumps) leafy(g, x, y, rx, ry);
  const fruit = ripe ? [[cx - 5, 19], [cx + 7, 16], [cx - 2, 27], [cx + 6, 25], [cx + 2, 10]] : [[cx - 4, 21], [cx + 6, 19]];
  for (const [x, y] of fruit) {
    g.ellipse(x, y, ripe ? 2.7 : 1.9, ripe ? 2.5 : 1.8, ripe ? '#e0342a' : '#9ad35e');
    g.set(x - 1, y - 1, ripe ? '#ff8a6a' : '#c8f08a');
    g.set(x, y - (ripe ? 3 : 2), LEAF.dark);
  }
  mound(g, cx, bottom, 8);
  return g.outlined(EDGE).canvas();
}

function makeWatermelon(ripe: boolean): Img {
  const g = new PixelGrid(32, 24);
  const cx = 16;
  const bottom = 23;
  // the vine peeks out behind: a couple of leaves and a curl of tendril
  leafy(g, cx + 9, 7, 4, 2.4);
  leafy(g, cx - 9, 9, 3.5, 2.2);
  for (const [x, y] of [[cx + 12, 4], [cx + 13, 3], [cx + 14, 4], [cx + 14, 5]]) g.set(x, y, LEAF.dark);
  g.ellipse(cx, bottom - 1.5, ripe ? 13 : 8, 1.6, SOILM.body);
  const rx = ripe ? 12 : 6;
  const ry = ripe ? 7.5 : 4;
  const my = bottom - 2 - ry;
  // a light rind with bold dark stripes running tip to tip, bowed around the melon
  g.ellipse(cx, my, rx, ry, (x, y) => {
    const nx = (x + 0.5 - cx) / rx;
    const v = (y + 0.5 - my) / ry / Math.sqrt(Math.max(0.08, 1 - nx * nx));
    return Math.floor((v + 1) * (ripe ? 3.5 : 2.5)) % 2 === 0 ? '#2c6e2a' : '#62b14a';
  });
  g.ellipse(cx - rx * 0.4, my - ry * 0.5, rx * 0.28, ry * 0.2, '#a8e07a');
  return g.outlined(EDGE).canvas();
}

/** The carrot, turned gold, with a glint or two. */
function goldenCarrot(src: Img): Img {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  let glints = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const [h, sat, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
    if (h < 8 || h > 42 || sat < 0.45 || l < 0.28) continue; // just the orange root, not the soil
    const out = hsl2rgb(47, 0.95, Math.min(0.88, 0.32 + l * 0.62));
    const glint = l > 0.55 && glints < 3 && (i / 4) % 7 === 0;
    if (glint) glints++;
    px[i] = glint ? 255 : out[0];
    px[i + 1] = glint ? 255 : out[1];
    px[i + 2] = glint ? 240 : out[2];
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

/** A timber A-frame with an iron weight on a rope: `down` is the moment it lands. */
function makeThumper(down: boolean): Img {
  const g = new PixelGrid(30, 40);
  const cx = 15;
  g.ellipse(cx, 36.5, 8, 2.2, IRON.dark);
  g.ellipse(cx, 36, 7, 1.4, IRON.mid);
  g.line(4, 37, 12, 5, TIMBER.dark);
  g.line(5, 37, 13, 5, TIMBER.mid);
  g.line(26, 37, 18, 5, TIMBER.dark);
  g.line(25, 37, 17, 5, TIMBER.mid);
  g.rect(9, 24, 13, 2, TIMBER.mid);
  g.rect(9, 24, 13, 1, TIMBER.light);
  g.rect(9, 2, 13, 3, TIMBER.mid);
  g.rect(9, 2, 13, 1, TIMBER.light);
  g.ellipse(cx, 6.5, 2.4, 2.4, IRON.mid);
  g.set(cx, 6, IRON.dark);
  const wy = down ? 27 : 12;
  g.rect(cx, 9, 1, wy - 9, '#d8c49a');
  g.rect(cx - 5, wy, 11, 8, IRON.dark);
  g.rect(cx - 4, wy + 1, 9, 6, IRON.mid);
  g.rect(cx - 4, wy + 1, 9, 1, IRON.light);
  g.set(cx - 3, wy + 4, IRON.light);
  g.set(cx + 3, wy + 4, IRON.light);
  return g.outlined(EDGE).canvas();
}

/** A painted wooden carrot on a stake. */
function makeDecoy(): Img {
  const g = new PixelGrid(22, 36);
  const cx = 11;
  g.ellipse(cx, 34.5, 4, 1.2, SOILM.body);
  g.rect(cx - 1, 24, 3, 11, TIMBER.mid);
  g.rect(cx - 1, 24, 1, 11, TIMBER.light);
  for (const [x, y, ry] of [[cx - 4, 6, 3.5], [cx, 4, 4.5], [cx + 4, 6, 3.5]]) {
    g.ellipse(x, y, 1.8, ry, '#3f9a36');
    g.set(x, y - 1, '#7ad05a');
  }
  for (let y = 9; y <= 28; y++) {
    const hw = Math.max(0, Math.round(7 * (1 - (y - 9) / 20) + 0.4));
    g.rect(cx - hw, y, hw * 2 + 1, 1, '#f08a24');
  }
  for (const [y, w] of [[13, 4], [18, 3], [23, 2]]) g.rect(cx - w + 1, y, w * 2 - 1, 1, '#c8641a');
  g.line(cx - 5, 10, cx - 1, 24, '#ffb65c');
  g.set(cx + 1, 16, '#6d737d');
  return g.outlined(EDGE).canvas();
}

/** A straw skep on a little bench. The bees are drawn live. */
function makeBeehive(): Img {
  const g = new PixelGrid(26, 30);
  const cx = 13;
  g.rect(3, 26, 20, 2, TIMBER.mid);
  g.rect(3, 26, 20, 1, TIMBER.light);
  g.rect(5, 28, 2, 2, TIMBER.dark);
  g.rect(19, 28, 2, 2, TIMBER.dark);
  for (let y = 4; y <= 25; y++) {
    const t = (25 - y) / 21;
    const hw = Math.round(10 * Math.sqrt(Math.max(0, 1 - t * t)) + 0.3);
    const groove = (y - 4) % 3 === 2;
    g.rect(cx - hw, y, hw * 2 + 1, 1, groove ? '#a8702c' : (y - 4) % 6 < 3 ? '#e8b85a' : '#d6a044');
    if (!groove && hw > 3) g.set(cx - hw + 2, y, '#f6d88a');
  }
  g.ellipse(cx, 23, 2.6, 1.6, '#2a1a0e');
  return g.outlined(EDGE).canvas();
}

// ---------------------------------------------------------------- seasonal foliage

const seasonal = new Map<string, Img>();

function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h * 360, s, l];
}

function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** Foliage for the season: autumn turns greens gold and red, winter frosts them white. */
export function forSeason(img: Img, key: string, season: Season): Img {
  if (season === 'spring' || season === 'summer') return img;
  const id = `${key}:${season}`;
  const hit = seasonal.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const [h, sat, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
    if (h < 65 || h > 165 || sat < 0.12) continue; // only the greens
    let out: [number, number, number];
    if (season === 'fall' && key === 'bush') {
      // bushes go burgundy, so a round orange bush never passes for a pumpkin
      out = hsl2rgb(l > 0.5 ? 350 : 342, Math.min(0.75, sat * 0.9 + 0.1), Math.min(0.6, l * 0.85 + 0.02));
    } else if (season === 'fall') {
      // light leaves go gold, mid go orange, dark go russet
      const hue = l > 0.55 ? 44 : l > 0.35 ? 28 : 12;
      out = hsl2rgb(hue, Math.min(1, sat * 1.15 + 0.12), Math.min(0.8, l * 1.05 + 0.04));
    } else {
      // frosted: pale blue-white on top, cool gray-green in the shade
      out = l > 0.32 ? hsl2rgb(205, 0.25, Math.min(0.95, 0.72 + l * 0.3)) : hsl2rgb(160, 0.12, l * 0.9 + 0.1);
    }
    px[i] = out[0];
    px[i + 1] = out[1];
    px[i + 2] = out[2];
  }
  ctx.putImageData(data, 0, 0);
  seasonal.set(id, c);
  return c;
}

/** The brown bunny, dipped in gold. */
function gild(src: Img): Img {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const [h, sat, l] = rgb2hsl(px[i], px[i + 1], px[i + 2]);
    if (h < 5 || h > 50 || sat < 0.1 || l < 0.15) continue;
    const out = hsl2rgb(46, 0.9, Math.min(0.85, 0.3 + l * 0.8));
    px[i] = out[0];
    px[i + 1] = out[1];
    px[i + 2] = out[2];
  }
  ctx.putImageData(data, 0, 0);
  return c;
}
