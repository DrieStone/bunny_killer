// The Farm Legacy's landmarks, drawn in code: a roadside stand, a windmill whose sails turn, a bell tower whose
// bell swings when it rings, a fairground tent with a pennant, and a golden slingshot on a stone plinth.
import type { LandmarkKind } from '../config';
import { OUTLINE, PixelGrid } from './pixels';
import type { Img } from './sprites';

const WOOD = { light: '#c08a52', mid: '#9a6a3c', dark: '#6e4626', deep: '#4e301a' };
const PAINT = { white: '#f4efe4', shade: '#d3c9b6', red: '#c8412f', redLight: '#e2654c', redDark: '#96301f' };
const ROOF = { light: '#8f98ab', mid: '#687086', dark: '#4a5063' };
const STONE = { light: '#dcd7cc', mid: '#b8b2a6', dark: '#8d877c' };
const GOLD = { light: '#fff1a8', mid: '#f2c23a', dark: '#b8821c' };
const BRONZE = { light: '#f7d67a', mid: '#d9a441', dark: '#9a6a20' };
const GREEN = { light: '#8fd06a', mid: '#5aa83a', dark: '#3c7a2a' };
const ORANGE = { light: '#ffb060', mid: '#f08a2c', dark: '#b8561c' };
const GLASS = { mid: '#5a7ab0', light: '#a8cdf2' };

export const WINDMILL_FRAMES = 8; // a quarter turn of the sails
export const BELL_FRAMES = 3; // swung left, hanging, swung right
export const FLAG_FRAMES = 2;

/** A stall under a striped awning, the counter piled with carrots, pumpkins, and a melon. 40x36. */
function stand(): Img {
  const g = new PixelGrid(40, 36);
  // the posts
  for (const x of [3, 34]) {
    g.rect(x, 9, 3, 25, WOOD.mid);
    g.rect(x, 9, 1, 25, WOOD.light);
  }
  // the sign on top, with a carrot painted on it
  g.rect(12, 0, 16, 5, WOOD.light);
  g.rect(12, 4, 16, 1, WOOD.dark);
  g.rect(16, 2, 6, 1, ORANGE.mid);
  g.rect(17, 1, 3, 1, ORANGE.mid);
  g.set(15, 2, ORANGE.mid);
  for (const [x, y] of [[22, 1], [23, 2], [22, 3]]) g.set(x, y, GREEN.mid);
  // the awning: red and white stripes, a lighter top edge, a scalloped hem
  for (let x = 1; x < 39; x++) {
    const red = Math.floor((x - 1) / 4) % 2 === 0;
    g.rect(x, 5, 1, 6, red ? PAINT.red : PAINT.white);
    g.set(x, 5, red ? PAINT.redLight : '#ffffff');
    g.set(x, 10, red ? PAINT.redDark : PAINT.shade);
    const k = (x - 1) % 4;
    if (k === 1 || k === 2) g.set(x, 11, red ? PAINT.red : PAINT.white);
  }
  // the counter
  g.rect(2, 22, 36, 2, WOOD.light);
  g.rect(2, 24, 36, 9, WOOD.mid);
  for (const x of [8, 14, 20, 26, 32]) g.rect(x, 24, 1, 9, WOOD.dark);
  g.rect(2, 33, 36, 1, WOOD.deep);
  // a crate of carrots
  g.rect(5, 17, 10, 5, WOOD.dark);
  g.rect(5, 17, 10, 1, WOOD.light);
  g.rect(5, 19, 10, 1, WOOD.mid);
  for (const x of [6, 8, 10, 12]) {
    g.rect(x, 14, 2, 3, ORANGE.mid);
    g.set(x, 14, ORANGE.light);
    g.set(x, 13, GREEN.mid);
    g.set(x + 1, 12, GREEN.dark);
  }
  // two pumpkins
  for (const [x, r] of [[19.5, 3.5], [25.5, 2.8]] as const) {
    g.ellipse(x, 19, r, r * 0.8, ORANGE.mid);
    g.rect(Math.round(x) - 1, 16, 1, 6, ORANGE.dark);
    g.set(Math.round(x) - 2, Math.round(19 - r * 0.8), ORANGE.light);
    g.set(Math.round(x), Math.round(19 - r * 0.8) - 1, GREEN.dark);
  }
  // a watermelon
  g.ellipse(32.5, 19.5, 4, 2.6, GREEN.dark);
  for (const x of [30, 33, 35]) g.rect(x, 18, 1, 3, GREEN.light);
  return g.outlined(OUTLINE).canvas();
}

/** A white wooden windmill on a stone footing, its four sails turned `frame` eighths of a quarter turn. 48x66. */
function windmill(frame: number): Img {
  const g = new PixelGrid(48, 66);
  const hx = 24;
  const hy = 20;
  // the footing
  g.rect(12, 58, 24, 7, STONE.mid);
  g.rect(12, 58, 24, 1, STONE.light);
  for (const [x, y] of [[15, 60], [22, 61], [29, 60], [18, 63], [26, 63], [33, 62]]) g.rect(x, y, 3, 1, STONE.dark);
  // the tower: white boards, tapering from 20 wide down low to 12 under the cap, shaded on the right
  for (let y = 22; y < 58; y++) {
    const half = Math.round(6 + ((y - 22) / 36) * 4);
    g.rect(hx - half, y, half * 2, 1, y % 4 === 0 ? PAINT.shade : PAINT.white);
    g.rect(hx + half - 3, y, 3, 1, PAINT.shade);
  }
  // the door, and a little window
  g.rect(hx - 3, 50, 6, 8, WOOD.dark);
  g.rect(hx - 3, 50, 6, 1, WOOD.mid);
  g.set(hx + 1, 54, BRONZE.mid);
  g.rect(hx - 2, 34, 4, 4, GLASS.mid);
  g.set(hx - 2, 34, GLASS.light);
  // the cap
  for (let y = 12; y < 23; y++) {
    const half = Math.round(3 + (y - 12) * 0.8);
    g.rect(hx - half, y, half * 2, 1, ROOF.mid);
    g.set(hx - half, y, ROOF.light);
    g.set(hx + half - 1, y, ROOF.dark);
  }
  // the sails: a spar each, cloth on the trailing side, a lattice line every few pixels
  const a0 = (frame / WINDMILL_FRAMES) * (Math.PI / 2);
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let t = 2; t <= 21; t += 0.5) {
      const x = hx + cos * t;
      const y = hy + sin * t;
      if (t >= 5) {
        for (let w = 1; w <= 5; w += 0.5) {
          const lattice = Math.round(t) % 4 === 0 || w >= 5;
          g.set(x - sin * w, y + cos * w, lattice ? WOOD.mid : PAINT.white);
        }
      }
      g.set(x, y, WOOD.dark);
    }
  }
  // the hub
  g.rect(hx - 1, hy - 1, 3, 3, WOOD.deep);
  g.set(hx, hy, BRONZE.light);
  return g.outlined(OUTLINE).canvas();
}

/** A white bell tower with a slate spire, the bronze bell swung by `swing` (-1, 0, 1). 28x58. */
function bellTower(swing: number): Img {
  const g = new PixelGrid(28, 58);
  const cx = 14;
  // the base: clapboards, shaded on the right
  g.rect(5, 32, 18, 25, PAINT.white);
  for (let y = 34; y < 57; y += 3) g.rect(5, y, 18, 1, PAINT.shade);
  g.rect(19, 32, 4, 25, PAINT.shade);
  // an arched door
  g.rect(cx - 3, 47, 6, 10, WOOD.dark);
  g.rect(cx - 2, 46, 4, 1, WOOD.dark);
  g.set(cx + 1, 52, BRONZE.mid);
  // the ledge under the belfry
  g.rect(3, 30, 22, 2, PAINT.shade);
  g.rect(3, 30, 22, 1, PAINT.white);
  // the belfry: corner posts and a lintel, open between
  g.rect(5, 15, 3, 15, PAINT.white);
  g.rect(20, 15, 3, 15, PAINT.shade);
  g.rect(5, 15, 18, 2, PAINT.white);
  // the bell
  const bx = cx + swing;
  const widths = [2, 4, 5, 6, 6, 7, 7, 8, 9, 10];
  widths.forEach((w, r) => {
    const x0 = Math.round(bx - w / 2);
    g.rect(x0, 17 + r, w, 1, BRONZE.mid);
    g.set(x0, 17 + r, BRONZE.light);
    g.set(x0 + w - 1, 17 + r, BRONZE.dark);
  });
  g.rect(Math.round(bx - 5), 27, 10, 1, BRONZE.dark);
  g.rect(Math.round(bx - 1 - swing), 28, 2, 2, BRONZE.dark); // the clapper lags the swing
  // the spire and its eaves
  for (let y = 3; y < 15; y++) {
    const half = Math.round(1 + (y - 3) * 0.9);
    g.rect(cx - half, y, half * 2, 1, ROOF.mid);
    g.rect(cx - half, y, Math.max(1, Math.floor(half / 2)), 1, ROOF.light);
  }
  g.rect(3, 13, 22, 2, ROOF.dark);
  // a gold finial
  g.rect(cx - 1, 0, 2, 3, GOLD.mid);
  g.set(cx - 1, 0, GOLD.light);
  return g.outlined(OUTLINE).canvas();
}

/** A red-and-white big top with its flaps tied back and a pennant on the pole. 48x42. */
function fairground(frame: number): Img {
  const g = new PixelGrid(48, 42);
  const cx = 24;
  // the walls
  for (let x = 4; x < 44; x++) {
    const red = Math.floor((x - 4) / 5) % 2 === 0;
    g.rect(x, 22, 1, 18, x >= 36 ? (red ? PAINT.redDark : PAINT.shade) : red ? PAINT.red : PAINT.white);
  }
  // the entrance
  g.rect(cx - 4, 27, 8, 13, '#3a2230');
  for (let y = 27; y < 40; y++) {
    const w = Math.max(0, Math.round((39 - y) * 0.3)); // the flaps, tied back: a doorway wider at the bottom
    g.rect(cx - 4, y, w, 1, PAINT.white);
    g.rect(cx + 4 - w, y, w, 1, PAINT.shade);
  }
  // the roof: stripes running up to the peak
  for (let y = 6; y < 23; y++) {
    const half = Math.round(2 + (y - 6) * 1.3);
    for (let x = cx - half; x < cx + half; x++) {
      const band = Math.floor(((x - cx) / half + 1) * 5);
      const red = band % 2 === 0;
      g.set(x, y, x >= cx + half * 0.55 ? (red ? PAINT.redDark : PAINT.shade) : red ? PAINT.red : PAINT.white);
    }
  }
  // the scalloped eave
  for (let x = 3; x < 45; x++) {
    if ((x - 3) % 4 === 3) continue;
    g.set(x, 23, Math.floor((x - 3) / 4) % 2 === 0 ? PAINT.red : PAINT.white);
  }
  // the pole and pennant, snapping in the wind
  g.rect(cx, 0, 1, 7, WOOD.dark);
  const lift = frame % 2;
  for (let r = 0; r < 4; r++) {
    const w = 7 - r * 2;
    g.rect(cx + 1, r + (r === 3 ? lift : 0), w - (r === 0 ? lift : 0), 1, r === 0 ? '#ffe24a' : '#f2c23a');
  }
  return g.outlined(OUTLINE).canvas();
}

/** The golden slingshot on a stone plinth with a brass plaque. 28x48. */
function statue(): Img {
  const g = new PixelGrid(28, 48);
  const cx = 14;
  // the plinth: a cap slab, the block shaded on the right, a footing
  g.rect(4, 31, 20, 3, STONE.light);
  g.rect(4, 33, 20, 1, STONE.mid);
  g.rect(5, 34, 18, 11, STONE.mid);
  g.rect(19, 34, 4, 11, STONE.dark);
  g.rect(3, 45, 22, 3, STONE.dark);
  g.rect(3, 45, 22, 1, STONE.mid);
  // the plaque
  g.rect(8, 37, 10, 5, BRONZE.mid);
  g.rect(8, 37, 10, 1, BRONZE.light);
  for (const [x, w] of [[10, 6], [11, 4]] as const) g.rect(x, 39 + (x - 10) * 1, w, 1, BRONZE.dark);
  // the slingshot: a handle and two arms, lit from the left
  g.rect(cx - 1, 19, 3, 12, GOLD.mid);
  g.rect(cx - 1, 19, 1, 12, GOLD.light);
  g.rect(cx + 1, 19, 1, 12, GOLD.dark);
  g.rect(cx - 2, 29, 5, 2, GOLD.dark);
  for (const side of [-1, 1]) {
    for (let t = 0; t <= 1; t += 0.05) {
      const x = cx + side * (1 + t * 7);
      const y = 19 - t * 14;
      g.rect(x - 1, y, 3, 1, GOLD.mid);
      g.set(x - 1, y, side < 0 ? GOLD.light : GOLD.mid);
      g.set(x + 1, y, side > 0 ? GOLD.dark : GOLD.mid);
    }
  }
  // the band, drawn back a little, with a pebble in the pouch
  g.line(cx - 8, 5, cx - 1, 9, '#6b3a2a');
  g.line(cx + 8, 5, cx + 1, 9, '#6b3a2a');
  g.rect(cx - 1, 8, 3, 3, STONE.dark);
  g.set(cx - 1, 8, STONE.light);
  return g.outlined(OUTLINE).canvas();
}

const cache = new Map<string, Img>();
const once = (key: string, make: () => Img): Img => {
  let img = cache.get(key);
  if (!img) cache.set(key, (img = make()));
  return img;
};

/** A landmark's picture: `frame` turns the windmill's sails, swings the bell, or flaps the pennant. */
export function landmarkArt(kind: LandmarkKind, frame = 0): Img {
  switch (kind) {
    case 'stand': return once('stand', stand);
    case 'windmill': return once(`windmill${frame % WINDMILL_FRAMES}`, () => windmill(frame % WINDMILL_FRAMES));
    case 'bell': return once(`bell${frame}`, () => bellTower(frame - 1));
    case 'fairground': return once(`fair${frame % FLAG_FRAMES}`, () => fairground(frame % FLAG_FRAMES));
    case 'statue': return once('statue', statue);
  }
}
