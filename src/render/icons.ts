// Sprite helpers for the HTML side: shop icons, <img> tags, and the tiny menubar bunny.
import { type CropKind, type DefenseKind, FARM_X0, FARM_Y0, type FarmUpgrade, LOT, LOTS_X, LOTS_Y, START_LOTS, type WeaponKind } from '../config';
import { FARMS, type MapKind } from '../world';
import { monoSprite } from './mono';
import { PixelGrid } from './pixels';
import { type Img, sprites } from './sprites';

const urls = new WeakMap<Img, string>();
const sources = new Map<string, Img>(); // each data URL handed out, back to the sprite it shows
let mono = false;

export function dataURL(img: Img): string {
  const shown = mono ? monoSprite(img) : img;
  let u = urls.get(shown);
  if (!u) {
    u = shown.toDataURL();
    urls.set(shown, u);
    sources.set(u, img);
  }
  return u;
}

export const monoIcons = (): boolean => mono;

/** 1993 Mode for the pictures in the windows: new ones come out black and white, and the ones up already change over. */
export function setMonoIcons(on: boolean): void {
  if (on === mono) return;
  mono = on;
  for (const el of Array.from(document.images)) {
    const img = sources.get(el.src);
    if (img) el.src = dataURL(img);
  }
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

export type ToolKind = 'remove' | 'upgrade' | 'till' | 'land' | 'smoke';

export function itemIcon(kind: CropKind | DefenseKind | ToolKind): Img {
  let icon = icons.get(kind);
  if (icon) return icon;
  const sp = sprites();
  let src: Img;
  if (kind === 'remove') src = shovel();
  else if (kind === 'upgrade') src = hammer();
  else if (kind === 'till') src = icon16(HOE);
  else if (kind === 'land') src = icon16(SIGN);
  else if (kind === 'smoke') src = bomb();
  else if (kind in sp.crops) src = sp.crops[kind as CropKind].ripe;
  else {
    switch (kind as DefenseKind) {
      case 'fence': src = sp.fence[10]; break;
      case 'trap': src = sp.defenses.trapOpen; break;
      case 'scarecrow': src = sp.defenses.scarecrow; break;
      case 'sprinkler': src = sp.defenses.sprinkler; break;
      case 'turret': src = sp.defenses.turret; break;
      case 'thumper': src = sp.defenses.thumperUp; break;
      case 'decoy': src = sp.defenses.decoy; break;
      case 'beehive': src = sp.defenses.beehive; break;
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

export const iconURL = (kind: CropKind | DefenseKind | ToolKind): string => dataURL(itemIcon(kind));

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

const WRENCH = [
  '................',
  '..........GG....',
  '.........GGn....',
  '........GGn...g.',
  '........Gn...gg.',
  '........Gn..ggg.',
  '........Gnnggg..',
  '.......Gnggg....',
  '......Gngg......',
  '.....Gng........',
  '....Gng.........',
  '...Gng..........',
  '..Gng...........',
  '.Gng............',
  '.gg.............',
  '................',
];

const BOMB = [
  '...........ss...',
  '..........ssss..',
  '..........sSss..',
  '.........y.ss...',
  '........yoy.....',
  '.........f......',
  '......ccf.......',
  '....kkcckk......',
  '...kkkkkkkk.....',
  '..kkwkkkkkkk....',
  '..kwwkkkkkkk....',
  '..kwkkkkkkkk....',
  '..kkkkkkkkkd....',
  '...kkkkkkkd.....',
  '....kkkkdd......',
  '................',
];

/** The smoke bomb: lit, and already puffing. */
function bomb(): Img {
  return PixelGrid.fromRows(BOMB, {
    k: '#3a3c4a', w: '#9a9eb0', d: '#2a2b36', c: '#6d737d', f: '#b98356', y: '#ffe24a', o: '#ff8a2a', s: '#d8d8e0', S: '#f4f4f8',
  }).outlined().scaled(2).canvas();
}

let wrenchIcon: Img | null = null;

/** Repair All, in the Defense tab. */
export function repairIcon(): Img {
  wrenchIcon ??= PixelGrid.fromRows(WRENCH, { G: '#d4d9e0', n: '#9aa1ab', g: '#6d737d' }).outlined().scaled(2).canvas();
  return wrenchIcon;
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

// ---------------------------------------------------------------- the weapon shop and the farm office

const P = {
  wood: '#b98050', woodD: '#7d5230', band: '#c0392b', stone: '#9aa3b0', steel: '#6d737d', steelL: '#c3cad4',
  pipe: '#e8ecf0', pipeD: '#9aa3b0', spud: '#c8964a', spudD: '#8a5a2a', hose: '#3f9a36', hoseL: '#7ad05a',
  brass: '#e0a830', water: '#8fd3ff', red: '#d8322a', redL: '#ff7a5a', gold: '#ffd84a', soil: '#6b4428',
  sack: '#d8c49a', sackD: '#a8905a', leaf: '#46922f', leafL: '#72c24a', glass: '#bfe6ff', glassD: '#7ab8e0',
  white: '#ffffff', stripe: '#e0457b', flask: '#dfe8f0',
};

function icon16(draw: (g: PixelGrid) => void): Img {
  const g = new PixelGrid(16, 16);
  draw(g);
  return g.outlined().scaled(2).canvas();
}

const WEAPON_ICONS: Record<WeaponKind, (g: PixelGrid) => void> = {
  sling: (g) => {
    g.rect(7, 9, 2, 6, P.wood);
    g.line(7, 9, 3, 3, P.wood);
    g.line(8, 9, 12, 3, P.wood);
    g.line(3, 3, 7, 7, P.band);
    g.line(12, 3, 8, 7, P.band);
    g.ellipse(7.5, 7.5, 1.6, 1.6, P.stone);
  },
  pellet: (g) => {
    g.rect(1, 6, 13, 2, P.steel);
    g.rect(1, 6, 13, 1, P.steelL);
    g.rect(8, 8, 6, 3, P.wood);
    g.rect(11, 8, 3, 5, P.wood);
    g.set(9, 9, P.woodD);
    g.rect(14, 5, 1, 2, P.steel);
  },
  spud: (g) => {
    g.line(2, 13, 11, 4, P.pipeD);
    g.line(3, 13, 12, 4, P.pipe);
    g.line(3, 12, 12, 3, P.pipe);
    g.rect(1, 12, 4, 3, P.pipeD);
    g.ellipse(12.5, 3.5, 2.2, 1.8, P.spud);
    g.set(12, 3, P.spudD);
  },
  hose: (g) => {
    g.ellipse(6, 10, 5, 4, P.hose);
    g.ellipse(6, 10, 3, 2, P.hoseL);
    g.ellipse(6, 10, 1.5, 0.8, P.hose);
    g.line(10, 8, 13, 5, P.brass);
    for (const [x, y] of [[14, 2], [12, 1], [15, 4], [13, 3]]) g.set(x, y, P.water);
  },
  rocket: (g) => {
    g.line(3, 14, 9, 8, P.woodD);
    g.line(8, 9, 12, 5, P.red);
    g.line(9, 9, 13, 5, P.red);
    g.line(8, 8, 12, 4, P.redL);
    g.rect(12, 2, 2, 2, P.gold);
    for (const [x, y] of [[3, 3], [6, 1], [15, 9], [1, 7]]) g.set(x, y, P.gold);
  },
};

const FARM_ICONS: Record<FarmUpgrade | 'lab', (g: PixelGrid) => void> = {
  soil: (g) => {
    g.ellipse(8, 10, 5.5, 5, P.sack);
    g.rect(5, 4, 6, 2, P.sackD);
    g.rect(6, 8, 4, 1, P.sackD);
    g.line(8, 4, 8, 1, P.leaf);
    g.set(7, 1, P.leafL);
    g.set(9, 2, P.leafL);
  },
  well: (g) => {
    g.rect(6, 5, 4, 9, P.steel);
    g.rect(6, 5, 1, 9, P.steelL);
    g.rect(3, 13, 10, 2, P.woodD);
    g.line(9, 5, 14, 2, P.steel);
    g.rect(10, 7, 3, 1, P.steel);
    g.set(12, 9, P.water);
    g.set(12, 11, P.water);
  },
  stall: (g) => {
    for (let x = 1; x < 15; x++) g.rect(x, 2, 1, 4, x % 4 < 2 ? P.stripe : P.white);
    g.rect(2, 6, 1, 8, P.woodD);
    g.rect(13, 6, 1, 8, P.woodD);
    g.rect(2, 10, 12, 4, P.wood);
    g.ellipse(6, 9, 1.5, 1.2, '#e0342a');
    g.ellipse(10, 9, 1.5, 1.2, '#f08a24');
  },
  greenhouse: (g) => {
    for (let y = 3; y < 14; y++) {
      const hw = y < 7 ? y - 2 : 6;
      g.rect(8 - hw, y, hw * 2, 1, y % 3 === 0 ? P.glassD : P.glass);
    }
    g.rect(7, 3, 2, 11, P.white);
    g.rect(2, 13, 12, 1, P.white);
    g.set(5, 11, P.leaf);
    g.set(10, 11, P.leaf);
  },
  lab: (g) => {
    g.rect(6, 2, 4, 5, P.flask);
    g.ellipse(8, 11, 5, 4, P.flask);
    g.ellipse(8, 12, 4, 2.5, P.leafL);
    g.line(8, 12, 8, 6, P.leaf);
    g.set(7, 7, P.leafL);
    g.set(9, 8, P.leafL);
    g.set(6, 11, P.white);
  },
};

/** The hoe: a long handle and a blade, over a turned-up patch of soil. */
const HOE = (g: PixelGrid) => {
  g.ellipse(8, 13, 6.5, 2, '#6b4428');
  g.rect(4, 12, 9, 1, '#8d5835');
  g.line(13, 1, 7, 10, P.wood);
  g.line(14, 2, 8, 11, P.woodD);
  g.rect(3, 9, 6, 3, P.steel);
  g.rect(3, 9, 6, 1, P.steelL);
};

/** A FOR SALE sign on a post. */
const SIGN = (g: PixelGrid) => {
  g.rect(7, 8, 2, 7, P.woodD);
  g.rect(2, 2, 12, 7, P.white);
  g.rect(2, 2, 12, 1, P.stripe);
  g.rect(4, 4, 8, 1, P.red);
  g.rect(4, 6, 6, 1, P.red);
  g.ellipse(8, 15, 3, 1, '#6b4428');
};

const shopIcons = new Map<string, Img>();

export function weaponIcon(kind: WeaponKind): Img {
  let i = shopIcons.get(kind);
  if (!i) shopIcons.set(kind, (i = icon16(WEAPON_ICONS[kind])));
  return i;
}

export function farmIcon(kind: FarmUpgrade | 'lab'): Img {
  let i = shopIcons.get(`farm:${kind}`);
  if (!i) shopIcons.set(`farm:${kind}`, (i = icon16(FARM_ICONS[kind])));
  return i;
}

// ---------------------------------------------------------------- farm maps, for picking one

const MINI = 3; // pixels per tile
const miniMaps = new Map<MapKind, HTMLCanvasElement>();

/** A little map of a farm: meadow, the lots (the starting ones tilled), water, trees, and the crater. */
export function farmMiniMap(kind: MapKind): HTMLCanvasElement {
  const done = miniMaps.get(kind);
  if (done) return done;
  const m = FARMS[kind];
  const c = document.createElement('canvas');
  c.width = 22 * MINI;
  c.height = 16 * MINI;
  const ctx = c.getContext('2d')!;
  const tile = (x: number, y: number, color: string, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * MINI, y * MINI, w * MINI, h * MINI);
  };
  tile(0, 0, '#5b9a44', 22, 16);
  tile(FARM_X0, FARM_Y0, '#6cae4e', LOTS_X * LOT, LOTS_Y * LOT);
  for (const n of START_LOTS) {
    const x = FARM_X0 + (n % LOTS_X) * LOT;
    const y = FARM_Y0 + Math.floor(n / LOTS_X) * LOT;
    tile(x, y, '#7a5234', LOT, LOT);
    for (let r = 0; r < LOT * MINI; r += 2) {
      ctx.fillStyle = '#5e3c20';
      ctx.fillRect(x * MINI, y * MINI + r, LOT * MINI, 1);
    }
  }
  for (const [x, y] of m.water) tile(x, y, '#3a80bb');
  for (const [x, y] of m.bridges) tile(x, y, '#9a6a3c');
  for (const o of m.scenery) {
    const cx = o.x * MINI;
    const cy = o.y * MINI;
    switch (o.kind) {
      case 'crater':
        tile(o.x, o.y, '#5e4128', o.w, o.h);
        ctx.fillStyle = '#9dff6b';
        ctx.fillRect(cx + 2, cy + 2, o.w * MINI - 4, o.h * MINI - 4);
        break;
      case 'pond':
        tile(o.x, o.y, '#3a80bb', o.w, o.h);
        break;
      case 'tree_oak':
      case 'tree_apple':
      case 'bush':
        ctx.fillStyle = o.kind === 'bush' ? '#3f7d32' : '#2c6326';
        ctx.fillRect(cx, cy, MINI, MINI);
        if (o.kind === 'tree_apple') {
          ctx.fillStyle = '#d23b2e';
          ctx.fillRect(cx + 1, cy + 1, 1, 1);
        }
        break;
      case 'haybale':
        tile(o.x, o.y, '#d8b64a');
        break;
      case 'stump':
        tile(o.x, o.y, '#7a5234');
        break;
      case 'rocks':
        ctx.fillStyle = '#9a9aa4';
        ctx.fillRect(cx + 1, cy + 1, 2, 1);
        break;
      case 'flowers':
        ctx.fillStyle = '#f29bb0';
        ctx.fillRect(cx + 1, cy + 1, 1, 1);
        break;
    }
  }
  miniMaps.set(kind, c);
  return c;
}

// ---------------------------------------------------------------- the travelling merchant

const CART = [
  '...rrwwrrwwrrwwrrwwrrwwrr...',
  '..rrwwrrwwrrwwrrwwrrwwrrww..',
  '.rrwwrrwwrrwwrrwwrrwwrrwwrr.',
  '.RRWWRRWWRRWWRRWWRRWWRRWWRR.',
  '..p......................p..',
  '..p..oo....yy.....gg.....p..',
  '..p.oOOo..yYYy...gGGg....p..',
  '..p.oOOo..yYYy..cccccc...p..',
  '..p..oo...cccccccCccccc..p..',
  '.bbbbbbbbbbbbbbbbbbbbbbbbbb.',
  '.bnnnnnnnnnnnnnnnnnnnnnnnnb.',
  '.bnnnnnnnnnnnnnnnnnnnnnnnnb.',
  '.bbbbbbbbbbbbbbbbbbbbbbbbbb.',
  '...kkk................kkk...',
  '..kwkwk..............kwkwk..',
  '..kkWkk..............kkWkk..',
  '..kwkwk..............kwkwk..',
  '...kkk................kkk...',
];

let cart: Img | null = null;

/** The travelling merchant's cart: a striped awning over crates and produce. */
export function merchantCart(): Img {
  cart ??= PixelGrid.fromRows(CART, {
    r: '#c8342c', R: '#9a241e', w: '#f4ecd8', W: '#c8bca4', p: '#6e4626', o: '#e08a2a', O: '#f2a84a', y: '#e8c03a',
    Y: '#ffe26a', g: '#4a903a', G: '#6cb84e', c: '#9a6a3c', C: '#7a502a', b: '#6e4626', n: '#a8743e', k: '#2a2226',
  }).outlined().canvas();
  return cart;
}

// ---------------------------------------------------------------- achievements

const TROPHY = [
  '..yyyyyyyy..',
  'yyYYYYYYyyyy',
  'y.yYYYYYyy.y',
  'y.yYYYYYyy.y',
  '.yyYYYYyyyy.',
  '...yYYYyy...',
  '....yYyy....',
  '.....yy.....',
  '.....yy.....',
  '...bbbbbb...',
  '..bnnnnnnb..',
  '..bbbbbbbb..',
];

let trophy: Img | null = null;

/** A little gold cup. */
export function trophyIcon(): Img {
  trophy ??= PixelGrid.fromRows(TROPHY, { y: '#e0a82e', Y: '#ffe26a', b: '#6e4626', n: '#a8743e' }).outlined().scaled(2).canvas();
  return trophy;
}
