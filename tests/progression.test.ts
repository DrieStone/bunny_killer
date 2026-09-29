import { describe, expect, it } from 'vitest';
import { BUNNIES, CAP_RETRY, CROPS, MARKET, PROJECT, START_LOTS } from '../src/config';
import { Game, migrateSave, type SaveData } from '../src/game';
import { idx, lotOf } from '../src/world';
import { playDay, plotTiles, unlockAll } from './helpers';

const DT = 1 / 60;

/** Reload the farm in place, as if it were the morning of `round`. */
function morningOf(g: Game, round: number): void {
  g.round = round;
  g.loadSave(g.toSave());
}

describe('unlocks', () => {
  it('hold things back until they are earned', () => {
    const g = new Game();
    g.newGame(1);
    const [i] = plotTiles(g);
    expect(g.placeProblem({ type: 'defense', kind: 'scarecrow' }, i)).toMatch(/Day 3/);
    expect(g.placeProblem({ type: 'crop', kind: 'carrot' }, i)).toBeNull();
    expect(g.buyLot(0)).toBe(false); // land comes later too
    g.credits = 1000;
    expect(g.buyWeapon('pellet')).toBe(false);
    expect(g.buyWeapon('sling')).toBe(true); // the sling can always be upgraded
    morningOf(g, 3);
    expect(g.placeProblem({ type: 'defense', kind: 'scarecrow' }, i)).toBeNull();
    g.stats.kills = 40;
    morningOf(g, 3);
    expect(g.buyWeapon('pellet')).toBe(true);
  });

  it('open on bonks, harvests and Bucks, and announce themselves the next morning', () => {
    const g = new Game();
    g.newGame(2);
    g.wave = [];
    g.place({ type: 'crop', kind: 'radish' }, plotTiles(g)[0]);
    g.stats.kills = 90;
    g.stats.bossesBeaten = 1;
    playDay(g);
    expect(g.pendingUnlocks()).toEqual(expect.arrayContaining(['sprinkler', 'turret', 'pellet']));
    g.continueAfterSummary();
    expect(g.newUnlocks).toEqual(expect.arrayContaining(['sprinkler', 'turret', 'pellet']));
    expect(g.isUnlocked('doghouse')).toBe(false);
    expect(g.lockReason('doghouse')).toMatch(/250 bonks \(90 so far\)/);
  });

  it('gate upgrades by level', () => {
    const g = new Game();
    g.newGame(3);
    g.credits = 1000;
    const [i] = plotTiles(g);
    g.place({ type: 'defense', kind: 'trap' }, i);
    expect(g.upgradeAt(i)).toBe(false);
    g.unlocked.add('upgrade2');
    expect(g.upgradeAt(i)).toBe(true);
    expect(g.upgradeAt(i)).toBe(false); // level 3 needs its own unlock
    g.unlocked.add('upgrade3');
    expect(g.upgradeAt(i)).toBe(true);
  });
});

describe('the Crater Project', () => {
  it('needs Bucks beaten and credits, and angers the crater', () => {
    const g = new Game();
    g.newGame(4);
    g.credits = 50000;
    expect(g.fundProject()).toBe(false);
    expect(g.projectProblem()).toMatch(/Asteroid Buck/);
    g.stats.bossesBeaten = PROJECT[1].bucks;
    const calm = g.wave.length;
    expect(g.fundProject()).toBe(true);
    expect(g.fundProject()).toBe(true);
    expect(g.project).toBe(2);
    expect(g.credits).toBe(50000 - PROJECT[0].cost - PROJECT[1].cost);
    expect(g.projectProblem()).toMatch(new RegExp(`${PROJECT[2].bucks} Asteroid Bucks`));
    morningOf(g, 1); // same day, angrier crater
    expect(g.wave.length).toBeGreaterThan(calm);
    expect(g.wave.filter((w) => w.burrow < 0).length).toBeGreaterThan(0);
  });

  it('ends in the Last Night: bonk every Buck and the crater is sealed', () => {
    const g = new Game();
    g.newGame(5);
    unlockAll(g);
    g.stats.bossesBeaten = PROJECT[2].bucks;
    g.project = 2;
    g.credits = 20000;
    g.place({ type: 'crop', kind: 'carrot' }, plotTiles(g)[0]);
    expect(g.fundProject()).toBe(true);
    expect(g.lastNight).toBe(true);
    expect(g.wave.filter((w) => w.kind === 'mutant').length).toBe(g.lastNightBucks);
    // a perfect night: every Buck goes down the moment it climbs out
    expect(g.startRound()).toBe(true);
    let guard = 0;
    while (g.phase !== 'summary' && guard++ < 60 * 200) {
      g.update(DT);
      for (const b of g.bunnies) if (BUNNIES[b.kind].boss) g.damageBunny(b, 9999);
    }
    expect(g.nightResult).toBe('sealed');
    g.continueAfterSummary();
    expect(g.phase).toBe('victory');
    expect(g.stats.sealedOn).toBe(1);
  });

  it('cracks if a Buck survives the night, and costs less to try again', () => {
    const g = new Game();
    g.newGame(6);
    g.stats.bossesBeaten = PROJECT[2].bucks;
    g.project = 2;
    g.credits = 20000;
    g.place({ type: 'crop', kind: 'carrot' }, plotTiles(g)[0]);
    g.fundProject();
    playDay(g); // nobody fights back
    expect(g.nightResult).toBe('cracked');
    expect(g.project).toBe(PROJECT.length - 1);
    expect(g.projectCost()).toBe(Math.round(PROJECT[2].cost * CAP_RETRY));
    g.continueAfterSummary();
    expect(g.phase).toBe('planning');
    expect(g.lastNight).toBe(false);
  });
});

describe('the market', () => {
  it('wanders, but stays in bounds', () => {
    const g = new Game();
    g.newGame(7);
    for (let d = 0; d < 200; d++) {
      g.round++;
      g.moveMarket();
      for (const k of Object.keys(CROPS) as (keyof typeof CROPS)[]) {
        expect(g.market[k]).toBeGreaterThanOrEqual(MARKET.min);
        expect(g.market[k]).toBeLessThanOrEqual(MARKET.max);
      }
    }
  });

  it('pays less for a glut, and remembers it the next day', () => {
    const g = new Game();
    g.newGame(8);
    g.market.carrot = 1;
    expect(g.cropPrice('carrot', 0)).toBe(CROPS.carrot.sellValue);
    expect(g.cropPrice('carrot', MARKET.glut + 10)).toBeLessThan(CROPS.carrot.sellValue);
    expect(g.cropPrice('carrot', 1000)).toBeCloseTo(CROPS.carrot.sellValue * MARKET.glutFloor);
    // a whole plot of ripe carrots
    g.wave = [];
    for (const i of plotTiles(g)) g.tiles[i].crop = { kind: 'carrot', growth: 999, hp: CROPS.carrot.hp, harvests: 0, fresh: false, shake: 0 };
    playDay(g);
    const n = plotTiles(g).length;
    expect(g.roundStats.harvestTotal).toBeLessThan(n * CROPS.carrot.sellValue);
    expect(g.roundStats.market.carrot).toBeLessThan(1);
    expect(g.glut.carrot).toBeGreaterThan(0);
    expect(g.cropPrice('carrot', 0) / g.market.carrot).toBeLessThanOrEqual(CROPS.carrot.sellValue);
  });
});

describe('Year 2 bunnies', () => {
  it('ninjas sidestep about half the pebbles', () => {
    const g = new Game();
    g.newGame(9);
    g.startRound();
    let dodged = 0;
    for (let n = 0; n < 200; n++) {
      const b = g.spawnAt('ninja', 11.5, 7.5);
      b.hp = 99;
      g.weaponCd.sling = 0;
      g.fire(b.x, b.y - 0.3);
      if (b.hp === 99) dodged++;
      g.bunnies = [];
    }
    expect(dodged).toBeGreaterThan(60);
    expect(dodged).toBeLessThan(140);
  });

  it('the Bunny Queen sends Burrowers into the field', () => {
    const g = new Game();
    g.newGame(10);
    g.place({ type: 'crop', kind: 'carrot' }, plotTiles(g)[20]);
    g.wave = [];
    g.startRound();
    g.spawnAt('queen', 2.5, 6.5);
    for (let t = 0; t < 16; t += DT) g.update(DT);
    expect(g.bunnies.filter((b) => b.kind === 'digger').length).toBeGreaterThanOrEqual(2);
  });
});

describe('old saves', () => {
  it('move onto the new map, keeping their place on the plot', () => {
    const at = (x: number, y: number) => y * 28 + x;
    const v1 = {
      v: 1, seed: 3, round: 9, credits: 100, plotLevel: 3, slingLevel: 1, breedBonus: 0,
      stats: { kills: 80, harvest: 2000, cropsLost: 3, bossesBeaten: 1 },
      tiles: [
        { i: at(11, 6), crop: { kind: 'carrot', growth: 10, hp: 5 } }, // the old 6x6 plot's corner
        { i: at(8, 3), structure: { kind: 'turret', hp: 10, level: 2 } }, // the 12x12 plot's corner: gone
      ],
    } as unknown as SaveData;
    const d = migrateSave(v1)!;
    expect(d.v).toBe(4);
    expect(d.weapons?.sling).toBe(2); // the old Oak Sling
    expect(d.tiles).toHaveLength(1);
    expect(d.tiles[0].i).toBe(idx(8, 5)); // the map grew a row on top since
    // every lot the old 10x10 plot (moved down a row) touched
    const touched = new Set<number>();
    for (let y = 3; y <= 12; y++) for (let x = 6; x <= 15; x++) touched.add(lotOf(x, y));
    expect(new Set(d.lots)).toEqual(new Set([...touched, ...START_LOTS]));
    expect(d.tilled?.length).toBe(100);
    expect(d.credits).toBeGreaterThan(100 + 750); // the lost land and turret come back as credits
    const g = new Game();
    g.loadSave(d);
    expect(g.tiles[idx(8, 5)].crop?.kind).toBe('carrot');
    expect(g.tilled[idx(8, 5)]).toBe(1);
    expect(g.isUnlocked('sprinkler')).toBe(true); // 80 bonks
  });
});
