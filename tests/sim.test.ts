import { describe, expect, it } from 'vitest';
import { CROPS, DEFENSES, ROWS } from '../src/config';
import { Game } from '../src/game';
import { PathField } from '../src/path';
import { idx, N, tileX, tileY } from '../src/world';
import { botPlan, playDay, plotTiles, unlockAll } from './helpers';

describe('pathfinding', () => {
  it('routes around a wall when it can and through it when it must', () => {
    const g = new Game();
    g.newGame(123);
    const a = idx(12, 8);
    const target = idx(15, 8);
    // wall with a gap
    for (let y = 6; y <= 10; y++) if (y !== 10) g.tiles[idx(14, y)].structure = { kind: 'fence', level: 1, hp: DEFENSES.fence.hp, fresh: false, cd: 0, anim: 0, shake: 0 };
    g.rebuildCosts();
    const f = new PathField().run(a, g.costWalk, g.solidWalk);
    const path = f.pathTo(target);
    expect(path.at(-1)).toBe(target);
    expect(path.some((i) => g.tiles[i].structure)).toBe(false);
    // close the gap and fence the whole column: must chew
    for (let y = 0; y < ROWS; y++) g.tiles[idx(14, y)].structure = { kind: 'fence', level: 1, hp: DEFENSES.fence.hp, fresh: false, cd: 0, anim: 0, shake: 0 };
    g.rebuildCosts();
    const f2 = new PathField().run(a, g.costWalk, g.solidWalk);
    expect(f2.pathTo(target).some((i) => g.tiles[i].structure)).toBe(true);
  });
});

describe('economy', () => {
  it('refunds fresh purchases in full and used defenses at half', () => {
    const g = new Game();
    g.newGame(5);
    unlockAll(g);
    const i = plotTiles(g)[0];
    const before = g.credits;
    g.place({ type: 'defense', kind: 'scarecrow' }, i);
    expect(g.credits).toBe(before - DEFENSES.scarecrow.cost);
    g.removeAt(i);
    expect(g.credits).toBe(before);
    g.place({ type: 'defense', kind: 'scarecrow' }, i);
    g.tiles[i].structure!.fresh = false;
    g.removeAt(i);
    expect(g.credits).toBe(before - DEFENSES.scarecrow.cost + Math.floor(DEFENSES.scarecrow.cost / 2));
  });

  it("won't place off the plot or on top of things", () => {
    const g = new Game();
    g.newGame(5);
    expect(g.placeProblem({ type: 'crop', kind: 'carrot' }, idx(0, 0))).toMatch(/not your land/);
    const i = plotTiles(g)[3];
    g.place({ type: 'crop', kind: 'carrot' }, i);
    expect(g.placeProblem({ type: 'defense', kind: 'fence' }, i)).toMatch(/taken/);
  });

  it('pays for mature crops, scaled by damage, and keeps unripe ones', () => {
    const g = new Game();
    g.newGame(9);
    unlockAll(g);
    g.wave = [];
    const [a, b, c] = plotTiles(g);
    g.place({ type: 'crop', kind: 'carrot' }, a);
    g.place({ type: 'crop', kind: 'carrot' }, b);
    g.place({ type: 'crop', kind: 'pumpkin' }, c);
    g.tiles[b].crop!.hp = CROPS.carrot.hp * 0.4;
    const before = g.credits;
    playDay(g);
    expect(g.credits - before).toBe(CROPS.carrot.sellValue + Math.round(CROPS.carrot.sellValue * 0.4));
    expect(g.tiles[c].crop?.kind).toBe('pumpkin');
    expect(g.roundStats.harvestTotal).toBe(g.credits - before);
  });

  it('round-trips a save', () => {
    const g = new Game();
    g.newGame(77);
    unlockAll(g);
    const tiles = plotTiles(g);
    g.place({ type: 'crop', kind: 'corn' }, tiles[0]);
    g.place({ type: 'defense', kind: 'doghouse' }, tiles[5]);
    const save = JSON.parse(JSON.stringify(g.toSave()));
    const h = new Game();
    h.loadSave(save);
    expect(h.credits).toBe(g.credits);
    expect(h.tiles[tiles[0]].crop?.kind).toBe('corn');
    expect(h.tiles[tiles[5]].structure?.kind).toBe('doghouse');
    expect(h.burrows).toEqual(g.burrows);
    expect(h.wave).toEqual(g.wave);
  });
});

describe('a day on the farm', () => {
  it('bunnies eat undefended crops and go home fed, which breeds more bunnies', () => {
    const g = new Game();
    g.newGame(42);
    for (const i of plotTiles(g).slice(0, 7)) g.place({ type: 'crop', kind: 'carrot' }, i);
    const waveBefore = g.wave.length;
    playDay(g);
    expect(g.roundStats.escapedFed).toBeGreaterThan(0);
    expect(g.roundStats.kills).toBe(0);
    g.continueAfterSummary();
    expect(g.round).toBe(2);
    expect(g.breedBonus).toBeGreaterThan(0);
    expect(g.wave.length).toBeGreaterThan(waveBefore);
  });

  it('the sling and defenses kill bunnies', () => {
    const g = new Game();
    g.newGame(42);
    const tiles = plotTiles(g);
    for (const i of tiles.slice(0, 6)) g.place({ type: 'crop', kind: 'lettuce' }, i);
    g.place({ type: 'defense', kind: 'trap' }, tiles[8]);
    g.credits += 200;
    g.place({ type: 'defense', kind: 'turret' }, tiles[14]);
    g.place({ type: 'defense', kind: 'doghouse' }, tiles[20]);
    playDay(g, 0.5);
    expect(g.roundStats.kills).toBeGreaterThan(0);
  });

  it('a fenced-in garden gets chewed into', () => {
    const g = new Game();
    g.newGame(3);
    g.credits = 1000;
    const r = g.plot;
    for (const i of plotTiles(g)) {
      const edge = tileX(i) === r.x0 || tileX(i) === r.x1 || tileY(i) === r.y0 || tileY(i) === r.y1;
      g.place(edge ? { type: 'defense', kind: 'fence' } : { type: 'crop', kind: 'lettuce' }, i);
    }
    playDay(g);
    expect(g.roundStats.structuresBroken + g.roundStats.cropsLost).toBeGreaterThan(0);
  });

  it('survives a long bot campaign without errors', () => {
    const g = new Game();
    g.newGame(2024);
    for (let day = 0; day < 12 && g.phase === 'planning'; day++) {
      botPlan(g);
      playDay(g, 0.55, 0.75);
      const rs = g.roundStats;
      // every bunny in the wave was bonked or got away (a golden bunny caught is a bonk on top)
      expect(rs.kills - (rs.prize ? 1 : 0) + rs.escapedFed + rs.escapedHungry).toBe(g.waveTotal());
      g.continueAfterSummary();
    }
    expect(g.round).toBeGreaterThan(3);
    for (let i = 0; i < N; i++) {
      const c = g.tiles[i].crop;
      if (c) expect(c.hp).toBeGreaterThan(0);
    }
  });
});
