import { expect } from 'vitest';
import {
  BUNNIES, COLS, CROP_ORDER, CROPS, type CropKind, FARM_ORDER, FARM_X0, FARM_Y0, fruitsPerDay, LOTS_X, ripenDays, SMOKE_BOMB, PROJECT, ROUND_SECONDS, UNLOCKS, WEAPON_ORDER, type WeaponKind,
} from '../src/config';
import type { Game } from '../src/game';
import type { ShopItem } from '../src/types';
import { CRATER, idx, tileX, tileY } from '../src/world';

const DT = 1 / 60;

/** Open the whole store, for tests about things that are normally earned. */
export function unlockAll(g: Game): void {
  for (const r of UNLOCKS) g.unlocked.add(r.what);
}

/** Pick the best thing in the arsenal for the moment: fireworks for a Buck, potatoes for a crowd. */
function chooseWeapon(g: Game, boss: boolean): void {
  const ready = (k: WeaponKind) => g.weapons[k] > 0 && g.weaponCd[k] <= 0;
  const order: WeaponKind[] = boss ? ['rocket', 'spud', 'pellet', 'sling'] : ['spud', 'pellet', 'sling'];
  const pick = order.find(ready) ?? order.find((k) => g.weapons[k] > 0) ?? 'sling';
  g.selectWeapon(pick);
}

/** Run one full day. `aim` = seconds between shots (0 = never shoot). */
export function playDay(g: Game, aim = 0, accuracy = 0.8): void {
  expect(g.startRound()).toBe(true);
  let shotTimer = 0;
  let guard = 0;
  while (g.phase !== 'summary') {
    g.update(DT);
    g.events.length = 0;
    if (aim > 0 && (g.phase === 'round' || g.phase === 'sundown')) {
      shotTimer -= DT;
      if (shotTimer <= 0) {
        const targets = g.bunnies.filter((b) => g.isSurfaced(b) && b.state !== 'exit');
        // a sensible farmer puts the big green one down first
        const bucks = targets.filter((b) => BUNNIES[b.kind].boss);
        const mounds = g.bunnies.filter((b) => !g.isSurfaced(b));
        if (targets.length) {
          const pool = bucks.length && Math.random() < 0.8 ? bucks : targets;
          const b = pool[Math.floor(Math.random() * pool.length)];
          const miss = Math.random() > accuracy ? 1.5 : 0;
          chooseWeapon(g, bucks.length > 0);
          g.fire(b.x + miss, b.y - BUNNIES[b.kind].aim);
        } else if (mounds.length) {
          // nothing up: knock on a Burrower's mound to bring it out
          const b = mounds[0];
          g.selectWeapon('sling');
          g.fire(b.x, b.y - 0.15);
        }
        shotTimer = aim;
      }
    }
    if (++guard > 60 * (ROUND_SECONDS + 60)) throw new Error(`day never ended (phase ${g.phase})`);
  }
}

/** Every tile you own (at the start, all tilled). */
export function plotTiles(g: Game): number[] {
  return g.ownedTiles().sort((a, b) => a - b);
}

/** A simple planner: a ring of defenses around the middle, crops everywhere else, and the Crater Project when it can. */
export function botPlan(g: Game): void {
  const tiles = plotTiles(g);
  const r = g.plot;
  const put = (item: ShopItem, i: number) => g.placeProblem(item, i) === null && g.place(item, i);
  // broke with nothing growing: sell defenses until there's seed money again
  for (const i of tiles) {
    if (g.cropCount() > 0 || g.credits >= 120) break;
    if (g.tiles[i].structure) g.removeAt(i);
  }
  if (g.repairCost() > 0 && g.credits > g.repairCost() + 40) g.repairAll();
  // lots got away fed yesterday: the farm is being overrun, so defenses come before saving up
  const siege = g.breedBonus >= 6;
  const seedMoney = () => tiles.filter((i) => !g.tiles[i].crop && !g.tiles[i].structure).length * 16;
  // the goal: stages 1 and 2 as soon as they're affordable, the cap once there's a cushion for the night,
  // and always with the seed money left over
  const cost = g.projectCost();
  const reserve = g.project === PROJECT.length - 1 ? 600 : 250;
  if (cost !== null && !siege && g.projectProblem() === null && g.credits >= cost + reserve + seedMoney()) g.fundProject();
  // after the win: the Farm Legacy, one landmark at a time, keeping a cushion
  const landmark = g.legacyCost();
  if (landmark !== null && !siege && g.credits >= landmark + 2000 + seedMoney()) g.fundLegacy();
  // once the next stage is only a matter of money, save up: no new turrets or upgrades past the basics.
  // And never spend the seed money: every empty tile needs planting.
  const saving = !siege && cost !== null && g.projectProblem() === 'Not enough credits.';
  // only a Buck short, with half the money saved: smoke one out rather than wait for the calendar
  const stage = PROJECT[g.project];
  if (stage && !siege && g.stats.bossesBeaten < stage.bucks && g.credits >= stage.cost / 2 && g.smokeProblem() === null &&
    g.credits - seedMoney() > SMOKE_BOMB + 300) g.place({ type: 'smoke' }, idx(CRATER.x, CRATER.y));
  const spare = (n: number) => g.credits - seedMoney() > n * (saving ? 3 : 1);
  // more land: one lot a morning, next to the farm and nearest the middle so it grows as a compact block,
  // and only with plenty to spare; then till it all
  const mid = (n: number) => Math.hypot((n % LOTS_X) - (LOTS_X - 1) / 2, Math.floor(n / LOTS_X) - (g.lots.length / LOTS_X - 1) / 2);
  if (!g.itemLock({ type: 'land' }) && spare(g.itemCost({ type: 'land' }) * 3)) {
    const next = g.lots.map((_, n) => n).filter((n) => !g.lots[n] && [n - 1, n + 1, n - LOTS_X, n + LOTS_X].some((m) => g.lots[m] &&
      Math.abs((m % LOTS_X) - (n % LOTS_X)) <= 1)).sort((a, b) => mid(a) - mid(b))[0];
    if (next !== undefined) g.buyLot(next);
  }
  for (const i of g.ownedTiles()) if (!g.tilled[i] && !g.tiles[i].structure && g.credits > 60) g.till(i);
  // a fixed pattern laid over the whole field, so it doesn't shift as the farm grows: a scarecrow and a
  // sprinkler in the middle, a turret in every 4x4 block, thumpers and beehives in the gaps, two dogs, traps on the edges
  const fx = (i: number) => tileX(i) - FARM_X0;
  const fy = (i: number) => tileY(i) - FARM_Y0;
  const count = (kind: string) => g.tiles.filter((t) => t.structure?.kind === kind).length;
  const middle = tiles.filter((i) => Math.abs(fx(i) - 7.5) < 1 && Math.abs(fy(i) - 5.5) < 1);
  if (spare(90)) put({ type: 'defense', kind: 'scarecrow' }, middle[0]);
  if (spare(110)) put({ type: 'defense', kind: 'sprinkler' }, middle[3]);
  const grid = tiles.filter((i) => fx(i) % 4 === 1 && fy(i) % 4 === 1);
  for (const i of grid) if (spare(160)) put({ type: 'defense', kind: 'turret' }, i);
  for (const i of [idx(r.x0, r.y0), idx(r.x1, r.y1)]) if (count('doghouse') < 2 && spare(260)) put({ type: 'defense', kind: 'doghouse' }, i);
  const gaps = tiles.filter((i) => fx(i) % 4 === 3 && fy(i) % 4 === 3);
  gaps.forEach((i, n) => { if (spare(200)) put({ type: 'defense', kind: n % 2 ? 'beehive' : 'thumper' }, i); });
  const edges = tiles.filter((i) => [i - 1, i + 1, i - COLS, i + COLS].some((j) => !g.owns(j)));
  for (const i of edges.filter((_, n) => n % 5 === 2)) if (count('trap') < tiles.length / 12 && spare(60)) put({ type: 'defense', kind: 'trap' }, i);
  // a mix of whatever's open, leaning toward what earns most a day at today's growing speed
  const open = CROP_ORDER.filter((k) => g.isUnlocked(k) && k !== 'radish');
  const perDay = (k: CropKind) => {
    const speed = g.growthToday(k);
    return (g.cropPrice(k) * fruitsPerDay(k, speed)) / ripenDays(k, speed);
  };
  const pick = (i: number): CropKind => {
    const ranked = [...open].sort((a, b) => perDay(b) - perDay(a));
    const top = ranked.slice(0, Math.min(4, ranked.length));
    return top[(tileX(i) * 3 + tileY(i)) % top.length];
  };
  for (const i of tiles) {
    const kind = pick(i);
    if (g.credits >= CROPS[kind].seedCost + 5) put({ type: 'crop', kind }, i);
    else if (g.credits >= CROPS.radish.seedCost) put({ type: 'crop', kind: 'radish' }, i);
  }
  // the arsenal: buy each weapon as it opens, then level them up, when the money's there
  for (const k of WEAPON_ORDER) {
    const price = g.weaponPrice(k);
    if (price !== null && g.weaponProblem(k) === null && spare(price * 2.5)) g.buyWeapon(k);
  }
  // the farm: soil and stall first, then the Seed Lab for the crops it grows most
  for (const u of FARM_ORDER) {
    const price = g.farmPrice(u);
    if (price !== null && g.farmProblem(u) === null && spare(price * 2)) g.buyFarm(u);
  }
  for (const k of ['carrot', 'corn', 'pumpkin', 'tomato', 'strawberry', 'watermelon'] as CropKind[]) {
    if (g.hybridProblem(k) === null && spare(600)) g.breed(k);
  }
  // spare money goes into upgrades, turrets first
  const rank = (i: number) => (g.tiles[i].structure?.kind === 'turret' ? 0 : 1);
  for (const i of [...tiles].sort((a, b) => rank(a) - rank(b))) {
    const s = g.tiles[i].structure;
    if (s && s.kind !== 'fence' && spare(400)) g.upgradeAt(i);
  }
}

