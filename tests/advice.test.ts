import { describe, expect, it } from 'vitest';
import { cropReturns, growMore, todayTips, weatherLines } from '../src/advice';
import { CROPS, EVENTS, ripenDays } from '../src/config';
import { Game } from '../src/game';
import { unlockAll } from './helpers';

/** A spring morning with the whole store open. */
function morning(seed = 41): Game {
  const g = new Game();
  g.newGame(seed);
  unlockAll(g);
  g.weather = 'sunny';
  g.event = null;
  return g;
}

describe('the morning report', () => {
  it('ranks the crops by what a tile earns a day, seed paid for', () => {
    const g = morning();
    const returns = cropReturns(g);
    expect(returns.length).toBe(Object.keys(CROPS).length);
    for (let n = 1; n < returns.length; n++) expect(returns[n - 1].perDay).toBeGreaterThanOrEqual(returns[n].perDay);
    const carrot = returns.find((r) => r.kind === 'carrot')!;
    expect(carrot.perDay).toBeCloseTo((g.cropPrice('carrot') - CROPS.carrot.seedCost) / ripenDays('carrot'), 6);
    // a perennial: every fruit of its run, less the seed, over the days it takes
    const tomato = returns.find((r) => r.kind === 'tomato')!;
    const n = CROPS.tomato.harvests!;
    const life = tomato.days - 1 + Math.ceil(n / tomato.fruits);
    expect(tomato.perDay).toBeCloseTo((g.cropPrice('tomato') * n - CROPS.tomato.seedCost) / life, 6);
    // only what the store sells
    const fresh = new Game();
    fresh.newGame(41);
    expect(cropReturns(fresh).map((r) => r.kind).sort()).toEqual(['carrot', 'lettuce', 'radish']);
  });

  it('moves the County Fair crop up: it sells for three times as much tonight', () => {
    const g = morning();
    const before = cropReturns(g);
    g.event = { kind: 'fair', crop: 'carrot' };
    const after = cropReturns(g);
    const was = before.findIndex((r) => r.kind === 'carrot');
    const now = after.findIndex((r) => r.kind === 'carrot');
    expect(after[now].price).toBeCloseTo(before[was].price * EVENTS.fairMult, 6);
    expect(now).toBeLessThan(was);
  });

  it('says what the weather and the season do, in plain words', () => {
    const g = morning();
    g.weather = 'rain';
    const lines = weatherLines(g);
    expect(lines[0]).toMatch(/Rain: crops grow 30% faster/);
    expect(lines[1]).toMatch(/^Spring/);
    expect(lines[lines.length - 1]).toMatch(/130% of normal speed today, 1\d\d% by a sprinkler/);
    g.event = { kind: 'drought' };
    expect(weatherLines(g).join(' ')).toMatch(new RegExp(`${Math.round(EVENTS.drought * 100)}% speed unless a sprinkler`));
    // a greenhouse in winter
    g.event = null;
    g.round = 23;
    g.loadSave(g.toSave());
    g.farm.greenhouse = 1;
    expect(weatherLines(g)[1]).toMatch(/Winter: crops sell 20% higher \(the greenhouse keeps them growing\)/);
  });

  it('suggests what to do about today', () => {
    const g = morning();
    g.weather = 'rain'; // corn grows fast enough to ripen in a day
    g.order = { who: 'The diner', kind: 'lettuce', want: 12, got: 3, due: g.round + 2, bonus: 90 };
    const tips = todayTips(g);
    expect(tips.some((t) => /good day for .*corn/.test(t))).toBe(true);
    expect(tips.some((t) => /The diner wants 12 lettuce/.test(t))).toBe(true);
    expect(tips[tips.length - 1]).toMatch(/Prices sag/);
    // dry weather: a sprinkler would bring something in a day sooner
    g.weather = 'sunny';
    expect(todayTips(g).some((t) => /By a sprinkler, .* ripen/.test(t))).toBe(true);
  });

  it('names at most three things that would make the farm grow more', () => {
    const g = morning();
    const ideas = growMore(g);
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.length).toBeLessThanOrEqual(3);
    expect(ideas[0]).toMatch(/Rich Soil 1/);
  });
});
