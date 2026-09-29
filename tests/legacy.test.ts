import { describe, expect, it } from 'vitest';
import { BELL, BUNNIES, EVENTS, LEGACY, PROJECT, ROUND_SECONDS, SPRINKLER_GROWTH, STAND_PRICE } from '../src/config';
import { Game } from '../src/game';
import { playDay, plotTiles, unlockAll } from './helpers';

const DT = 1 / 60;

/** A farm that has just sealed the crater and chosen to keep farming, with money to spend. */
function kept(seed = 91): Game {
  const g = new Game();
  g.newGame(seed);
  unlockAll(g);
  g.stats.bossesBeaten = PROJECT[2].bucks;
  g.project = 2;
  g.credits = 20000;
  g.place({ type: 'crop', kind: 'carrot' }, plotTiles(g)[0]);
  expect(g.fundProject()).toBe(true);
  expect(g.startRound()).toBe(true);
  for (let guard = 0; g.phase !== 'summary' && guard < 60 * 200; guard++) {
    g.update(DT);
    for (const b of g.bunnies) if (BUNNIES[b.kind].boss && !b.dead) g.damageBunny(b, 9999);
    if (g.phase === 'harvest') g.finishHarvestNow();
  }
  g.continueAfterSummary();
  expect(g.phase).toBe('victory');
  expect(g.keepFarming()).toBe(true);
  g.credits = 1_000_000;
  return g;
}

/** Build landmarks up to `n` standing. */
function build(g: Game, n: number): void {
  while (g.legacy < n) expect(g.fundLegacy()).toBe(true);
}

describe('the Farm Legacy', () => {
  it('opens after the win: five landmarks, one at a time, each dearer than the last', () => {
    const fresh = new Game();
    fresh.newGame(90);
    fresh.credits = 1_000_000;
    expect(fresh.legacyCost()).toBeNull();
    expect(fresh.legacyProblem()).toMatch(/Seal the crater/);
    expect(fresh.fundLegacy()).toBe(false);

    const g = kept();
    g.credits = LEGACY[0].cost - 1;
    expect(g.legacyProblem()).toMatch(/Not enough/);
    g.credits = 1_000_000;
    let last = 0;
    for (let n = 0; n < LEGACY.length; n++) {
      const cost = g.legacyCost()!;
      expect(cost).toBe(LEGACY[n].cost);
      expect(cost).toBeGreaterThan(last);
      last = cost;
      const before = g.credits;
      expect(g.fundLegacy()).toBe(true);
      expect(g.credits).toBe(before - cost);
    }
    expect(g.legacy).toBe(LEGACY.length);
    expect(g.legacyCost()).toBeNull();
    expect(g.legacyProblem()).toMatch(/complete/);
    expect(g.stats.legacyOn).toBe(g.round);
  });

  it('makes the farm better known: every landmark brings more bunnies', () => {
    const g = kept(92);
    g.round += 3;
    const count = (legacy: number) => {
      const copy = new Game();
      copy.loadSave({ ...JSON.parse(JSON.stringify(g.toSave())), legacy });
      return copy.wave.length - copy.breedBonus;
    };
    const none = count(0);
    const three = count(3);
    expect(three / none).toBeGreaterThan(1.3);
    expect(three / none).toBeLessThan(1.6);
  });

  it('the Roadside Stand: every crop sells for more, and there is an order every morning', () => {
    const g = kept(93);
    const before = g.cropPrice('carrot');
    build(g, 1);
    expect(g.cropPrice('carrot')).toBeCloseTo(before * (1 + STAND_PRICE), 5);
    for (let day = 0; day < 6; day++) {
      g.order = null;
      g.wave = [];
      if (g.cropCount() === 0) g.place({ type: 'crop', kind: 'radish' }, plotTiles(g)[0]);
      playDay(g);
      g.order = null;
      g.continueAfterSummary();
      expect(g.order).not.toBeNull();
    }
  });

  it('the Windmill: every row grows as if a sprinkler reached it', () => {
    const g = kept(94);
    const tile = plotTiles(g)[5];
    expect(g.sprinklerGrowth(tile)).toBe(1);
    build(g, 2);
    expect(g.sprinklerGrowth(tile)).toBeCloseTo(SPRINKLER_GROWTH, 5);
  });

  it('the Bell Tower: at noon every bunny runs for home, all but a golden one', () => {
    /** Bunnies turned loose a second before noon: which ones are heading home half a second after it? */
    const noon = (landmarks: number) => {
      const g = kept(95);
      build(g, landmarks);
      for (const i of plotTiles(g)) g.place({ type: 'crop', kind: 'lettuce' }, i); // something to go for
      g.wave = [];
      g.goldenAt = -1;
      expect(g.startRound()).toBe(true);
      while (g.time < ROUND_SECONDS * BELL.at - 1) g.update(DT);
      const tiles = plotTiles(g);
      const bunnies = [0, 4, 9, 14].map((n) => g.spawnAt('common', (tiles[n] % 22) + 0.5, Math.floor(tiles[n] / 22) + 0.5));
      const golden = g.spawnAt('golden', 10.5, 7.5);
      golden.state = 'dash';
      [golden.sx, golden.sy] = [30, 7.5];
      for (const b of bunnies) b.hp = b.maxHp = 999;
      let rang = false;
      while (g.time < ROUND_SECONDS * BELL.at + 0.5) {
        g.update(DT);
        rang ||= g.events.some((e) => e.t === 'bell');
        g.events.length = 0;
      }
      const home = bunnies.filter((b) => b.gone || b.state === 'flee' || b.state === 'exit' || (b.state === 'chew' && b.resume === 'flee'));
      return { rang, home: home.length, golden: golden.state };
    };
    const quiet = noon(2);
    expect(quiet.rang).toBe(false);
    expect(quiet.home).toBe(0);
    const bell = noon(3);
    expect(bell.rang).toBe(true);
    expect(bell.home).toBe(4);
    expect(bell.golden).toBe('dash');
  });

  it('the Fairground: the fair comes on the last day of every week, and buys twice as much', () => {
    const g = kept(96);
    build(g, 4);
    expect(g.fairCap).toBe(EVENTS.fairCap * 2);
    while (g.round % 7 !== 6) g.round++;
    g.wave = [];
    if (g.cropCount() === 0) g.place({ type: 'crop', kind: 'radish' }, plotTiles(g)[0]);
    playDay(g);
    g.continueAfterSummary();
    expect(g.round % 7).toBe(0);
    expect(g.event?.kind).toBe('fair');
  });

  it('the Golden Slingshot: a golden bunny every day', () => {
    const g = kept(97);
    build(g, 5);
    for (let day = 0; day < 5; day++) {
      g.wave = [];
      if (g.cropCount() === 0) g.place({ type: 'crop', kind: 'radish' }, plotTiles(g)[0]);
      playDay(g);
      g.continueAfterSummary();
      expect(g.goldenAt).toBeGreaterThanOrEqual(0);
    }
  });

  it('a save keeps the landmarks; a farm that never won has none', () => {
    const g = kept(98);
    build(g, 2);
    const copy = new Game();
    copy.loadSave(JSON.parse(JSON.stringify(g.toSave())));
    expect(copy.legacy).toBe(2);
    expect(copy.landmark('windmill')).toBe(true);
    expect(copy.landmark('bell')).toBe(false);
    const cheat = { ...JSON.parse(JSON.stringify(g.toSave())), stats: { ...g.stats, sealedOn: undefined }, project: 1 };
    const other = new Game();
    other.loadSave(cheat);
    expect(other.legacy).toBe(0);
  });
});
