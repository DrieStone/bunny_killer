// Bunny brains: pick a crop, walk (or tunnel) to it, eat until full, run home.
import { BUNNIES, bunnySpeedScale, COLS, CROPS, DEFENSES, ROWS, WEATHER } from '../config';
import type { Game } from '../game';
import type { Bunny } from '../types';
import { exitDir, idx, isBorder, N, OBSTACLE, tileAt, tileX, tileY } from '../world';

const EDGE = 0.05;
const CHEW_REACH = 0.62; // how close to a wall's center a bunny stands to chew it

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
  let speed = def.speed * bunnySpeedScale(g.round) * WEATHER[g.weather].bunnySpeed * (b.wet > 0 ? 0.5 : 1);
  if (g.phase === 'sundown') {
    speed *= 1.5;
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
      const crop = b.target >= 0 ? g.tiles[b.target].crop : null;
      if (b.repath <= 0 || b.epoch !== g.pathEpoch || !crop || crop.hp <= 0) {
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
      const far = Math.hypot(tileX(b.target) + 0.5 - b.x, tileY(b.target) + 0.5 - b.y) > 0.7;
      if (!crop || crop.hp <= 0 || far) {
        b.state = 'seek';
        b.repath = 0;
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
          if (b.fed) g.roundStats.escapedFed++;
          else g.roundStats.escapedHungry++;
          g.emit({ t: 'escape', x: b.x, y: b.y, fed: b.fed });
        }
      }
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
}

/** Pick the most tempting reachable crop and plan a path to it. */
function chooseTarget(g: Game, b: Bunny): void {
  const def = BUNNIES[b.kind];
  const start = tileAt(b.x, b.y);
  const field = def.digger ? g.field.run(start, g.costDig, g.solidDig) : g.field.run(start, g.costWalk, g.solidWalk);
  b.epoch = g.pathEpoch;
  b.repath = 1.4 + g.rng() * 0.6;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < N; i++) {
    const c = g.tiles[i].crop;
    if (!c || c.hp <= 0) continue;
    const d = field.dist[i];
    if (d === Infinity) continue;
    const cd = CROPS[c.kind];
    const ripeness = Math.min(1, c.growth / cd.growTime);
    const want = cd.attract * (0.45 + 0.55 * ripeness);
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
  const def = BUNNIES[b.kind];
  const start = tileAt(b.x, b.y);
  b.epoch = g.pathEpoch;
  b.pathIdx = 0;
  if (isBorder(tileX(start), tileY(start))) {
    b.path = [];
    return;
  }
  const field = def.digger ? g.field.run(start, g.costDig, g.solidDig) : g.field.run(start, g.costWalk, g.solidWalk);
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
  const wall = !BUNNIES[b.kind].digger && s !== null && DEFENSES[s.kind].blocks;
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
  if (BUNNIES[b.kind].digger) return true;
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
