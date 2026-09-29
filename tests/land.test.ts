import { describe, expect, it } from 'vitest';
import { lotPrice, START_LOTS, TILL_COST } from '../src/config';
import { Game } from '../src/game';
import { lotOf, lotTiles } from '../src/world';

/** A farm on the morning of day 2, when land goes on sale. */
function farm(credits = 5000): Game {
  const g = new Game();
  g.newGame(21);
  g.round = 2;
  g.loadSave(g.toSave());
  g.credits = credits;
  return g;
}

describe('land', () => {
  it('starts with two tilled lots, and the rest is for sale from day 2', () => {
    const g = new Game();
    g.newGame(20);
    expect(g.lots.filter(Boolean).length).toBe(START_LOTS.length);
    for (const n of START_LOTS) for (const i of lotTiles(n)) expect(g.tilled[i]).toBe(1);
    g.credits = 5000;
    expect(g.buyLot(0)).toBe(false); // not on day 1
    const h = farm();
    expect(h.buyLot(0)).toBe(true);
  });

  it('sells a lot at a time, each dearer than the last, and never the wild country', () => {
    const g = farm();
    const before = g.credits;
    expect(g.buyLot(0)).toBe(true);
    expect(g.credits).toBe(before - lotPrice(0));
    expect(g.buyLot(0)).toBe(false); // already yours
    expect(g.buyLot(11)).toBe(true); // any lot, touching yours or not
    expect(g.credits).toBe(before - lotPrice(0) - lotPrice(1));
    expect(lotOf(0, 0)).toBe(-1);
    expect(g.placeProblem({ type: 'land' }, 0)).toMatch(/wild/);
  });

  it('new land comes as grass: defenses go right on it, crops need tilling first', () => {
    const g = farm();
    g.buyLot(0);
    const [a, b] = lotTiles(0);
    expect(g.tilled[a]).toBe(0);
    expect(g.placeProblem({ type: 'crop', kind: 'carrot' }, a)).toMatch(/Till/);
    expect(g.place({ type: 'defense', kind: 'trap' }, a)).toBe(true);
    const credits = g.credits;
    expect(g.till(b)).toBe(true);
    expect(g.credits).toBe(credits - TILL_COST);
    expect(g.till(b)).toBe(false); // already tilled
    expect(g.till(a)).toBe(false); // there's a trap on it
    expect(g.place({ type: 'crop', kind: 'carrot' }, b)).toBe(true);
    // digging the crop up leaves the soil tilled
    g.removeAt(b);
    expect(g.tilled[b]).toBe(1);
  });

  it('keeps your lots and your tilling through a save', () => {
    const g = farm();
    g.buyLot(3);
    const [i] = lotTiles(3);
    g.till(i);
    const h = new Game();
    h.loadSave(JSON.parse(JSON.stringify(g.toSave())));
    expect(h.lots[3]).toBe(true);
    expect(h.lotsBought).toBe(1);
    expect(h.tilled[i]).toBe(1);
    expect(h.tilled[lotTiles(3)[1]]).toBe(0);
  });
});
