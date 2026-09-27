import { expect } from 'vitest';
import { CROPS, ROUND_SECONDS } from '../src/config';
import type { Game } from '../src/game';
import type { ShopItem } from '../src/types';
import { idx, tileX, tileY } from '../src/world';

const DT = 1 / 60;

/** Run one full day. `aim` = seconds between sling shots (0 = never shoot). */
export function playDay(g: Game, aim = 0, accuracy = 0.8): void {
  expect(g.startRound()).toBe(true);
  let shotTimer = 0;
  let guard = 0;
  while (g.phase !== 'summary') {
    g.update(DT);
    g.events.length = 0;
    if (aim > 0 && (g.phase === 'round' || g.phase === 'sundown')) {
      shotTimer -= DT;
      if (shotTimer <= 0) {
        const targets = g.bunnies.filter((b) => g.isSurfaced(b) && b.state !== 'exit');
        if (targets.length) {
          const b = targets[Math.floor(Math.random() * targets.length)];
          const miss = Math.random() > accuracy ? 1.5 : 0;
          g.fireSling(b.x + miss, b.y - 0.3);
        }
        shotTimer = aim;
      }
    }
    if (++guard > 60 * (ROUND_SECONDS + 60)) throw new Error(`day never ended (phase ${g.phase})`);
  }
}

export function plotTiles(g: Game): number[] {
  const r = g.plot;
  const out: number[] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push(idx(x, y));
  return out;
}

/** A simple planner: a ring of defenses around the middle, crops everywhere else. */
export function botPlan(g: Game): void {
  const tiles = plotTiles(g);
  const r = g.plot;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  const put = (item: ShopItem, i: number) => g.placeProblem(item, i) === null && g.place(item, i);
  if (g.repairCost() > 0 && g.credits > g.repairCost() + 40) g.repairAll();
  if (g.expandCost() !== null && g.credits > (g.expandCost() ?? 0) * 2.2) g.expandPlot();
  // a scarecrow and a sprinkler in the middle, traps near the edges
  const middle = tiles.filter((i) => Math.abs(tileX(i) - cx) < 1 && Math.abs(tileY(i) - cy) < 1);
  if (g.credits > 90) put({ type: 'defense', kind: 'scarecrow' }, middle[0]);
  if (g.credits > 110) put({ type: 'defense', kind: 'sprinkler' }, middle[3]);
  if (g.credits > 150) put({ type: 'defense', kind: 'turret' }, middle[1]);
  const edges = tiles.filter((i) => tileX(i) === r.x0 || tileX(i) === r.x1 || tileY(i) === r.y0 || tileY(i) === r.y1);
  for (const i of edges.filter((_, n) => n % 5 === 0)) if (g.credits > 60) put({ type: 'defense', kind: 'trap' }, i);
  for (const i of tiles) {
    const kind = g.credits > 200 && (tileX(i) + tileY(i)) % 5 === 0 ? 'pumpkin'
      : g.credits > 150 && (tileX(i) * 3 + tileY(i)) % 7 === 0 ? 'strawberry' : 'carrot';
    if (g.credits >= CROPS[kind].seedCost + 5) put({ type: 'crop', kind }, i);
  }
  // spare money goes into upgrades
  for (const i of tiles) {
    const s = g.tiles[i].structure;
    if (s && s.kind !== 'fence' && g.credits > 250) g.upgradeAt(i);
  }
}

