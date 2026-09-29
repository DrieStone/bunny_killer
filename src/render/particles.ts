// Short-lived visual effects. Positions are in world pixels.
import { drawText, OUTLINE, textWidth } from './pixels';

type Kind = 'dot' | 'text' | 'ring' | 'streak' | 'puff' | 'crow' | 'sparkle' | 'splash';

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
  drag: number;
  text?: string;
  x2?: number;
  y2?: number;
}

export function pixelDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const ri = Math.max(0, Math.round(r));
  for (let dy = -ri; dy <= ri; dy++) {
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    ctx.fillRect(Math.round(cx) - w, Math.round(cy) + dy, w * 2 + 1, 1);
  }
}

export function dottedCircle(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, gap = 3, phase = 0, size = 1,
): void {
  const n = Math.max(8, Math.floor((2 * Math.PI * r) / gap));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + phase;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), size, size);
  }
}

export function pixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, size = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), size, size);
  }
}

export class Particles {
  private list: Particle[] = [];

  clear(): void {
    this.list = [];
  }

  add(p: Partial<Particle> & { x: number; y: number }): void {
    const life = p.life ?? 0.5;
    this.list.push({
      kind: 'dot', vx: 0, vy: 0, color: '#ffffff', size: 1, grav: 0, drag: 0, max: life, ...p, life,
    });
  }

  burst(x: number, y: number, n: number, colors: string[], speed: number, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.add({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.3,
        color: colors[i % colors.length], life: 0.4 + Math.random() * 0.5, drag: 3, grav: 120, ...opts,
      });
    }
  }

  text(x: number, y: number, text: string, color: string, life = 1.1): void {
    this.add({ kind: 'text', x, y, vy: -44, drag: 1.6, text, color, life });
  }

  ring(x: number, y: number, r: number, color: string, life = 0.5): void {
    this.add({ kind: 'ring', x, y, size: r, color, life });
  }

  streak(x0: number, y0: number, x1: number, y1: number, color: string, size = 1): void {
    this.add({ kind: 'streak', x: x0, y: y0, x2: x1, y2: y1, color, life: 0.08, size });
  }

  puff(x: number, y: number, size: number, color = '#ffffff', life = 0.35): void {
    this.add({
      kind: 'puff', x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 40, vy: -16 - Math.random() * 20, size, color, life, drag: 3,
    });
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (this.list.some((p) => p.life <= 0)) this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.life / p.max; // 1 -> 0
      ctx.globalAlpha = Math.min(1, t * 3);
      ctx.fillStyle = p.color;
      switch (p.kind) {
        case 'dot':
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
          break;
        case 'puff':
          pixelDisc(ctx, p.x, p.y, 1 + (1 - t) * p.size);
          break;
        case 'ring':
          dottedCircle(ctx, p.x, p.y, 4 + (1 - t) * (p.size - 4), 5, 0, 2);
          break;
        case 'streak':
          pixelLine(ctx, p.x, p.y, p.x2 ?? p.x, p.y2 ?? p.y, p.size);
          break;
        case 'splash': {
          // a raindrop landing: a tiny ring that widens
          const r = t > 0.5 ? 1 : 2;
          const x = Math.round(p.x);
          const y = Math.round(p.y);
          ctx.fillRect(x - r - 1, y, 1, 1);
          ctx.fillRect(x + r + 1, y, 1, 1);
          ctx.fillRect(x - r, y - 1, r * 2 + 1, 1);
          if (t > 0.5) ctx.fillRect(x, y - 3, 1, 2);
          break;
        }
        case 'sparkle': {
          const s = t > 0.5 ? 2 : 1;
          ctx.fillRect(Math.round(p.x) - s, Math.round(p.y), s * 2 + 1, 1);
          ctx.fillRect(Math.round(p.x), Math.round(p.y) - s, 1, s * 2 + 1);
          break;
        }
        case 'crow': {
          // a little black bird, wings up then down
          const x = Math.round(p.x);
          const y = Math.round(p.y);
          const up = Math.floor(p.life * 14) % 2 === 0;
          ctx.fillStyle = '#1e1e28';
          ctx.fillRect(x - 1, y, 4, 2);
          if (up) {
            ctx.fillRect(x - 4, y - 2, 3, 1);
            ctx.fillRect(x + 3, y - 2, 3, 1);
            ctx.fillRect(x - 2, y - 1, 2, 1);
            ctx.fillRect(x + 2, y - 1, 2, 1);
          } else {
            ctx.fillRect(x - 4, y + 2, 3, 1);
            ctx.fillRect(x + 3, y + 2, 3, 1);
          }
          ctx.fillStyle = '#f7c948';
          ctx.fillRect(x + 3, y, 1, 1);
          break;
        }
        case 'text': {
          const w = textWidth(p.text ?? '');
          drawText(ctx, p.text ?? '', Math.round(p.x - w / 2), Math.round(p.y), p.color, OUTLINE);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}
