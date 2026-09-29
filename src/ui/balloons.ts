// System 7 Balloon Help: speech balloons that point at things. Used for the first-game tutorial
// and for Help > Show Balloons, which explains whatever the mouse is over.
import { TILE, WORLD_H, WORLD_W } from '../config';
import type { Game } from '../game';

type Anchor = HTMLElement | { x: number; y: number }; // element, or a point in page pixels

export class Balloons {
  private el: HTMLDivElement;
  private shownFor: string | null = null;
  helpMode = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'balloon';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    document.addEventListener('mouseover', (e) => {
      if (!this.helpMode) return;
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-balloon]');
      if (t) this.show(t, t.dataset.balloon ?? '', `help:${t.dataset.balloon}`);
      else if (this.shownFor?.startsWith('help:')) this.hide();
    });
  }

  /** Point a balloon at an element or page coordinate. `key` avoids re-laying out an unchanged balloon. */
  show(anchor: Anchor, html: string, key = html): void {
    if (this.shownFor === key && !this.el.hidden) {
      this.place(anchor);
      return;
    }
    this.shownFor = key;
    this.el.innerHTML = html;
    this.el.hidden = false;
    this.place(anchor);
  }

  hide(): void {
    this.el.hidden = true;
    this.shownFor = null;
  }

  get visibleKey(): string | null {
    return this.el.hidden ? null : this.shownFor;
  }

  private place(anchor: Anchor): void {
    let ax: number;
    let ay: number;
    let aw = 0;
    let ah = 0;
    if (anchor instanceof HTMLElement) {
      const r = anchor.getBoundingClientRect();
      ax = r.left;
      ay = r.top;
      aw = r.width;
      ah = r.height;
    } else {
      ax = anchor.x;
      ay = anchor.y;
    }
    const b = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    // prefer sitting up and to the left of the target, like the original
    let left = ax + aw / 2 - b.width + 22;
    let top = ay - b.height - 18;
    let tail = 'br';
    if (left < 8) {
      left = ax + aw / 2 - 22;
      tail = 'bl';
    }
    if (top < 30) {
      top = ay + ah + 18;
      tail = tail === 'br' ? 'tr' : 'tl';
    }
    left = Math.max(8, Math.min(vw - b.width - 8, left));
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
    this.el.dataset.tail = tail;
  }
}

/** Where a tile center lands on the page. */
export function tileOnPage(canvas: HTMLCanvasElement, tx: number, ty: number): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + ((tx + 0.5) * TILE * r.width) / WORLD_W, y: r.top + ((ty + 0.5) * TILE * r.height) / WORLD_H };
}

// ---------------------------------------------------------------- the first-game tutorial

const DONE_KEY = 'bk4.tutorial';

export class Tutorial {
  private step = 0;
  private stepTime = 0;
  active: boolean;

  constructor(private balloons: Balloons, private canvas: HTMLCanvasElement) {
    let done = false;
    try {
      done = localStorage.getItem(DONE_KEY) === 'done';
    } catch {
      // no storage: just show it
    }
    this.active = !done;
  }

  finish(): void {
    this.active = false;
    this.balloons.hide();
    try {
      localStorage.setItem(DONE_KEY, 'done');
    } catch {
      // ignore
    }
  }

  restart(): void {
    this.active = true;
    this.step = 0;
    try {
      localStorage.removeItem(DONE_KEY);
    } catch {
      // ignore
    }
  }

  /** Called every frame; shows the balloon for the current step. */
  update(g: Game, dt: number, modalOpen: boolean): void {
    if (!this.active) return;
    if (modalOpen || g.phase === 'title' || g.phase === 'gameover' || g.phase === 'victory') {
      if (this.balloons.visibleKey?.startsWith('tut')) this.balloons.hide();
      return;
    }
    this.stepTime += dt;
    const $ = (id: string) => document.getElementById(id);
    const crops = g.cropCount();
    const plot = g.plot;
    const center = tileOnPage(this.canvas, (plot.x0 + plot.x1) / 2, plot.y0 + 0.5);
    const go = (n: number) => {
      if (this.step !== n) {
        this.step = n;
        this.stepTime = 0;
      }
    };
    // advance on what the player has done
    if (g.round === 1 && g.phase === 'planning') go(crops === 0 ? 0 : crops < 4 ? 1 : 2);
    else if (g.round === 1 && g.phase === 'round') go(3);
    else if (g.round === 1) go(4);
    else if (g.round === 2 && g.phase === 'planning') go(this.stepTime > 7 && this.step >= 5 ? 6 : Math.max(5, this.step));
    else if (g.round >= 2 && g.phase !== 'planning') {
      this.finish();
      return;
    }

    const show = (anchor: Anchor | null, html: string) => {
      if (anchor) this.balloons.show(anchor, html, `tut${this.step}`);
    };
    switch (this.step) {
      case 0:
        show(document.querySelector<HTMLElement>('#seed-items .item:nth-child(3)'),
          '<b>Welcome to the farm!</b> Pick a seed (Carrots are a good start), then click your tilled soil to plant it. Drag to plant a whole row.');
        break;
      case 1:
        show(center, 'Nice! Plant a few more. Bunnies will come for them, so it pays to have extras.');
        break;
      case 2:
        show($('btn-start'), 'When you\'re ready, start the day. Crops grow while the sun is up.');
        break;
      case 3: {
        const b = g.bunnies.find((x) => g.isSurfaced(x));
        if (b) show(tileOnPage(this.canvas, b.x - 0.5, b.y - 0.8), '<b>Here they come!</b> Click a bunny to hit it with your sling.');
        else show(center, 'Watch the burrows at the edge of the field. That\'s where the bunnies pop out.');
        break;
      }
      case 4:
        this.balloons.hide();
        break;
      case 5:
        show(document.querySelector<HTMLElement>('.scout'),
          'The <b>Scouting Report</b> shows how many bunnies are coming, what kinds, and the weather.');
        break;
      case 6:
        show(document.querySelector<HTMLElement>('#def-items'),
          'Every bunny that gets home fed brings a friend tomorrow. <b>Defenses</b> help: try a Snap Trap next to some Lettuce as bait.');
        break;
    }
  }
}
