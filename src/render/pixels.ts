// Tiny pixel-art toolkit: build sprites from text rows or drawing calls, auto-outline them,
// and a 3x5 bitmap font for in-world numbers.

export const OUTLINE = '#2a1b14';

export type Palette = Record<string, string>;

export class PixelGrid {
  readonly px: (string | null)[];
  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null);
  }

  static fromRows(rows: string[], pal: Palette): PixelGrid {
    const w = Math.max(...rows.map((r) => r.length));
    const g = new PixelGrid(w, rows.length);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = pal[row[x]];
        if (c) g.set(x, y, c);
      }
    });
    return g;
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }

  set(x: number, y: number, c: string | null): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: string | ((x: number, y: number) => string | null)): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, typeof c === 'string' ? c : c(x, y));
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) this.set(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, c);
  }

  /** Add a 1px outline around every filled pixel (4-neighborhood). */
  outlined(color = OUTLINE): PixelGrid {
    const out = new PixelGrid(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) out.px[i] = this.px[i];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) out.set(x, y, color);
      }
    }
    return out;
  }

  /** Same shape, every pixel one color (hit flashes, shadows). */
  silhouette(color: string): PixelGrid {
    const out = new PixelGrid(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) out.px[i] = this.px[i] ? color : null;
    return out;
  }

  scaled(k: number): PixelGrid {
    const out = new PixelGrid(this.w * k, this.h * k);
    for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.px[y * out.w + x] = this.get((x / k) | 0, (y / k) | 0);
    return out;
  }

  canvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) {
      const col = this.px[i];
      if (!col) continue;
      const [r, g, b, a] = parseColor(col);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

const colorCache = new Map<string, [number, number, number, number]>();
function parseColor(c: string): [number, number, number, number] {
  let v = colorCache.get(c);
  if (!v) {
    const hex = c.replace('#', '');
    const n = parseInt(hex.slice(0, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    colorCache.set(c, v);
  }
  return v;
}

export function sprite(rows: string[], pal: Palette, outline: string | null = OUTLINE): HTMLCanvasElement {
  const g = PixelGrid.fromRows(rows, pal);
  return (outline ? g.outlined(outline) : g).canvas();
}

// ---------------------------------------------------------------- 3x5 font

// each glyph: five rows of three, top to bottom
const GLYPHS: Record<string, string> = {
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###',
  '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
  '+': '... .#. ### .#. ...', '-': '... ... ### ... ...', '!': '.#. .#. .#. ... .#.', '¢': '.#. ### #.. ### .#.',
  '?': '##. ..# .#. ... .#.', '.': '... ... ... ... .#.', ':': '... .#. ... .#. ...', x: '... #.# .#. #.# ...',
  '/': '..# ..# .#. #.. #..', ' ': '... ... ... ... ...', "'": '.#. .#. ... ... ...',
};

const FONT: Record<string, boolean[]> = {};
for (const [ch, rows] of Object.entries(GLYPHS)) FONT[ch] = [...rows.replace(/ /g, '')].map((c) => c === '#');

export function textWidth(text: string, scale = 1): number {
  return text.length === 0 ? 0 : (text.length * 4 - 1) * scale;
}

/** Draw pixel text with its top-left at (x, y). */
export function drawText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string,
  outline: string | null = OUTLINE, scale = 1, outlineWidth = scale,
): void {
  const up = text.toUpperCase();
  const plot = (col: string, ox: number, oy: number) => {
    ctx.fillStyle = col;
    for (let n = 0; n < up.length; n++) {
      const g = FONT[up[n]] ?? FONT['?'];
      for (let i = 0; i < 15; i++) {
        if (!g[i]) continue;
        ctx.fillRect(x + (n * 4 + (i % 3)) * scale + ox, y + ((i / 3) | 0) * scale + oy, scale, scale);
      }
    }
  };
  if (outline) {
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      plot(outline, ox * outlineWidth, oy * outlineWidth);
    }
  }
  plot(color, 0, 0);
}
