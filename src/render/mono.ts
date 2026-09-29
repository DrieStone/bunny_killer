// 1993 Mode: everything in black and white, the way a Mac Plus showed it. Sprites become black-outlined
// shapes with patterned fills, the way clip art was drawn then; sunny grass goes white with its tufts left
// in; and whatever's left (sparks, shadows, the night) goes through an ordered dither on its way to the
// screen, so the picture holds still while the bunnies move across it.
import type { Img } from './sprites';

// the classic 8x8 Bayer matrix: where each gray level starts putting down white dots
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];
const THRESHOLD = Uint8Array.from(BAYER, (v) => Math.round(((v + 0.5) / 64) * 255));

// A few flat fill patterns, like MacPaint's, rather than every shade: black; 1/8, 1/4, 1/2, 3/4 and 7/8 white; white.
const STEPS: [number, number][] = [[0.14, 0], [0.26, 1 / 8], [0.38, 1 / 4], [0.5, 1 / 2], [0.64, 3 / 4], [0.78, 7 / 8], [2, 1]];
const LEVEL = Uint8Array.from({ length: 256 }, (_, v) => Math.round(STEPS.find(([top]) => v / 255 < top)![1] * 255));

const WHITE = 0xffffffff;
const BLACK = 0xff000000;
const LEAF_LIFT = 154; // /256: how much lighter green comes out, so leaves read against the soil and bunnies

/** How light a color comes out: its brightness, plus `lift` (/256) of however much greener than red or blue it is. */
function gray(r: number, g: number, b: number, lift: number): number {
  const green = g - (r > b ? r : b);
  const v = ((r * 77 + g * 150 + b * 29) >> 8) + (green > 0 ? (green * lift) >> 8 : 0);
  return v > 255 ? 255 : v;
}

const dot = (level: number, x: number, y: number): number => (level > THRESHOLD[((y & 7) << 3) | (x & 7)] ? WHITE : BLACK);

/** The finished frame, pixel by pixel, against a pattern fixed to the screen. Black and white pass straight through. */
export function dither(src: Uint8ClampedArray, dst: Uint32Array, w: number, h: number): void {
  for (let y = 0, i = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++, p += 4) dst[i] = dot(LEVEL[gray(src[p], src[p + 1], src[p + 2], 0)], x, y);
  }
}

/** The ground, once per layout: sunny grass goes white with its darker tufts left in; soil, water, and the rest take patterns. */
export function monoGround(c: HTMLCanvasElement): void {
  const w = c.width;
  const h = c.height;
  const ctx = c.getContext('2d')!;
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) lum[i] = (px[p] * 77 + px[p + 1] * 150 + px[p + 2] * 29) >> 8;
  const mean = boxMean(lum, w, h, 3);
  const out = new Uint32Array(px.buffer);
  for (let y = 0, i = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++, p += 4) {
      const r = px[p];
      const g = px[p + 1];
      const b = px[p + 2];
      if (g > r + 8 && g > b + 8) out[i] = lum[i] < mean[i] - 16 ? BLACK : WHITE;
      else out[i] = dot(LEVEL[gray(r, g, b, LEAF_LIFT)], x, y);
    }
  }
  ctx.putImageData(d, 0, 0);
}

/** The average of each pixel's neighborhood, `r` pixels each way, edges held. */
function boxMean(v: Float32Array, w: number, h: number, r: number): Float32Array {
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += v[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** Sprites drawn at twice size are done in 2x2 blocks, so the dots stay the size of their pixels. */
function cellOf(px: Uint32Array, w: number, h: number): number {
  if (w % 2 || h % 2) return 1;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const v = px[y * w + x];
      if (px[y * w + x + 1] !== v || px[(y + 1) * w + x] !== v || px[(y + 1) * w + x + 1] !== v) return 1;
    }
  }
  return 2;
}

const made = new WeakMap<Img, Img>();

/**
 * A sprite in black and white: patterned fills inside a black outline, see-through where it was, with the
 * pattern fixed to the sprite so it travels with it. `outline` false for pictures without edges, like the logo.
 */
export function monoSprite(img: Img, outline = true): Img {
  let m = made.get(img);
  if (m) return m;
  const w = img.width;
  const h = img.height;
  m = document.createElement('canvas');
  m.width = w;
  m.height = h;
  made.set(img, m);
  if (!w || !h) return m;
  const ctx = m.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  const src = new Uint32Array(px.buffer);
  const cell = cellOf(src, w, h);
  const cw = w / cell;
  const ch = h / cell;
  const solid = (cx: number, cy: number) =>
    cx >= 0 && cy >= 0 && cx < cw && cy < ch && px[(cy * cell * w + cx * cell) * 4 + 3] >= 128;
  const out = new Uint32Array(w * h);
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      if (!solid(cx, cy)) continue; // see-through stays see-through
      const p = (cy * cell * w + cx * cell) * 4;
      const rim = outline && (!solid(cx - 1, cy) || !solid(cx + 1, cy) || !solid(cx, cy - 1) || !solid(cx, cy + 1));
      const v = rim ? BLACK : dot(LEVEL[gray(px[p], px[p + 1], px[p + 2], LEAF_LIFT)], cx, cy);
      for (let y = cy * cell; y < (cy + 1) * cell; y++) out.fill(v, y * w + cx * cell, y * w + (cx + 1) * cell);
    }
  }
  src.set(out);
  ctx.putImageData(d, 0, 0);
  return m;
}
