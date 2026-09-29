// Bunny brains: pick a crop, walk (or tunnel) to it, eat until full, run home.
import { BUNNIES, bunnySpeedScale, COLS, CROPS, DEFENSES, defenseStats, PEEK, QUEEN_BROOD_MAX, ROWS, WEATHER } from '../config';
import type { Game } from '../game';
import type { Bunny } from '../types';
import { exitDir, idx, isBorder, N, OBSTACLE, tileAt, tileX, tileY } from '../world';

const EDGE = 0.05;
const CHEW_REACH = 0.62; // how close to a wall's center a bunny stands to chew it
const DECOY_APPEAL = 2.8; // how tempting a Carrot Decoy is, next to a real crop's appeal

/** What a bunny could eat on a tile: a crop, or a Carrot Decoy. */
function food(g: Game, i: number): { hp: number; decoy: boolean } | null {
  if (i < 0) return null;
  const t = g.tiles[i];
  if (t.crop) return { hp: t.crop.hp, decoy: false };
  if (t.structure?.kind === 'decoy') return { hp: t.structure.hp, decoy: true };
  return null;
}

/** Walls and fences don't stop a bunny that tunnels under them or jumps over them. */
const ignoresWalls = (b: Bunny) => BUNNIES[b.kind].digger || !!BUNNIES[b.kind].leaps;

export function updateBunnies(g: Game, dt: number): void {
  g.targetCount.fill(0);
  for (const b of g.bunnies) {
    if (b.target >= 0 && (b.state === 'seek' || b.state === 'eat')) g.targetCount[b.target]++;
  }
  for (const b of g.bunnies) if (!b.dead && !b.gone) updateBunny(g, b, dt);
  if (g.bunnies.some((b) => b.dead || b.gone)) g.bunnies = g.bunnies.filter((b) => !b.dead && !b.gone);
}

function updateBunny(g: Game, b: Bunny, dt: number): void {
  const def = BUNNIES[b.kind];
  b.flash = Math.max(0, b.flash - dt);
  b.wet = Math.max(0, b.wet - dt);
  b.moving = false;
  const weather = def.winter ? Math.max(1, WEATHER[g.weather].bunnySpeed) : WEATHER[g.weather].bunnySpeed;
  let speed = def.speed * bunnySpeedScale(g.round) * weather * (b.wet > 0 ? 0.5 : 1);
  // hail: everybody hunkers down where they are (a Buck doesn't care, and nothing stops a golden bunny)
  if (g.hail > 0 && !def.boss && !def.golden && b.state !== 'exit' && b.state !== 'dash') return;
  if (def.digger && digUp(g, b, dt)) return; // up out of its tunnel, looking around
  // sundown sends everybody home; so does the noon bell, except a Buck or a golden bunny
  if (g.phase === 'sundown' || (g.belling > 0 && !def.boss && !def.golden)) {
    if (g.phase === 'sundown') speed *= 1.5;
    if (b.state === 'chew') b.resume = 'flee';
    else if (b.state === 'seek' || b.state === 'eat' || b.state === 'spooked' || b.state === 'wander') startFlee(g, b);
  }

  if (b.kx !== 0 || b.ky !== 0) {
    tryMove(g, b, b.kx * dt, b.ky * dt);
    const decay = Math.exp(-7 * dt);
    b.kx *= decay;
    b.ky *= decay;
    if (Math.abs(b.kx) + Math.abs(b.ky) < 0.15) {
      b.kx = 0;
      b.ky = 0;
    }
  }

  switch (b.state) {
    case 'seek': {
      b.repath -= dt;
      const meal = food(g, b.target);
      if (b.repath <= 0 || b.epoch !== g.pathEpoch || !meal || meal.hp <= 0) {
        chooseTarget(g, b);
        if (b.state !== 'seek') break;
      }
      if (followPath(g, b, speed, dt)) {
        b.state = 'eat';
        b.tick = 0;
        if (def.digger) g.emit({ t: 'dig', x: b.x, y: b.y });
      }
      break;
    }
    case 'eat': {
      const crop = b.target >= 0 ? g.tiles[b.target].crop : null;
      const decoy = !crop && b.target >= 0 && g.tiles[b.target].structure?.kind === 'decoy' ? g.tiles[b.target].structure : null;
      const far = Math.hypot(tileX(b.target) + 0.5 - b.x, tileY(b.target) + 0.5 - b.y) > 0.7;
      if (((!crop || crop.hp <= 0) && (!decoy || decoy.hp <= 0)) || far) {
        b.state = 'seek';
        b.repath = 0;
        break;
      }
      if (decoy) {
        // gnawing on painted wood: it wears the decoy down, but nobody gets fed
        const bite = Math.min(def.biteRate * dt, decoy.hp);
        decoy.hp -= bite;
        decoy.shake = 0.1;
        b.eaten += bite;
        b.facing = tileX(b.target) + 0.5 >= b.x ? 1 : -1;
        if (decoy.hp <= 0.001) g.destroyStructure(b.target);
        if (b.eaten >= def.appetite) startFlee(g, b);
        break;
      }
      if (!crop) break;
      if (def.thief) {
        // a Bandit doesn't nibble: it pulls up the whole plant and runs
        b.carry = { crop: { ...crop, shake: 0, fresh: false }, from: b.target };
        g.tiles[b.target].crop = null;
        b.fed = true;
        g.emit({ t: 'steal', x: b.x, y: b.y, kind: crop.kind });
        startFlee(g, b);
        break;
      }
      const bite = Math.min(def.biteRate * dt, crop.hp);
      crop.hp -= bite;
      crop.shake = 0.1;
      b.eaten += bite;
      b.fed = true;
      b.facing = tileX(b.target) + 0.5 + b.ox >= b.x ? 1 : -1;
      b.tick -= dt;
      if (b.tick <= 0) {
        g.emit({ t: 'chomp', x: b.x, y: b.y });
        b.tick = 0.55;
      }
      if (crop.hp <= 0.001) g.destroyCrop(b.target);
      if (b.eaten >= def.appetite) startFlee(g, b);
      break;
    }
    case 'chew': {
      const s = g.tiles[b.chewTile].structure;
      const cx = tileX(b.chewTile) + 0.5;
      const cy = tileY(b.chewTile) + 0.5;
      if (!s || !DEFENSES[s.kind].blocks || Math.hypot(cx - b.x, cy - b.y) > 1.3) {
        b.state = b.resume;
        b.repath = 0;
        break;
      }
      s.hp -= def.chewRate * dt;
      s.shake = 0.1;
      b.facing = cx >= b.x ? 1 : -1;
      const shock = defenseStats(s.kind, s.level).shock;
      if (shock > 0) {
        g.damageBunny(b, shock * dt, 'shock');
        if (g.rng() < dt * 3) g.emit({ t: 'zap', x: (cx + b.x) / 2, y: (cy + b.y) / 2 });
        if (b.dead) break;
      }
      b.tick -= dt;
      if (b.tick <= 0) {
        g.emit({ t: 'chew', x: (cx + b.x) / 2, y: (cy + b.y) / 2 });
        b.tick = 0.35;
      }
      if (s.hp <= 0) g.destroyStructure(b.chewTile);
      else if (b.epoch !== g.pathEpoch) {
        // something changed elsewhere; maybe there's an easier way now
        b.state = b.resume;
        b.repath = 0;
      }
      break;
    }
    case 'spooked': {
      b.timer -= dt;
      let dx = b.x - b.sx;
      let dy = b.y - b.sy;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      tryMove(g, b, dx * speed * 1.25 * dt, dy * speed * 1.25 * dt);
      b.moving = true;
      if (Math.abs(dx) > 0.1) b.facing = dx > 0 ? 1 : -1;
      if (b.timer <= 0) {
        b.state = 'seek';
        b.repath = 0;
      }
      break;
    }
    case 'flee': {
      if (b.epoch !== g.pathEpoch) planFlee(g, b);
      if (followPath(g, b, speed, dt)) {
        const t = tileAt(b.x, b.y);
        [b.ex, b.ey] = exitDir(tileX(t), tileY(t));
        b.state = 'exit';
      }
      break;
    }
    case 'exit': {
      b.x += b.ex * speed * dt;
      b.y += b.ey * speed * dt;
      b.moving = true;
      if (b.ex !== 0) b.facing = b.ex > 0 ? 1 : -1;
      if (b.x < -0.7 || b.y < -0.7 || b.x > COLS + 0.7 || b.y > ROWS + 0.7) {
        b.gone = true;
        if (g.phase === 'round' || g.phase === 'sundown') {
          g.escaped(b);
          g.emit({ t: 'escape', x: b.x, y: b.y, fed: b.fed });
        }
      }
      break;
    }
    case 'dash': {
      // a golden bunny: straight across, zig-zagging, over everything, and it never stops to eat
      b.timer += dt;
      const dx = b.sx - b.x;
      const dy = b.sy - b.y;
      const d = Math.hypot(dx, dy);
      const step = def.speed * dt;
      if (d <= step) {
        b.gone = true;
        break;
      }
      const wiggle = Math.cos(b.timer * 9) * 1.8 * dt;
      b.x += (dx / d) * step - (dy / d) * wiggle;
      b.y += (dy / d) * step + (dx / d) * wiggle;
      b.moving = true;
      if (Math.abs(dx) > 0.1) b.facing = dx > 0 ? 1 : -1;
      break;
    }
    case 'wander': {
      b.timer -= dt;
      if (b.timer <= 0) {
        b.sx = Math.min(COLS - 1, Math.max(1, b.x + (g.rng() - 0.5) * 6));
        b.sy = Math.min(ROWS - 1, Math.max(1, b.y + (g.rng() - 0.5) * 4));
        b.timer = 1.5 + g.rng() * 3;
      }
      const dx = b.sx - b.x;
      const dy = b.sy - b.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.1 && b.timer > 0.8) {
        tryMove(g, b, (dx / d) * speed * 0.6 * dt, (dy / d) * speed * 0.6 * dt);
        b.moving = true;
        if (Math.abs(dx) > 0.05) b.facing = dx > 0 ? 1 : -1;
      }
      break;
    }
  }
  if (b.moving) b.hop += dt * (1.4 + speed * 0.9);
  if (def.brood && g.phase === 'round') layBrood(g, b, def.brood, dt);
}

/**
 * A Burrower underground pokes its head up every few seconds to sniff the air, and anything that knocks it
 * out of the ground (a thumper, a splash, a shot at its mound) leaves it up and dazed for a moment.
 * Returns true while it's up and standing still.
 */
function digUp(g: Game, b: Bunny, dt: number): boolean {
  if (b.popped > 0) {
    b.popped = Math.max(0, b.popped - dt);
    return b.state === 'seek' || b.state === 'flee' || b.state === 'exit';
  }
  if (b.state === 'seek' && g.phase === 'round') {
    b.peek -= dt;
    if (b.peek <= 0) {
      b.peek = PEEK.every + g.rng() * PEEK.jitter;
      b.popped = PEEK.stay;
    }
  }
  return false;
}

/** The Bunny Queen sends a Burrower down into the ground every few seconds while she's out foraging. */
function layBrood(g: Game, b: Bunny, every: number, dt: number): void {
  if (b.broodCount >= QUEEN_BROOD_MAX || (b.state !== 'seek' && b.state !== 'eat' && b.state !== 'chew')) return;
  b.brood += dt;
  if (b.brood < every) return;
  b.brood = 0;
  b.broodCount++;
  g.spawnAt('digger', b.x, b.y);
  g.emit({ t: 'brood', x: b.x, y: b.y });
}

/** A ninja's dodge: a quick hop to one side. */
export function sidestep(g: Game, b: Bunny): void {
  tryMove(g, b, 0, g.rng() < 0.5 ? -0.45 : 0.45);
}

/** Pick the most tempting reachable crop and plan a path to it. */
function chooseTarget(g: Game, b: Bunny): void {
  const def = BUNNIES[b.kind];
  const start = tileAt(b.x, b.y);
  const field = ignoresWalls(b) ? g.field.run(start, g.costDig, g.solidDig) : g.field.run(start, g.costWalk, g.solidWalk);
  b.epoch = g.pathEpoch;
  b.repath = 1.4 + g.rng() * 0.6;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < N; i++) {
    const c = g.tiles[i].crop;
    const s = g.tiles[i].structure;
    let want: number;
    if (c && c.hp > 0) {
      const cd = CROPS[c.kind];
      const ripeness = Math.min(1, c.growth / cd.growTime);
      // a Bandit only really wants something ready to carry off
      want = def.thief ? cd.attract * (ripeness >= 1 ? 3 : 0.1 + ripeness * 0.3) : cd.attract * (0.45 + 0.55 * ripeness);
    } else if (s?.kind === 'decoy' && s.hp > 0 && !def.thief && !def.boss) {
      // a decoy only pulls in bunnies close enough to see it
      if (Math.hypot(tileX(i) + 0.5 - b.x, tileY(i) + 0.5 - b.y) > defenseStats('decoy', s.level).radius) continue;
      want = DECOY_APPEAL;
    } else continue;
    const d = field.dist[i];
    if (d === Infinity) continue;
    const mine = b.target === i;
    const crowd = g.targetCount[i] - (mine ? 1 : 0);
    const score = (d + 2) / want + crowd * 3 + g.rng() * 2 - (mine ? 1.5 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) {
    if (b.target >= 0 && g.targetCount[b.target] > 0) g.targetCount[b.target]--;
    startFlee(g, b);
    return;
  }
  if (b.target !== best) {
    if (b.target >= 0 && g.targetCount[b.target] > 0) g.targetCount[b.target]--;
    g.targetCount[best]++;
  }
  b.target = best;
  b.path = field.pathTo(best);
  b.pathIdx = 0;
}

export function startFlee(g: Game, b: Bunny): void {
  b.state = 'flee';
  b.target = -1;
  planFlee(g, b);
}

/** Head for the nearest burrow, or any map edge if that's much closer. */
function planFlee(g: Game, b: Bunny): void {
  const start = tileAt(b.x, b.y);
  b.epoch = g.pathEpoch;
  b.pathIdx = 0;
  if (isBorder(tileX(start), tileY(start))) {
    b.path = [];
    return;
  }
  const field = ignoresWalls(b) ? g.field.run(start, g.costDig, g.solidDig) : g.field.run(start, g.costWalk, g.solidWalk);
  let best = -1;
  let bestD = Infinity;
  const consider = (i: number, penalty: number) => {
    const d = field.dist[i] + penalty;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  };
  for (const h of g.burrows) consider(idx(h.x, h.y), 0);
  for (let x = 0; x < COLS; x++) {
    consider(idx(x, 0), 5);
    consider(idx(x, ROWS - 1), 5);
  }
  for (let y = 1; y < ROWS - 1; y++) {
    consider(idx(0, y), 5);
    consider(idx(COLS - 1, y), 5);
  }
  b.path = best >= 0 ? field.pathTo(best) : [];
}

/**
 * Walk toward the next waypoint. Returns true once the path is used up.
 * A wall in the way switches the bunny to chewing it.
 */
function followPath(g: Game, b: Bunny, speed: number, dt: number): boolean {
  if (b.pathIdx >= b.path.length) return true;
  const next = b.path[b.pathIdx];
  const nx = tileX(next) + 0.5;
  const ny = tileY(next) + 0.5;
  const dx = nx - b.x;
  const dy = ny - b.y;
  const d = Math.hypot(dx, dy);
  if (Math.abs(dx) > 0.02) b.facing = dx > 0 ? 1 : -1;
  const s = g.tiles[next].structure;
  const wall = !ignoresWalls(b) && s !== null && DEFENSES[s.kind].blocks;
  const step = speed * dt;
  if (wall) {
    if (d > CHEW_REACH) {
      const move = Math.min(step, d - CHEW_REACH);
      tryMove(g, b, (dx / d) * move, (dy / d) * move);
      b.moving = true;
    }
    if (d - step <= CHEW_REACH) {
      b.resume = b.state;
      b.state = 'chew';
      b.chewTile = next;
      b.tick = 0;
    }
    return false;
  }
  if (d <= step) {
    b.x = nx;
    b.y = ny;
    b.pathIdx++;
    b.moving = true;
    return b.pathIdx >= b.path.length;
  }
  const ox = b.x;
  const oy = b.y;
  tryMove(g, b, (dx / d) * step, (dy / d) * step);
  b.moving = true;
  if (ox === b.x && oy === b.y) b.repath = Math.min(b.repath, 0.2); // wedged; replan soon
  return false;
}

function canStand(g: Game, b: Bunny, x: number, y: number, from: number): boolean {
  if (x < EDGE || y < EDGE || x > COLS - EDGE || y > ROWS - EDGE) return false;
  const i = idx(Math.floor(x), Math.floor(y));
  if (i === from) return true;
  if (OBSTACLE[i]) return false;
  if (ignoresWalls(b)) return true;
  const s = g.tiles[i].structure;
  return !(s && DEFENSES[s.kind].blocks);
}

/** Move with wall collision, sliding along whichever axis is free. */
function tryMove(g: Game, b: Bunny, dx: number, dy: number): void {
  const from = tileAt(b.x, b.y);
  if (canStand(g, b, b.x + dx, b.y + dy, from)) {
    b.x += dx;
    b.y += dy;
    return;
  }
  if (canStand(g, b, b.x + dx, b.y, from)) b.x += dx;
  else if (canStand(g, b, b.x, b.y + dy, from)) b.y += dy;
}

/** Knock a bunny off its dinner (sprinkler). */
export function knockBack(b: Bunny, fromX: number, fromY: number, force: number): void {
  let dx = b.x - fromX;
  let dy = b.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  b.kx = dx * force;
  b.ky = dy * force;
  if (b.state === 'chew') b.state = b.resume;
  else if (b.state === 'eat') b.state = 'seek';
  b.repath = Math.min(b.repath, 0.35);
  if (b.state === 'flee') b.epoch = -1; // replan the escape from wherever it lands
}

/** Send a bunny running from a scare (scarecrow). */
export function spook(b: Bunny, fromX: number, fromY: number, seconds: number): void {
  b.state = 'spooked';
  b.timer = seconds;
  b.sx = fromX;
  b.sy = fromY;
}
