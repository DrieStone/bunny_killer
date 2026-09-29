import { describe, expect, it } from 'vitest';
import { COLS, FARM_X0, FARM_Y0, LOT, LOTS_X, LOTS_Y, ROWS } from '../src/config';
import { Game } from '../src/game';
import { makeRng } from '../src/rng';
import {
  CRATER, CRATER_SPAWN, idx, inMap, MAP_ORDER, type MapKind, N, OBSTACLE, pickBurrows, setMap, WATER,
} from '../src/world';
import { botPlan, playDay } from './helpers';

/** Tiles reachable on foot from a start tile (4-way), optionally pretending some tiles are blocked. */
function reach(start: number, blocked: (i: number) => boolean = () => false): Uint8Array {
  const seen = new Uint8Array(N);
  const queue = [start];
  seen[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inMap(x + dx, y + dy)) continue;
      const j = idx(x + dx, y + dy);
      if (seen[j] || OBSTACLE[j] || blocked(j)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

const middle = idx(FARM_X0 + LOTS_X, FARM_Y0 + LOTS_Y);

describe('farms', () => {
  for (const map of MAP_ORDER) {
    it(`${map}: open fields, a reachable crater, and every burrow can get to the crops`, () => {
      setMap(map);
      for (let y = FARM_Y0; y < FARM_Y0 + LOTS_Y * LOT; y++) {
        for (let x = FARM_X0; x < FARM_X0 + LOTS_X * LOT; x++) expect(OBSTACLE[idx(x, y)], `${map} ${x},${y}`).toBe(0);
      }
      const fromFarm = reach(middle);
      expect(fromFarm[idx(CRATER_SPAWN.x, CRATER_SPAWN.y)]).toBe(1);
      expect(OBSTACLE[idx(CRATER.x, CRATER.y)]).toBe(1);
      const rng = makeRng(9);
      let seen = 0;
      for (let round = 0; round < 40; round++) {
        for (const b of pickBurrows(rng, 5)) {
          expect(fromFarm[idx(b.x, b.y)], `${map} burrow ${b.x},${b.y}`).toBe(1);
          seen++;
        }
      }
      expect(seen).toBe(200);
    });
  }

  it('river: nothing crosses the water but the bridges', () => {
    setMap('river');
    let water = 0;
    for (let i = 0; i < N; i++) {
      if (WATER[i] === 1) expect(OBSTACLE[i]).toBe(1);
      if (WATER[i] === 2) expect(OBSTACLE[i]).toBe(0);
      if (WATER[i]) water++;
    }
    expect(water).toBeGreaterThan(30);
    // some burrows open up across the river, and without the bridges they couldn't reach the farm
    const rng = makeRng(3);
    const across: number[] = [];
    for (let round = 0; round < 40; round++) {
      for (const b of pickBurrows(rng, 5)) if (b.x === 0 || b.y === ROWS - 1) across.push(idx(b.x, b.y));
    }
    expect(across.length).toBeGreaterThan(10);
    const noBridges = reach(middle, (i) => WATER[i] === 2);
    for (const i of across) expect(noBridges[i]).toBe(0);
  });

  it('keeps its farm through a save', () => {
    const g = new Game();
    g.newGame(5, 'normal', 'orchard');
    const copy = new Game();
    copy.loadSave(JSON.parse(JSON.stringify(g.toSave())));
    expect(copy.map).toBe('orchard');
    const old = g.toSave();
    delete old.map;
    copy.loadSave(old);
    expect(copy.map).toBe('home');
  });

  for (const map of ['river', 'orchard'] as MapKind[]) {
    it(`${map}: a bot farms a week without trouble`, () => {
      const g = new Game();
      g.newGame(21, 'normal', map);
      for (let day = 0; day < 8 && g.phase === 'planning'; day++) {
        botPlan(g);
        playDay(g, 0.6, 0.7);
        g.continueAfterSummary();
      }
      expect(g.phase).toBe('planning');
      expect(g.stats.kills).toBeGreaterThan(20);
      expect(g.stats.harvest).toBeGreaterThan(500);
    });
  }
});
