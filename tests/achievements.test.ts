import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, satisfied } from '../src/achievements';
import { EVENTS } from '../src/config';
import { Game } from '../src/game';

describe('achievements', () => {
  it('have their own names', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
  });

  it('are earned by what happens on the farm', () => {
    const g = new Game();
    g.newGame(101, 'hard', 'river');
    expect(satisfied(g, {}, false)).toEqual([]);
    g.stats.kills = 120;
    g.stats.golden = 5;
    g.stats.orders = 1;
    expect(satisfied(g, {}, false)).toEqual(expect.arrayContaining(['first_bonk', 'bonk_100', 'golden_1', 'golden_5', 'order_1']));
    expect(satisfied(g, {}, false)).not.toContain('bonk_1000');
    g.stats.sealedOn = 26;
    expect(satisfied(g, {}, false)).toEqual(expect.arrayContaining(['sealed', 'sealed_fast', 'sealed_hard', 'river']));
    expect(satisfied(g, {}, false)).not.toContain('orchard');
    g.lots = g.lots.map(() => true);
    expect(satisfied(g, {}, false)).toContain('full_farm');
  });

  it('some only count after an evening harvest, some are noticed as they happen', () => {
    const g = new Game();
    g.newGame(102);
    g.roundStats.fairSold = EVENTS.fairCap;
    g.roundStats.harvestTotal = 5200;
    expect(satisfied(g, {}, false)).not.toContain('fair');
    expect(satisfied(g, {}, true)).toEqual(expect.arrayContaining(['fair', 'harvest_5000']));
    expect(satisfied(g, { combo: true, dailyDone: true, classic: 1200 }, false))
      .toEqual(expect.arrayContaining(['combo', 'daily', 'classic_1000']));
  });
});
