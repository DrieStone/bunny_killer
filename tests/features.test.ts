import { describe, expect, it } from 'vitest';
import { CROPS, defenseStats, fruitsPerDay, investedIn, MARKET, MAX_LEVEL, ripenDays, seasonOf, SEASONS, upgradeCost, yearOf } from '../src/config';
import { Game } from '../src/game';
import { playDay, plotTiles, unlockAll } from './helpers';

describe('strawberries', () => {
  it('fruit every evening, five times, then the plant is spent', () => {
    const g = new Game();
    g.newGame(11);
    unlockAll(g);
    const [i] = plotTiles(g);
    g.place({ type: 'crop', kind: 'strawberry' }, i);
    let picked = 0;
    for (let day = 0; day < 8 && g.phase === 'planning'; day++) {
      g.wave = []; // no bunnies: just watch it grow
      playDay(g);
      picked += g.roundStats.harvested.strawberry?.count ?? 0;
      g.continueAfterSummary();
      if (!g.tiles[i].crop) break;
      g.credits += 50; // keep the farm from going bust in this empty test
    }
    expect(picked).toBe(CROPS.strawberry.harvests);
    expect(g.tiles[i].crop).toBeNull();
  });
});

describe('upgrades', () => {
  it('cost credits, raise stats, and count toward the sell price', () => {
    const g = new Game();
    g.newGame(12);
    unlockAll(g);
    g.credits = 2000;
    const [i] = plotTiles(g);
    g.place({ type: 'defense', kind: 'turret' }, i);
    const before = g.credits;
    expect(g.upgradeAt(i)).toBe(true);
    expect(g.credits).toBe(before - upgradeCost('turret', 1));
    expect(g.tiles[i].structure!.level).toBe(2);
    while (g.upgradeAt(i));
    expect(g.tiles[i].structure!.level).toBe(MAX_LEVEL);
    const l1 = defenseStats('turret', 1);
    const top = defenseStats('turret', MAX_LEVEL);
    expect(top.radius).toBeGreaterThan(l1.radius);
    expect(top.period).toBeLessThan(l1.period);
    expect(top.damage).toBeGreaterThan(l1.damage);
    expect(g.tiles[i].structure!.hp).toBe(top.hp);
    // bought today: selling refunds everything put into it
    expect(g.removeValue(i)).toBe(investedIn('turret', MAX_LEVEL));
  });

  it('survive a save and load', () => {
    const g = new Game();
    g.newGame(13);
    unlockAll(g);
    g.credits = 500;
    const [i] = plotTiles(g);
    g.place({ type: 'defense', kind: 'scarecrow' }, i);
    g.upgradeAt(i);
    const h = new Game();
    h.loadSave(JSON.parse(JSON.stringify(g.toSave())));
    expect(h.tiles[i].structure!.level).toBe(2);
  });
});

describe('seasons and weather', () => {
  it('turn over every seven days', () => {
    expect([1, 7, 8, 15, 22, 28, 29].map(seasonOf)).toEqual(['spring', 'spring', 'summer', 'fall', 'winter', 'winter', 'spring']);
    expect(yearOf(28)).toBe(1);
    expect(yearOf(29)).toBe(2);
  });

  it('day one is always sunny, and fall pays more at harvest', () => {
    const g = new Game();
    g.newGame(14);
    expect(g.weather).toBe('sunny');
    g.round = 15;
    g.loadSave(g.toSave());
    expect(g.season).toBe('fall');
    g.weather = 'sunny';
    g.wave = [];
    const [i] = plotTiles(g);
    g.place({ type: 'crop', kind: 'carrot' }, i);
    const start = g.credits;
    playDay(g);
    expect(g.credits - start).toBe(Math.round(CROPS.carrot.sellValue * SEASONS.fall.sell));
  });
});

describe('growing faster', () => {
  it('buys a day, or a fruit, at sensible lines', () => {
    // corn and watermelon lose a day at +13%: summer, Rich Soil 2, or one Seed Lab level
    for (const speed of [1.15, 1.16]) {
      expect(ripenDays('corn', speed)).toBe(1);
      expect(ripenDays('watermelon', speed)).toBe(2);
    }
    expect(ripenDays('corn')).toBe(2);
    expect(ripenDays('watermelon')).toBe(3);
    // pumpkin: a sprinkler and Rich Soil 3, or the Well Pump alone, but not a sprinkler and Rich Soil 2
    expect(ripenDays('pumpkin')).toBe(2);
    expect(ripenDays('pumpkin', 1.4 * 1.24)).toBe(1);
    expect(ripenDays('pumpkin', 1.7)).toBe(1);
    expect(ripenDays('pumpkin', 1.4 * 1.16)).toBe(2);
    expect(ripenDays('watermelon', 1.4 * 1.24 * 1.3)).toBe(1);
    // strawberries and tomatoes fruit twice a day with a bit of help
    expect(fruitsPerDay('strawberry')).toBe(1);
    expect(fruitsPerDay('strawberry', 1.3)).toBe(2);
    expect(fruitsPerDay('tomato', 1.15)).toBe(1);
    expect(fruitsPerDay('tomato', 1.24)).toBe(2);
    expect(fruitsPerDay('carrot', 3)).toBe(1);
  });

  it('turns corn into a one-day crop with Rich Soil', () => {
    const harvestDayOne = (soil: number) => {
      const g = new Game();
      g.newGame(41);
      unlockAll(g);
      g.farm.soil = soil;
      g.place({ type: 'crop', kind: 'corn' }, plotTiles(g)[0]);
      g.weather = 'sunny';
      g.wave = [];
      playDay(g);
      return g.roundStats.harvested.corn?.count ?? 0;
    };
    expect(harvestDayOne(0)).toBe(0);
    expect(harvestDayOne(2)).toBe(1);
  });

  it('lets a watered strawberry fruit twice a day, and it is spent sooner', () => {
    const g = new Game();
    g.newGame(42);
    unlockAll(g);
    g.credits = 500;
    const tiles = plotTiles(g);
    const berry = tiles.find((i) => [i - 1, i + 1].every((j) => tiles.includes(j)))!;
    g.place({ type: 'crop', kind: 'strawberry' }, berry);
    g.place({ type: 'defense', kind: 'sprinkler' }, berry + 1);
    const perDay: number[] = [];
    for (let day = 0; day < 5 && g.tiles[berry].crop; day++) {
      if (day > 0) g.continueAfterSummary();
      g.weather = 'sunny';
      g.wave = [];
      playDay(g);
      perDay.push(g.roundStats.harvested.strawberry?.count ?? 0);
    }
    expect(perDay).toEqual([2, 2, 1]);
    expect(g.tiles[berry].crop).toBeNull();
  });
});

describe('the market', () => {
  it('pays more for a crop nobody has brought to town lately, until you sell some', () => {
    const g = new Game();
    g.newGame(43);
    unlockAll(g);
    const [a] = plotTiles(g);
    const base = g.cropPrice('lettuce');
    for (let day = 0; day < 3; day++) {
      if (day > 0) g.continueAfterSummary();
      g.place({ type: 'crop', kind: 'radish' }, a); // only radishes go to market
      g.wave = [];
      playDay(g);
    }
    expect(g.wanted.lettuce).toBe(3);
    expect(g.wanted.radish).toBe(0);
    expect(g.demand('lettuce')).toBeCloseTo(3 * MARKET.wanted);
    g.continueAfterSummary();
    expect(g.cropPrice('lettuce') / g.market.lettuce).toBeCloseTo((base / 1) * (1 + 3 * MARKET.wanted) * SEASONS[g.season].sell / SEASONS.spring.sell, 5);
    g.wanted.carrot = 50;
    expect(g.demand('carrot')).toBe(MARKET.wantedMax);
    // a save keeps it
    const copy = new Game();
    copy.loadSave(JSON.parse(JSON.stringify(g.toSave())));
    expect(copy.wanted.lettuce).toBe(3);
    // and selling some lettuce puts it back to normal
    g.place({ type: 'crop', kind: 'lettuce' }, a);
    g.wave = [];
    playDay(g);
    expect(g.wanted.lettuce).toBe(0);
  });
});
