// Defenses, dogs, and turret pebbles.
import { BUNNIES, COLS, COMBOS, defenseStats, DOG_SPEED, PEBBLE_SPEED, PERKS, ROWS, SPRINKLER_PUSH } from '../config';
import type { Game } from '../game';
import type { Bunny } from '../types';
import { N, tileX, tileY } from '../world';
import { knockBack, spook } from './bunnies';

export function updateDefenses(g: Game, dt: number): void {
  const live = g.phase === 'round' || g.phase === 'sundown';
  for (let i = 0; i < N; i++) {
    const s = g.tiles[i].structure;
    if (!s) continue;
    s.anim += dt;
    if (s.cd > 0) s.cd -= dt;
    if (!live || s.cd > 0) continue;
    const def = defenseStats(s.kind, s.level);
    const cx = tileX(i) + 0.5;
    const cy = tileY(i) + 0.5;
    switch (s.kind) {
      case 'trap': {
        const victim = g.bunnies.find(
          (b) => !b.dead && !prize(b) && g.isSurfaced(b) && b.state !== 'exit' && Math.hypot(b.x - cx, b.y - cy) <= def.radius,
        );
        if (victim) {
          g.damageBunny(victim, def.damage, 'trap');
          // bait: a Carrot Decoy close by keeps the trade brisk, so the trap re-arms faster
          const bait = near(i, COMBOS.baitRange, (j) => g.tiles[j].structure?.kind === 'decoy');
          s.cd = def.period / (bait ? COMBOS.bait : 1);
          s.anim = 0;
          g.emit({ t: 'snap', x: cx, y: cy });
          if (bait) g.emit({ t: 'combo', x: cx, y: cy });
        }
        break;
      }
      case 'scarecrow': {
        let scared = 0;
        const bossToo = s.level >= PERKS.scarecrow!.level;
        let soggy = false;
        for (const b of g.bunnies) {
          if (!scareable(g, b, bossToo) || Math.hypot(b.x - cx, b.y - cy) > def.radius) continue;
          // soggy scare: a bunny the sprinkler already soaked runs twice as long
          spook(b, cx, cy, def.duration * (b.wet > 0 ? COMBOS.soggy : 1));
          if (b.wet > 0) soggy = true;
          scared++;
        }
        if (soggy) g.emit({ t: 'combo', x: cx, y: cy });
        if (scared > 0) {
          s.cd = def.period;
          s.anim = 0;
          g.emit({ t: 'scare', x: cx, y: cy, r: def.radius });
        }
        break;
      }
      case 'sprinkler': {
        let soaked = 0;
        const floods = s.level >= PERKS.sprinkler!.level;
        for (const b of g.bunnies) {
          if (b.dead || BUNNIES[b.kind].boss || prize(b) || b.state === 'exit') continue;
          if (Math.hypot(b.x - cx, b.y - cy) > def.radius) continue;
          if (!g.isSurfaced(b)) {
            // a flooded tunnel sends a Burrower scrambling up
            if (floods) {
              g.pop(b, def.duration * 0.6);
              soaked++;
            }
            continue;
          }
          knockBack(b, cx, cy, SPRINKLER_PUSH);
          b.wet = def.duration;
          soaked++;
        }
        if (soaked > 0) {
          s.cd = def.period;
          s.anim = 0;
          g.emit({ t: 'spray', x: cx, y: cy, r: def.radius });
        }
        break;
      }
      case 'turret': {
        const target = nearest(g, cx, cy, def.radius);
        if (target) {
          const shoot = (b: Bunny) => g.projectiles.push({
            x: cx, y: cy - 0.7, tx: b.x, ty: b.y - 0.3, target: b.id, damage: def.damage, done: false,
          });
          shoot(target);
          if (s.level >= PERKS.turret!.level) {
            // the top-level turret fires a second pebble at a second bunny
            const other = nearest(g, cx, cy, def.radius, target);
            if (other) shoot(other);
          }
          s.cd = def.period;
          s.anim = 0;
          g.emit({ t: 'shoot', x: cx, y: cy });
        }
        break;
      }
      case 'thumper': {
        // only thumps when there's a Burrower underground nearby to knock loose
        let found = false;
        for (const b of g.bunnies) {
          if (b.dead || g.isSurfaced(b) || Math.hypot(b.x - cx, b.y - cy) > def.radius) continue;
          g.pop(b, def.duration);
          found = true;
        }
        if (found) {
          s.cd = def.period;
          s.anim = 0;
          g.emit({ t: 'thump', x: cx, y: cy, r: def.radius });
        }
        break;
      }
      case 'beehive': {
        const target = nearest(g, cx, cy, def.radius);
        if (target) {
          g.damageBunny(target, def.damage, 'bee');
          if (!target.dead && scareable(g, target, false)) spook(target, cx, cy, def.duration);
          // pollination: a sunflower in range keeps the hive busy
          const pollen = near(i, def.radius, (j) => g.tiles[j].crop?.kind === 'sunflower');
          s.cd = def.period / (pollen ? COMBOS.pollen : 1);
          s.anim = 0;
          g.emit({ t: 'sting', x: target.x, y: target.y });
          if (pollen && g.rng() < 0.3) g.emit({ t: 'combo', x: cx, y: cy });
        }
        break;
      }
      default:
        break;
    }
  }
  if (live) {
    updateDogs(g, dt);
    updateProjectiles(g, dt);
  }
}

/** A golden bunny is the player's to catch: no defense touches it. */
const prize = (b: Bunny) => !!BUNNIES[b.kind].golden;

/** Is there a tile within `r` of tile `i` that passes `test`? */
export function near(i: number, r: number, test: (j: number) => boolean): boolean {
  const x = tileX(i);
  const y = tileY(i);
  const k = Math.ceil(r);
  for (let dy = -k; dy <= k; dy++) {
    for (let dx = -k; dx <= k; dx++) {
      if ((dx === 0 && dy === 0) || Math.hypot(dx, dy) > r) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (test(ny * COLS + nx)) return true;
    }
  }
  return false;
}

function scareable(g: Game, b: Bunny, bossToo: boolean): boolean {
  if (b.dead || prize(b) || !g.isSurfaced(b) || (BUNNIES[b.kind].boss && !bossToo)) return false;
  return b.state === 'seek' || b.state === 'eat' || (b.state === 'chew' && b.resume === 'seek');
}

function nearest(g: Game, x: number, y: number, r: number, not: Bunny | null = null): Bunny | null {
  let best: Bunny | null = null;
  let bestD = r;
  for (const b of g.bunnies) {
    if (b.dead || b === not || prize(b) || !g.isSurfaced(b)) continue;
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

function updateDogs(g: Game, dt: number): void {
  for (const d of g.dogs) {
    const house = g.tiles[d.home].structure;
    const def = defenseStats('doghouse', house?.level ?? 1);
    d.cd = Math.max(0, d.cd - dt);
    const hx = tileX(d.home) + 0.5;
    const hy = tileY(d.home) + 1.05;
    let target = d.target >= 0 ? g.bunnies.find((b) => b.id === d.target) : undefined;
    // watchdog: anything chewing on your defenses in reach comes first
    const chewer = g.bunnies.find((b) => !b.dead && b.state === 'chew' && !prize(b) && Math.hypot(b.x - hx, b.y - hy) <= def.radius);
    if (chewer && target?.state !== 'chew') target = chewer;
    if (!target || target.dead || !g.isSurfaced(target) || Math.hypot(target.x - hx, target.y - hy) > def.radius) {
      target = nearest(g, hx, hy, def.radius) ?? undefined;
    }
    d.target = target ? target.id : -1;
    const gx = target ? target.x : hx;
    const gy = target ? target.y : hy;
    const dx = gx - d.x;
    const dy = gy - d.y;
    const dist = Math.hypot(dx, dy);
    d.moving = dist > 0.3;
    if (d.moving) {
      const step = Math.min(dist, DOG_SPEED * dt);
      d.x += (dx / dist) * step;
      d.y += (dy / dist) * step;
      // the leash
      const lx = d.x - hx;
      const ly = d.y - hy;
      const ld = Math.hypot(lx, ly);
      if (ld > def.radius) {
        d.x = hx + (lx / ld) * def.radius;
        d.y = hy + (ly / ld) * def.radius;
      }
      if (Math.abs(dx) > 0.05) d.facing = dx > 0 ? 1 : -1;
      d.run += dt;
    }
    if (target && dist <= 0.55 && d.cd <= 0) {
      const watch = target.state === 'chew';
      g.damageBunny(target, def.damage + (watch ? COMBOS.watchdog : 0), 'dog');
      if (watch) g.emit({ t: 'combo', x: d.x, y: d.y });
      d.cd = def.period;
      g.emit({ t: 'bite', x: d.x, y: d.y });
    }
  }
}

function updateProjectiles(g: Game, dt: number): void {
  for (const p of g.projectiles) {
    const t = g.bunnies.find((b) => b.id === p.target);
    const alive = t && !t.dead && g.isSurfaced(t);
    if (alive) {
      p.tx = t.x;
      p.ty = t.y - 0.3;
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = PEBBLE_SPEED * dt;
    if (d <= step + 0.05) {
      if (alive && !g.dodges(t)) {
        // dazed: a Burrower knocked up out of its tunnel is a sitting target
        const dazed = BUNNIES[t.kind].digger && t.popped > 0;
        g.damageBunny(t, p.damage * (dazed ? COMBOS.dazed : 1));
        if (dazed) g.emit({ t: 'combo', x: t.x, y: t.y });
      }
      p.done = true;
    } else {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
    }
  }
  g.projectiles = g.projectiles.filter((p) => !p.done);
}
