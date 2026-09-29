import { describe, expect, it } from 'vitest';
import { CROPS, EVENTS } from '../src/config';
import { Game } from '../src/game';
import { playDay, plotTiles, unlockAll } from './helpers';

const DT = 1 / 60;

/** Skip ahead through mornings (the real way, so the day's event is rolled) until one comes up. */
function untilEvent(g: Game, kind: string): void {
  for (let n = 0; n < 200; n++) {
    if (g.event?.kind === kind) return;
    g.wave = [];
    playDay(g);
    g.continueAfterSummary();
    g.credits = Math.max(g.credits, 5000);
    if (g.cropCount() === 0) g.place({ type: 'crop', kind: 'radish' }, plotTiles(g)[0]);
  }
  throw new Error(`no ${kind} in 200 days`);
}

function farm(seed: number): Game {
  const g = new Game();
  g.newGame(seed);
  unlockAll(g);
  g.credits = 5000;
  g.place({ type: 'crop', kind: 'radish' }, plotTiles(g)[0]);
  return g;
}

describe('events', () => {
  it('come from Day 4, now and then, never on a Buck day', () => {
    const g = farm(71);
    const days: string[] = [];
    for (let n = 0; n < 60; n++) {
      if (g.event) {
        expect(g.round).toBeGreaterThanOrEqual(EVENTS.from);
        expect(g.isBossDay()).toBe(false);
        days.push(g.event.kind);
      }
      g.wave = [];
      playDay(g);
      g.continueAfterSummary();
      if (g.cropCount() === 0) g.place({ type: 'crop', kind: 'radish' }, plotTiles(g)[0]);
    }
    expect(days.length).toBeGreaterThan(5);
    expect(days.length).toBeLessThan(35);
  });

  it('County Fair: triple for the first twenty of one crop', () => {
    const g = farm(72);
    untilEvent(g, 'fair');
    const k = g.event!.crop!;
    expect(CROPS[k].regrow).toBeUndefined();
    // the first twenty at the fair's price; after that, the market's (a little glutted by then)
    expect(g.cropPrice(k, 0) / g.cropPrice(k, EVENTS.fairCap)).toBeGreaterThan(2.5);
    expect(g.cropPrice(k, EVENTS.fairCap - 1) / g.cropPrice(k, EVENTS.fairCap)).toBeGreaterThan(2.5);
  });

  it('Drought: slow going, except where a sprinkler reaches', () => {
    const g = farm(73);
    untilEvent(g, 'drought');
    const tiles = plotTiles(g);
    g.place({ type: 'defense', kind: 'sprinkler' }, tiles[20]);
    const wet = tiles.find((i) => i !== tiles[20] && g.sprinklerGrowth(i) > 1)!;
    const dry = tiles.find((i) => g.sprinklerGrowth(i) === 1 && !g.tiles[i].crop && !g.tiles[i].structure)!;
    expect(g.tileGrowth(dry, 'carrot')).toBeCloseTo(g.climateGrowth * g.cropGrowth('carrot') * EVENTS.drought, 5);
    expect(g.tileGrowth(wet, 'carrot')).toBeGreaterThan(g.climateGrowth * g.cropGrowth('carrot'));
  });

  it('Hail: knocks the crops about, and the bunnies hunker down', () => {
    const g = farm(74);
    untilEvent(g, 'hail');
    const tiles = plotTiles(g);
    for (const i of tiles.slice(1, 6)) g.place({ type: 'crop', kind: 'carrot' }, i);
    g.wave = [{ at: 1, kind: 'common', burrow: 0 }];
    expect(g.startRound()).toBe(true);
    while (g.hail === 0 && g.phase === 'round') g.update(DT);
    const b = g.bunnies[0];
    expect(g.hail).toBeGreaterThan(0);
    expect(g.roundStats.hailHit).toBeGreaterThan(0);
    for (const i of tiles.slice(1, 6)) expect(g.tiles[i].crop!.hp).toBeLessThan(CROPS.carrot.hp);
    if (b && !b.dead && !b.gone) {
      const at = [b.x, b.y];
      for (let t = 0; t < 1; t += DT) g.update(DT);
      expect([b.x, b.y]).toEqual(at);
    }
  });

  it('Merchant: a few deals, each one once, and something the store has not opened yet', () => {
    const g = new Game();
    g.newGame(75);
    g.credits = 5000;
    g.place({ type: 'crop', kind: 'radish' }, plotTiles(g)[0]);
    untilEvent(g, 'merchant');
    const offers = g.event!.offers!;
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.length).toBeLessThanOrEqual(3);
    expect(g.merchantTile()).toBeGreaterThanOrEqual(0);
    const rare = offers.find((o) => o.id.startsWith('rare:'));
    if (rare) {
      const what = rare.id.slice(5);
      expect(g.isUnlocked(what as never)).toBe(false);
      expect(g.buyOffer(rare.id)).toBe(true);
      expect(g.isUnlocked(what as never)).toBe(true);
      expect(g.buyOffer(rare.id)).toBe(false);
    }
    const copy = new Game();
    copy.loadSave(JSON.parse(JSON.stringify(g.toSave())));
    expect(copy.event?.kind).toBe('merchant');
    expect(copy.eventBought).toEqual(g.eventBought);
  });
});
