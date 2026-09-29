import { describe, expect, it } from 'vitest';
import { BUNNIES, defenseStats, HARVEST_SECONDS, MODES, PROJECT, SMOKE_BOMB, waveWeights } from '../src/config';
import { Game } from '../src/game';
import { CRATER, idx } from '../src/world';
import { plotTiles, unlockAll } from './helpers';

const DT = 1 / 60;

function morningOf(g: Game, round: number): void {
  g.round = round;
  g.loadSave(g.toSave());
}

describe('Hard Mode', () => {
  it('brings a third more bunnies, and the Year 2 kinds in Year 1', () => {
    const normal = new Game();
    normal.newGame(5, 'normal');
    const hard = new Game();
    hard.newGame(5, 'hard');
    morningOf(normal, 12);
    morningOf(hard, 12);
    expect(hard.wave.length).toBeGreaterThanOrEqual(Math.round(normal.wave.length * 1.2));
    const has = (mode: 'normal' | 'hard', round: number, kind: string) => waveWeights(round, mode).some(([k]) => k === kind);
    expect(has('hard', 16, 'ninja')).toBe(true);
    expect(has('normal', 16, 'ninja')).toBe(false);
    expect(has('hard', 23, 'queen')).toBe(true);
    expect(has('normal', 30, 'queen')).toBe(false);
  });

  it('makes the bunnies tougher', () => {
    const normal = new Game();
    normal.newGame(5, 'normal');
    const hard = new Game();
    hard.newGame(5, 'hard');
    morningOf(normal, 12);
    morningOf(hard, 12);
    expect(hard.spawnAt('fat', 5, 5).hp).toBeGreaterThan(normal.spawnAt('fat', 5, 5).hp);
    expect(hard.spawnAt('mutant', 5, 5).hp).toBeGreaterThan(normal.spawnAt('mutant', 5, 5).hp);
  });

  it('sends four Bucks on the Last Night, and all four must fall', () => {
    const g = new Game();
    g.newGame(6, 'hard');
    unlockAll(g);
    g.stats.bossesBeaten = PROJECT[2].bucks;
    g.project = 2;
    g.credits = 20000;
    g.place({ type: 'crop', kind: 'carrot' }, plotTiles(g)[0]);
    expect(g.fundProject()).toBe(true);
    expect(g.wave.filter((w) => w.kind === 'mutant').length).toBe(MODES.hard.lastNightBucks);
    expect(g.startRound()).toBe(true);
    let spared = false; // let the last Buck through
    let guard = 0;
    while (g.phase !== 'summary' && guard++ < 60 * 200) {
      g.update(DT);
      for (const b of g.bunnies) {
        if (!BUNNIES[b.kind].boss || b.dead) continue;
        if (g.roundStats.bucks < MODES.hard.lastNightBucks - 1) g.damageBunny(b, 9999);
        else spared = true;
      }
      if (g.phase === 'harvest') g.finishHarvestNow();
    }
    expect(spared).toBe(true);
    expect(g.nightResult).toBe('cracked');
  });

  it('survives a save, and old saves come back as normal', () => {
    const g = new Game();
    g.newGame(7, 'hard');
    const copy = new Game();
    copy.loadSave(g.toSave());
    expect(copy.mode).toBe('hard');
    expect(copy.lastNightBucks).toBe(4);
    const old = g.toSave();
    delete old.mode;
    copy.loadSave(old);
    expect(copy.mode).toBe('normal');
    expect(copy.lastNightBucks).toBe(3);
  });
});

describe('all clear', () => {
  it('comes once every bunny is out and the rest are on their way home empty-handed', () => {
    const g = new Game();
    g.newGame(21);
    g.place({ type: 'crop', kind: 'radish' }, plotTiles(g)[0]);
    expect(g.startRound()).toBe(true);
    g.wave = [{ at: 0.5, kind: 'common', burrow: 0 }, { at: 1, kind: 'common', burrow: 0 }];
    expect(g.allClear()).toBe(false); // more to come
    while (g.bunnies.length < 2) g.update(DT);
    expect(g.allClear()).toBe(false); // out, and hungry
    for (const b of g.bunnies) b.state = 'exit';
    expect(g.allClear()).toBe(true);
    const bandit = g.bunnies[0];
    bandit.carry = { crop: { kind: 'radish', growth: 1, hp: 1, harvests: 0, fresh: false, shake: 0 }, from: plotTiles(g)[0] };
    expect(g.allClear()).toBe(false); // worth one more shot
    bandit.carry = null;
    g.spawnAt('mutant', 10, 8).state = 'exit';
    expect(g.allClear()).toBe(false); // so is a Buck
  });
});

describe('the harvest', () => {
  it('counts up a whole farm about as fast as a little one', () => {
    const g = new Game();
    g.newGame(22);
    unlockAll(g);
    g.lots = g.lots.map(() => true);
    for (const i of g.ownedTiles()) g.tilled[i] = 1;
    g.credits = 99999;
    for (const i of plotTiles(g)) g.place({ type: 'crop', kind: 'radish' }, i);
    expect(g.cropCount()).toBeGreaterThan(150);
    for (const t of g.tiles) if (t.crop) t.crop.growth = 999;
    expect(g.startRound()).toBe(true);
    g.wave = [];
    while (g.phase !== 'harvest') g.update(DT);
    let t = 0;
    while (g.phase === 'harvest') {
      g.update(DT);
      t += DT;
    }
    expect(t).toBeLessThan(0.6 + HARVEST_SECONDS + 1.1 + 0.2);
  });
});

describe('repair', () => {
  it('counts the chewed defenses and patches them all at once', () => {
    const g = new Game();
    g.newGame(8);
    unlockAll(g);
    g.credits = 500;
    const [a, b] = plotTiles(g);
    g.place({ type: 'defense', kind: 'fence' }, a);
    g.place({ type: 'defense', kind: 'fence' }, b);
    g.tiles[a].structure!.hp = defenseStats('fence', 1).hp / 4;
    expect(g.chewedCount()).toBe(1);
    const cost = g.repairCost();
    expect(cost).toBeGreaterThan(0);
    expect(g.repairAll()).toBe(true);
    expect(g.credits).toBe(500 - (2 * g.itemCost({ type: 'defense', kind: 'fence' })) - cost);
    expect(g.chewedCount()).toBe(0);
  });
});

describe('smoke bombs', () => {
  const crater = idx(CRATER.x, CRATER.y);
  const ready = () => {
    const g = new Game();
    g.newGame(31);
    g.stats.bossesBeaten = 1;
    g.round = 9; // not a Buck day
    g.loadSave(g.toSave());
    g.credits = 1000;
    return g;
  };

  it('open up after the first Buck', () => {
    const g = new Game();
    g.newGame(31);
    g.credits = 1000;
    expect(g.place({ type: 'smoke' }, crater)).toBe(false);
    expect(g.smokeProblem()).toMatch(/Smoke Bombs unlock after an Asteroid Buck/);
    expect(ready().smokeProblem()).toBeNull();
  });

  it('bring one Buck out today, for a price, into the crater only', () => {
    const g = ready();
    const before = g.wave.filter((w) => w.kind === 'mutant').length;
    expect(before).toBe(0);
    expect(g.place({ type: 'smoke' }, plotTiles(g)[0])).toBe(false); // that's the farm, not the crater
    expect(g.place({ type: 'smoke' }, crater)).toBe(true);
    expect(g.credits).toBe(1000 - SMOKE_BOMB);
    expect(g.wave.filter((w) => w.kind === 'mutant').length).toBe(1);
    expect(g.smoking).toBe(true);
    expect(g.place({ type: 'smoke' }, crater)).toBe(false); // one a day
  });

  it('are no use on a day a Buck is coming anyway', () => {
    const g = ready();
    g.round = 14;
    g.loadSave(g.toSave());
    g.credits = 1000;
    expect(g.isBossDay()).toBe(true);
    expect(g.smokeProblem()).toMatch(/anyway/);
  });

  it('survive a reload, and the smoke clears overnight', () => {
    const g = ready();
    const plain = g.wave.map((w) => `${w.kind}@${w.at.toFixed(3)}`);
    expect(g.place({ type: 'smoke' }, crater)).toBe(true);
    const copy = new Game();
    copy.loadSave(g.toSave());
    expect(copy.smoked).toBe(true);
    expect(copy.wave.filter((w) => w.kind !== 'mutant').map((w) => `${w.kind}@${w.at.toFixed(3)}`)).toEqual(plain);
    expect(copy.wave.filter((w) => w.kind === 'mutant').length).toBe(1);
    // play the day out; beating the Buck counts toward the Crater Project
    copy.place({ type: 'crop', kind: 'radish' }, plotTiles(copy)[0]);
    expect(copy.startRound()).toBe(true);
    let guard = 0;
    while (copy.phase !== 'summary' && guard++ < 60 * 200) {
      copy.update(DT);
      for (const b of copy.bunnies) if (BUNNIES[b.kind].boss && !b.dead) copy.damageBunny(b, 9999);
      if (copy.phase === 'harvest') copy.finishHarvestNow();
    }
    expect(copy.stats.bossesBeaten).toBe(2);
    copy.continueAfterSummary();
    expect(copy.smoked).toBe(false);
    expect(copy.wave.some((w) => w.kind === 'mutant')).toBe(false);
  });
});
