// Sprite helpers for the HTML side: shop icons, <img> tags, and the tiny menubar bunny.
import type { CropKind, DefenseKind } from '../config';
import { PixelGrid } from './pixels';
import { type Img, sprites } from './sprites';

const urls = new WeakMap<Img, string>();

export function dataURL(img: Img): string {
  let u = urls.get(img);
  if (!u) {
    u = img.toDataURL();
    urls.set(img, u);
  }
  return u;
}

/** An <img> of a whole sprite at an exact pixel scale. */
export function spriteImg(img: Img, scale: number, style = ''): string {
  return `<img src="${dataURL(img)}" width="${img.width * scale}" height="${img.height * scale}" alt="" ` +
    `style="image-rendering:pixelated;${style}">`;
}

/** Fit a sprite into a square box: small ones as-is, tall ones keep their top, wide ones shrink. */
function fit(img: Img, box: number): Img {
  const c = document.createElement('canvas');
  c.width = box;
  c.height = box;
  const ctx = c.getContext('2d')!;
  if (img.width <= box && img.height <= box) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, (box - img.width) >> 1, box - img.height);
  } else if (img.width <= box + 4) {
    ctx.imageSmoothingEnabled = false;
    const w = Math.min(box, img.width);
    ctx.drawImage(img, (img.width - w) >> 1, 0, w, box, (box - w) >> 1, 0, w, box);
  } else {
    const k = box / Math.max(img.width, img.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (box - img.width * k) / 2, box - img.height * k, img.width * k, img.height * k);
  }
  return c;
}

const icons = new Map<string, Img>();

export function itemIcon(kind: CropKind | DefenseKind | 'remove' | 'upgrade'): Img {
  let icon = icons.get(kind);
  if (icon) return icon;
  const sp = sprites();
  let src: Img;
  if (kind === 'remove') src = shovel();
  else if (kind === 'upgrade') src = hammer();
  else if (kind in sp.crops) src = sp.crops[kind as CropKind].ripe;
  else {
    switch (kind as DefenseKind) {
      case 'fence': src = sp.fence[10]; break;
      case 'trap': src = sp.defenses.trapOpen; break;
      case 'scarecrow': src = sp.defenses.scarecrow; break;
      case 'sprinkler': src = sp.defenses.sprinkler; break;
      case 'turret': src = sp.defenses.turret; break;
      default: src = sp.defenses.doghouse; break;
    }
  }
  if (kind === 'fence') {
    // the fence art has headroom above the tile; frame the post and rails
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    c.getContext('2d')!.drawImage(src, 0, -8);
    icon = c;
  } else {
    icon = fit(src, 32);
  }
  icons.set(kind, icon);
  return icon;
}

export const iconURL = (kind: CropKind | DefenseKind | 'remove' | 'upgrade'): string => dataURL(itemIcon(kind));

// ---------------------------------------------------------------- drawn-in-code bits

const SHOVEL = [
  '................',
  '...........bb...',
  '..........bnnb..',
  '...........bb...',
  '..........bb....',
  '.........bb.....',
  '........bb......',
  '.......bb.......',
  '...ss.bb........',
  '..sssSb.........',
  '.sssssS.........',
  '.sssssS.........',
  '.ssssS..........',
  '..sSS...........',
  '................',
  '................',
];

function shovel(): Img {
  return PixelGrid.fromRows(SHOVEL, { b: '#7a4f2e', n: '#b98356', s: '#c9ced6', S: '#6d737d' }).outlined().scaled(2).canvas();
}

const HAMMER = [
  '................',
  '.....ggg........',
  '....gGGGgg......',
  '...gGGGGGGg.....',
  '....gGGGGGGgg...',
  '.....ggbGGGgy...',
  '.......bbggy.y..',
  '......bnb..yy...',
  '.....bnb........',
  '....bnb.........',
  '...bnb..........',
  '..bnb...........',
  '.bnb............',
  '.bb.............',
  '................',
  '................',
];

function hammer(): Img {
  return PixelGrid.fromRows(HAMMER, { b: '#7a4f2e', n: '#b98356', g: '#6d737d', G: '#b8bec8', y: '#ffe24a' }).outlined().scaled(2).canvas();
}

const MENU_BUNNY = [
  '................',
  '..........d.aa..',
  '..........d.ap..',
  '..........d.ap..',
  '.........dd.ap..',
  '..........aaaa..',
  '.........aaaaaa.',
  '.....aaaaaaakaa.',
  '...aaaaaaaaallp.',
  '.wwaaaaaaaallll.',
  '.wwaaaaaaaalll..',
  '.wwaaddaaaalll..',
  '..aaadddaaalll..',
  '..daaaaadalll...',
  '...ddd...lll....',
  '................',
];

/** The 16px bunny in the menubar, where the Apple menu used to be. */
export function menuBunny(): Img {
  return PixelGrid.fromRows(MENU_BUNNY, {
    a: '#9c6b4c', d: '#5e3d2b', l: '#c89872', p: '#f29bb0', w: '#ffffff', k: '#1a1423',
  }).outlined().canvas();
}
