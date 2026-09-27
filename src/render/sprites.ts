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
  squash: boolean; // one still pose, animated with squash & stretch instead of frames
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
  };
  fence: Img[]; // indexed by neighbor mask: 1 north, 2 east, 4 south, 8 west
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
    return { frames: [f], flash: [silhouette(f)], eat: [0, 0], squash: true };
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
    },
    seed: get('crop_seed'),
    sprout: get('crop_sprout'),
    defenses: {
      scarecrow: get('def_scarecrow'),
      sprinkler: get('def_sprinkler'),
      turret: get('def_turret'),
      doghouse: get('def_doghouse'),
      trapOpen: get('def_trap_open'),
      trapShut: get('def_trap_shut'),
    },
    fence: Array.from({ length: 16 }, (_, m) => makeFence(m)),
    scenery,
  };
  return loaded;
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
    if (season === 'fall') {
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
