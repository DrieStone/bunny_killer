import { describe, expect, it } from 'vitest';
import { BUNNIES, GOLDEN } from '../src/config';
import { Game } from '../src/game';
import { plotTiles, unlockAll } from './helpers';

const DT = 1 / 60;

/** A morning with a golden bunny on the schedule (and no Buck to muddle things). */
function goldenMorning(seed = 51): Game {
  const g = new Game();
  g.newGame(seed);
  unlockAll(g);
  for (let round = GOLDEN.from; round < 40; round++) {
    g.round = round;
    g.loadSave(g.toSave());
    if (g.goldenAt >= 0 && !g.isBossDay()) return g;
  }
  throw new Error('no golden bunny in 40 days');
}

describe('the golden bunny', () => {
  it('shows up most days from Day 3, the same way every time', () => {
    const g = new Game();
    g.newGame(52);
    const when: number[] = [];
    for (let round = 1; round <= 40; round++) {
      g.round = round;
      g.loadSave(g.toSave());
      if (g.goldenAt >= 0) {
        expect(round).toBeGreaterThanOrEqual(GOLDEN.from);
        when.push(round);
      }
    }
    expect(when.length).toBeGreaterThan(12);
    expect(when.length).toBeLessThan(35);
    const again = new Game();
    again.newGame(52);
    again.round = when[0];
    again.loadSave(again.toSave());
    g.round = when[0];
    g.loadSave(g.toSave());
    expect(again.goldenAt).toBe(g.goldenAt);
  });

  it('dashes past a field of turrets untouched, and getting away is no escape', () => {
    const g = goldenMorning();
    g.credits = 99999;
    for (const i of plotTiles(g)) g.place({ type: 'defense', kind: 'turret' }, i);
    g.wave = [];
    expect(g.startRound()).toBe(true);
    let seen = false;
    while (g.phase === 'round') {
      g.update(DT);
      if (g.bunnies.some((b) => b.kind === 'golden')) seen = true;
    }
    expect(seen).toBe(true);
    expect(g.stats.golden ?? 0).toBe(0);
    expect(g.roundStats.kills).toBe(0);
    expect(g.roundStats.escapedFed + g.roundStats.escapedHungry).toBe(0);
  });

  it('pays out when you bonk it yourself', () => {
    const g = goldenMorning();
    g.wave = [];
    expect(g.startRound()).toBe(true);
    const credits = g.credits;
    const levels = { ...g.hybrid };
    while (g.phase === 'round' && !g.bunnies.some((b) => b.kind === 'golden')) g.update(DT);
    for (let t = 0; t < 1; t += DT) g.update(DT); // let it get onto the field
    const b = g.bunnies.find((x) => x.kind === 'golden')!;
    g.selectWeapon('sling');
    expect(g.fire(b.x, b.y - BUNNIES.golden.aim)).toBe(true);
    expect(b.dead).toBe(true);
    expect(g.stats.golden).toBe(1);
    expect(g.roundStats.prize).not.toBe('');
    const lab = Object.keys(levels).some((k) => g.hybrid[k as keyof typeof levels] > levels[k as keyof typeof levels]);
    const cash = g.credits > credits;
    expect(cash || lab || g.roundStats.prize.includes('star')).toBe(true);
  });
});
