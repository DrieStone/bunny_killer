import { describe, expect, it } from 'vitest';
import { CROPS, defenseStats, investedIn, seasonOf, SEASONS, upgradeCost, yearOf } from '../src/config';
import { Game } from '../src/game';
import { playDay, plotTiles } from './helpers';

describe('strawberries', () => {
  it('fruit every evening, five times, then the plant is spent', () => {
    const g = new Game();
    g.newGame(11);
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
    g.credits = 500;
    const [i] = plotTiles(g);
    g.place({ type: 'defense', kind: 'turret' }, i);
    const before = g.credits;
    expect(g.upgradeAt(i)).toBe(true);
    expect(g.credits).toBe(before - upgradeCost('turret', 1));
    expect(g.tiles[i].structure!.level).toBe(2);
    expect(g.upgradeAt(i)).toBe(true);
    expect(g.upgradeAt(i)).toBe(false); // maxed at 3
    const l1 = defenseStats('turret', 1);
    const l3 = defenseStats('turret', 3);
    expect(l3.radius).toBeGreaterThan(l1.radius);
    expect(l3.period).toBeLessThan(l1.period);
    expect(l3.damage).toBeGreaterThan(l1.damage);
    expect(g.tiles[i].structure!.hp).toBe(l3.hp);
    // bought today: selling refunds everything put into it
    expect(g.removeValue(i)).toBe(investedIn('turret', 3));
  });

  it('survive a save and load', () => {
    const g = new Game();
    g.newGame(13);
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
