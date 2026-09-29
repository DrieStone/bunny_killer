import { describe, expect, it } from 'vitest';
import { COMBOS, defenseStats } from '../src/config';
import { Game } from '../src/game';
import { tileX, tileY } from '../src/world';
import { plotTiles, unlockAll } from './helpers';

const DT = 1 / 60;

function field(seed: number): Game {
  const g = new Game();
  g.newGame(seed);
  unlockAll(g);
  g.credits = 99999;
  return g;
}

function start(g: Game): void {
  g.wave = [];
  g.goldenAt = -1;
  expect(g.startRound()).toBe(true);
}

/** The cooldown a defense sets itself right after it acts on a bunny standing next to it. */
function cooldownAfterAct(g: Game, tile: number, kind: 'mutant' | 'common', dx = 1, dy = 0): number {
  start(g);
  const b = g.spawnAt(kind, tileX(tile) + 0.5 + dx, tileY(tile) + 0.5 + dy);
  b.hp = b.maxHp = 999;
  const s = g.tiles[tile].structure!;
  for (let n = 0; n < 600 && s.cd <= 0; n++) g.update(DT);
  return s.cd + DT;
}

describe('defense combos', () => {
  it('pollination: a sunflower in range makes the bees sting twice as often', () => {
    const plain = field(81);
    const hive = plotTiles(plain)[9];
    plain.place({ type: 'defense', kind: 'beehive' }, hive);
    const alone = cooldownAfterAct(plain, hive, 'mutant');

    const g = field(81);
    g.place({ type: 'defense', kind: 'beehive' }, hive);
    g.place({ type: 'crop', kind: 'sunflower' }, hive - 1);
    const helped = cooldownAfterAct(g, hive, 'mutant');
    expect(alone).toBeCloseTo(defenseStats('beehive', 1).period, 1);
    expect(helped).toBeCloseTo(alone / COMBOS.pollen, 1);
  });

  it('bait: a trap by a Carrot Decoy re-arms twice as fast', () => {
    const plain = field(82);
    const trap = plotTiles(plain)[10];
    plain.place({ type: 'defense', kind: 'trap' }, trap);
    const alone = cooldownAfterAct(plain, trap, 'common', 0, 0);

    const g = field(82);
    g.place({ type: 'defense', kind: 'trap' }, trap);
    g.place({ type: 'defense', kind: 'decoy' }, trap + 1);
    const helped = cooldownAfterAct(g, trap, 'common', 0, 0);
    expect(alone).toBeCloseTo(defenseStats('trap', 1).period, 1);
    expect(helped).toBeCloseTo(alone / COMBOS.bait, 1);
  });

  it('dazed: turret pebbles hit a Burrower knocked out of the ground twice as hard', () => {
    const g = field(83);
    const turret = plotTiles(g)[12];
    g.place({ type: 'defense', kind: 'turret' }, turret);
    start(g);
    const b = g.spawnAt('digger', tileX(turret) + 1.5, tileY(turret) + 0.5);
    b.hp = b.maxHp = 50;
    b.popped = 5; // up and dazed
    for (let n = 0; n < 600 && b.hp === 50; n++) {
      b.popped = 5;
      g.update(DT);
    }
    expect(50 - b.hp).toBe(defenseStats('turret', 1).damage * COMBOS.dazed);
  });

  it("watchdog: the dog goes for a bunny chewing a fence, and bites it harder", () => {
    const g = field(84);
    const tiles = plotTiles(g);
    const house = tiles[9];
    g.place({ type: 'defense', kind: 'doghouse' }, house);
    const fence = house + 2;
    g.place({ type: 'defense', kind: 'fence' }, fence);
    start(g);
    const dog = g.dogs[0];
    const idle = g.spawnAt('common', dog.x + 0.3, dog.y); // right by the dog
    const chewer = g.spawnAt('common', tileX(fence) + 1.1, tileY(fence) + 0.5);
    idle.hp = idle.maxHp = 99;
    chewer.hp = chewer.maxHp = 99;
    let bitten = 0;
    for (let n = 0; n < 240 && !bitten; n++) {
      chewer.state = 'chew';
      chewer.chewTile = fence;
      chewer.resume = 'seek';
      g.update(DT);
      bitten = 99 - chewer.hp;
    }
    expect(idle.hp).toBe(99);
    expect(bitten).toBe(defenseStats('doghouse', 1).damage + COMBOS.watchdog);
  });

  it('soggy scare: a soaked bunny runs from a scarecrow twice as long', () => {
    const g = field(85);
    const crow = plotTiles(g)[9];
    g.place({ type: 'defense', kind: 'scarecrow' }, crow);
    start(g);
    const dry = g.spawnAt('common', tileX(crow) + 1.5, tileY(crow) + 0.5);
    const wet = g.spawnAt('common', tileX(crow) - 0.5, tileY(crow) + 0.5);
    wet.wet = 99;
    for (let n = 0; n < 300 && (dry.state !== 'spooked' || wet.state !== 'spooked'); n++) {
      wet.wet = 99;
      g.update(DT);
    }
    expect(dry.state).toBe('spooked');
    expect(wet.state).toBe('spooked');
    expect(wet.timer).toBeCloseTo(dry.timer * COMBOS.soggy, 1);
  });
});
