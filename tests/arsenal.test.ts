import { describe, expect, it } from 'vitest';
import {
  BUNNIES, CROPS, defenseStats, FARM, HYBRID_GROWTH, MAX_LEVEL, PEEK, POP_SECONDS, SOIL_GROWTH, WEAPON_LEVELS, WEAPONS,
} from '../src/config';
import { Game, migrateSave, type SaveData } from '../src/game';
import { idx } from '../src/world';
import { playDay, plotTiles, unlockAll } from './helpers';

const DT = 1 / 60;

/** A game in the middle of an empty day, everything unlocked and paid for. */
function field(seed = 1): Game {
  const g = new Game();
  g.newGame(seed);
  unlockAll(g);
  g.credits = 100000;
  g.wave = [];
  g.place({ type: 'crop', kind: 'carrot' }, plotTiles(g)[0]);
  return g;
}

const run = (g: Game, seconds: number) => {
  for (let t = 0; t < seconds; t += DT) g.update(DT);
};

describe('weapons', () => {
  it('are bought, levelled up to five, and taken in hand', () => {
    const g = field();
    expect(g.weapons.pellet).toBe(0);
    expect(g.buyWeapon('pellet')).toBe(true);
    expect(g.weapon).toBe('pellet'); // a new one goes straight into your hands
    for (let n = 1; n < WEAPON_LEVELS; n++) expect(g.buyWeapon('pellet')).toBe(true);
    expect(g.weapons.pellet).toBe(WEAPON_LEVELS);
    expect(g.weaponPrice('pellet')).toBeNull();
    expect(g.buyWeapon('pellet')).toBe(false);
    expect(g.selectWeapon('sling')).toBe(true);
    expect(g.selectWeapon('rocket')).toBe(false); // not owned
  });

  it('the spud gun splashes a crowd, ignores pots, and shakes Burrowers loose', () => {
    const g = field(2);
    g.buyWeapon('spud');
    g.startRound();
    const a = g.spawnAt('common', 11.5, 7.5);
    const b = g.spawnAt('pothead', 11.9, 7.4);
    const mole = g.spawnAt('digger', 11.2, 7.9);
    a.hp = b.hp = mole.hp = 50;
    mole.peek = 99; // not peeking on its own
    expect(g.isSurfaced(mole)).toBe(false);
    expect(g.fire(11.5, 7.3)).toBe(true);
    run(g, WEAPONS.spud.flight + 0.05);
    expect(a.hp).toBeLessThan(50);
    expect(b.hp).toBeLessThan(50);
    expect(b.armor).toBe(BUNNIES.pothead.armor); // splash went past the pot
    expect(mole.hp).toBeLessThan(50);
    expect(g.isSurfaced(mole)).toBe(true);
  });

  it("pebbles clang off a Pot-Head's pot until it's knocked loose", () => {
    const g = field(3);
    g.startRound();
    const b = g.spawnAt('pothead', 11.5, 7.5);
    b.hp = 10;
    for (let n = 0; n < (BUNNIES.pothead.armor ?? 0); n++) {
      g.weaponCd.sling = 0;
      g.fire(b.x, b.y - 0.3);
    }
    expect(b.hp).toBe(10);
    expect(b.armor).toBe(0);
    g.weaponCd.sling = 0;
    g.fire(b.x, b.y - 0.3);
    expect(b.hp).toBeLessThan(10);
  });

  it('the hose soaks and shoves bunnies, and floods Burrowers up', () => {
    const g = field(4);
    g.buyWeapon('hose');
    g.startRound();
    const b = g.spawnAt('common', 11.5, 7.5);
    const mole = g.spawnAt('digger', 12.2, 7.5);
    mole.peek = 99;
    const x0 = b.x;
    g.fire(11.2, 7.5);
    run(g, 0.3);
    g.stopHose();
    expect(b.wet).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThan(x0);
    expect(g.isSurfaced(mole)).toBe(true);
  });

  it('the top firework breaks into extra bursts', () => {
    const g = field(5);
    for (let n = 0; n < WEAPON_LEVELS; n++) g.buyWeapon('rocket');
    g.startRound();
    g.fire(11, 7);
    run(g, WEAPONS.rocket.flight + 0.05);
    expect(g.events.filter((e) => e.t === 'blast').length).toBe(4);
  });
});

describe('getting Burrowers out of the ground', () => {
  it('they peek up on their own every few seconds', () => {
    const g = field(6);
    g.startRound();
    const mole = g.spawnAt('digger', 1.5, 7.5);
    let up = 0;
    for (let t = 0; t < PEEK.every + PEEK.jitter + 2; t += DT) {
      g.update(DT);
      if (g.isSurfaced(mole) && mole.state === 'seek') up++;
    }
    expect(up).toBeGreaterThan(0);
  });

  it('a shot at the mound startles one out', () => {
    const g = field(7);
    g.startRound();
    const mole = g.spawnAt('digger', 11.5, 7.5);
    mole.peek = 99;
    expect(g.isSurfaced(mole)).toBe(false);
    g.fire(mole.x, mole.y - 0.15);
    expect(g.isSurfaced(mole)).toBe(true);
    expect(mole.popped).toBeCloseTo(POP_SECONDS);
  });

  it('a thumper knocks them up, dazed', () => {
    const g = field(8);
    const i = plotTiles(g)[14];
    g.place({ type: 'defense', kind: 'thumper' }, i);
    g.startRound();
    const mole = g.spawnAt('digger', (i % 22) + 1.6, Math.floor(i / 22) + 0.5);
    mole.peek = 99;
    run(g, 0.1);
    expect(g.isSurfaced(mole)).toBe(true);
    expect(g.events.some((e) => e.t === 'thump')).toBe(true);
  });
});

describe('new bunnies', () => {
  it('kits come four to a litter', () => {
    const g = field(9);
    g.wave = [{ at: 0.5, kind: 'kit', burrow: 0 }];
    expect(g.waveTotal()).toBe(4);
    g.startRound();
    run(g, 0.6);
    expect(g.bunnies.filter((b) => b.kind === 'kit').length).toBe(4);
  });

  it('a Leaper jumps a fence line instead of chewing through it', () => {
    const g = field(10);
    const r = g.plot;
    g.tiles[plotTiles(g)[0]].crop = null;
    const target = idx(r.x0 + 2, r.y0 + 2);
    g.place({ type: 'crop', kind: 'lettuce' }, target);
    // fence the lettuce in completely
    for (let y = r.y0 + 1; y <= r.y0 + 3; y++) {
      for (let x = r.x0 + 1; x <= r.x0 + 3; x++) if (idx(x, y) !== target) g.place({ type: 'defense', kind: 'fence' }, idx(x, y));
    }
    g.startRound();
    const b = g.spawnAt('leaper', r.x0 + 2.5, r.y0 - 1.5);
    b.hp = 99;
    run(g, 6);
    expect(g.tiles[target].crop?.hp ?? 0).toBeLessThan(CROPS.lettuce.hp);
    const fences = plotTiles(g).filter((i) => g.tiles[i].structure?.kind === 'fence');
    expect(fences.every((i) => g.tiles[i].structure!.hp === defenseStats('fence').hp)).toBe(true);
  });

  it('a Bandit carries off a ripe crop, and drops it when bonked', () => {
    const g = field(11);
    const [i] = plotTiles(g);
    g.tiles[i].crop!.growth = 999;
    g.startRound();
    const b = g.spawnAt('bandit', (i % 22) + 0.5, Math.floor(i / 22) - 1.5);
    run(g, 3);
    expect(b.carry?.crop.kind).toBe('carrot');
    expect(g.tiles[i].crop).toBeNull();
    g.damageBunny(b, 99, 'trap');
    expect(g.tiles[i].crop?.kind).toBe('carrot');
  });

  it('snow hares only come in winter', () => {
    const g = field(12);
    const kinds = (round: number) => {
      g.round = round;
      g.loadSave(g.toSave());
      return new Set(g.wave.map((w) => w.kind));
    };
    expect(kinds(20).has('snowhare')).toBe(false);
    expect([22, 24, 26].some((d) => kinds(d).has('snowhare'))).toBe(true);
  });
});

describe('new defenses', () => {
  it('a Carrot Decoy draws bunnies in, and they leave hungry', () => {
    const g = field(13);
    const r = g.plot;
    g.tiles[plotTiles(g)[0]].crop = null;
    g.place({ type: 'crop', kind: 'carrot' }, idx(r.x1, r.y1));
    const decoy = idx(r.x0, r.y0);
    g.place({ type: 'defense', kind: 'decoy' }, decoy);
    g.startRound();
    const b = g.spawnAt('common', r.x0 - 1.5, r.y0 + 0.5);
    run(g, 2);
    expect(b.target).toBe(decoy);
    run(g, 5);
    expect(g.tiles[decoy].structure?.hp ?? 0).toBeLessThan(defenseStats('decoy').hp);
    expect(b.fed).toBe(false);
  });

  it('a beehive stings whatever comes close', () => {
    const g = field(14);
    const i = plotTiles(g)[14];
    g.place({ type: 'defense', kind: 'beehive' }, i);
    g.startRound();
    const b = g.spawnAt('pothead', (i % 22) + 1.5, Math.floor(i / 22) + 0.5);
    b.hp = 10;
    run(g, 0.2);
    expect(b.hp).toBeLessThan(10);
    expect(b.armor).toBe(BUNNIES.pothead.armor); // bees go around the pot
  });

  it('upgrade to five stars, and four-star fences zap chewers', () => {
    const g = field(15);
    const [i] = plotTiles(g);
    g.tiles[i].crop = null;
    g.place({ type: 'defense', kind: 'fence' }, i);
    while (g.upgradeAt(i));
    expect(g.tiles[i].structure!.level).toBe(MAX_LEVEL);
    expect(defenseStats('fence', 4).shock).toBeGreaterThan(0);
    expect(defenseStats('turret', 5).damage).toBeGreaterThan(defenseStats('turret', 1).damage);
  });
});

describe('growing better', () => {
  it('the Seed Lab and Rich Soil speed crops up; the stall and the lab raise prices', () => {
    const g = field(16);
    const base = g.cropPrice('carrot');
    expect(g.breed('carrot')).toBe(true);
    expect(g.buyFarm('soil')).toBe(true);
    expect(g.buyFarm('stall')).toBe(true);
    expect(g.cropGrowth('carrot')).toBeCloseTo((1 + HYBRID_GROWTH) * (1 + SOIL_GROWTH));
    expect(g.cropPrice('carrot')).toBeGreaterThan(base);
    // a two-day pumpkin becomes a one-day pumpkin with enough help
    for (let n = 0; n < 2; n++) g.breed('pumpkin');
    g.breed('pumpkin');
    g.buyFarm('soil');
    g.buyFarm('soil');
    g.buyFarm('well');
    const i = plotTiles(g)[8];
    g.place({ type: 'crop', kind: 'pumpkin' }, i);
    g.place({ type: 'defense', kind: 'sprinkler' }, plotTiles(g)[9]);
    playDay(g);
    expect(g.roundStats.harvested.pumpkin?.count).toBe(1);
  });

  it('a greenhouse keeps winter from slowing things', () => {
    const g = field(17);
    g.round = 23;
    g.loadSave(g.toSave());
    const cold = g.climateGrowth;
    expect(cold).toBeLessThan(1);
    g.farm.greenhouse = FARM.greenhouse.costs.length;
    expect(g.climateGrowth).toBeGreaterThanOrEqual(1);
  });
});

describe('saves', () => {
  it('keep the arsenal, the farm, and the lab', () => {
    const g = field(18);
    g.buyWeapon('spud');
    g.buyWeapon('spud');
    g.buyFarm('soil');
    g.breed('corn');
    const h = new Game();
    h.loadSave(JSON.parse(JSON.stringify(g.toSave())));
    expect(h.weapons.spud).toBe(2);
    expect(h.weapon).toBe('spud');
    expect(h.farm.soil).toBe(1);
    expect(h.hybrid.corn).toBe(1);
  });

  it('bring an old sling up to date', () => {
    const v2 = { v: 2, seed: 1, round: 5, credits: 50, plotLevel: 0, slingLevel: 2, breedBonus: 0, stats: {}, tiles: [] };
    expect(migrateSave(v2 as unknown as SaveData)?.weapons?.sling).toBe(3);
  });
});
