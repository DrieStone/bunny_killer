// Boot, main loop, and input. The rules live in game.ts; this file just wires things up.
import { Sfx } from './audio';
import { Classic, type ClassicEvent } from './classic';
import { Music, type Song } from './music';
import { type Mode, TILE, unlockName, WEAPON_ORDER, WEAPONS, WORLD_H, WORLD_W } from './config';
import { FARMS, type MapKind } from './world';
import { Game } from './game';
import { Renderer, type View } from './render/renderer';
import { loadSprites } from './render/sprites';
import * as store from './save';
import type { Phase, ShopItem } from './types';
import { Balloons, Tutorial } from './ui/balloons';
import { HOTKEYS, UI, type UiHooks } from './ui/ui';
import { tileAt } from './world';

const STEP = 1 / 60;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game();
const renderer = new Renderer(canvas);
const sfx = new Sfx();
const music = new Music();
const settings = store.loadSettings();
sfx.muted = settings.muted;
music.setMuted(settings.musicMuted);

/** Audio may only start after a click or key; this also brings the music in. */
function unlockAudio(): void {
  sfx.unlock();
  const ctx = sfx.context;
  if (ctx) music.attach(ctx, ctx.destination);
}

const view: View = { mouseX: 0, mouseY: 0, mouseIn: false, hoverTile: -1, selected: null };
let paused = false;
let speed = 1; // the player's pick: 1, 2, or 4
let skipping = false; // "skip to sundown" runs the rest of the day at 8x
let classic: Classic | null = null;
let classicResultsShown = false;
const balloons = new Balloons(); // Help > Show Balloons
const tutorial = new Tutorial(new Balloons(), canvas); // its own balloon, so the two never fight

function persist(): void {
  if (game.phase === 'planning') store.writeSave(game.toSave());
}

function freshStart(): void {
  renderer.reset();
  ui.closeModal();
  ui.select(null);
  paused = false;
  speed = 1;
  skipping = false;
}

const hooks: UiHooks = {
  newGame(mode: Mode = 'normal', map: MapKind = 'home') {
    store.clearSave();
    game.newGame(undefined, mode, map);
    freshStart();
    persist();
    settings.lastFarm = map;
    store.saveSettings(settings);
    ui.banner(mode === 'hard' ? 'Day 1 · Hard Mode' : 'Day 1', `${FARMS[map].name} · plant some seeds, then start the day`);
  },
  lastFarm: () => settings.lastFarm,
  hardOpen: store.hardModeOpen,
  continueGame() {
    const save = store.loadSave();
    if (!save) return hooks.newGame();
    game.loadSave(save);
    freshStart();
    if (game.phase === 'gameover') return;
    ui.banner(`Day ${game.round}`, 'Welcome back to the farm');
  },
  toTitle() {
    persist();
    game.setupAttract();
    freshStart();
    ui.showTitle();
  },
  startDay() {
    if (game.phase !== 'planning') return;
    if (game.cropCount() === 0) {
      ui.toast('Plant something first!');
      sfx.play('error');
      return;
    }
    ui.select(null);
    game.startRound();
    store.writeSave(game.toSave()); // quitting mid-day replays the day from here
    if (game.lastNight) ui.banner('The Last Night', 'Bonk every Asteroid Buck before dawn', 2.4);
    else ui.banner(`Day ${game.round}`, 'Here they come!', 1.3);
  },
  nextDay() {
    game.continueAfterSummary();
    ui.closeModal();
    if (game.phase === 'planning') {
      persist();
      const fresh = game.newUnlocks.map(unlockName);
      const sub = fresh.length ? `New at the store: ${fresh.join(', ')}` : game.isBossDay() ? 'The crater is glowing…' : 'A new morning';
      ui.banner(`Day ${game.round}`, sub, fresh.length ? 2.6 : 1.6);
    }
  },
  togglePause() {
    if (!classic && game.phase !== 'round' && game.phase !== 'sundown') return;
    if (classic?.done) return;
    paused = !paused;
    if (paused) ui.showPause();
    else ui.closeModal();
  },
  toggleSpeed() {
    speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
  },
  skipDay() {
    // nothing left to fight: let the crops finish growing in a hurry
    if (game.allClear()) skipping = true;
  },
  autoSkip: () => settings.autoSkip,
  setAutoSkip(on: boolean) {
    settings.autoSkip = on;
    store.saveSettings(settings);
  },
  toggleMute() {
    sfx.muted = !sfx.muted;
    settings.muted = sfx.muted;
    store.saveSettings(settings);
    unlockAudio();
  },
  toggleMusic() {
    music.setMuted(!music.muted);
    settings.musicMuted = music.muted;
    store.saveSettings(settings);
    unlockAudio();
  },
  musicMuted: () => music.muted,
  changed: persist,
  hasSave: () => store.loadSave() !== null,
  best: store.loadBest,
  paused: () => paused,
  speed: () => (skipping ? 8 : speed),
  muted: () => sfx.muted,
  unlockAudio,
  toggleBalloons() {
    balloons.helpMode = !balloons.helpMode;
    if (!balloons.helpMode) balloons.hide();
  },
  balloonsOn: () => balloons.helpMode,
  retire() {
    ui.closeModal();
    game.retire(); // the phase watcher records the score and shows the farewell
  },
  scores: store.loadScores,
  startClassic() {
    classic = new Classic();
    classicResultsShown = false;
    ui.classic = classic;
    ui.closeModal();
    renderer.reset();
    paused = false;
    canvas.classList.add('aiming');
    unlockAudio();
  },
  quitClassic() {
    classic = null;
    ui.classic = null;
    canvas.classList.remove('aiming');
    hooks.toTitle();
  },
  classicBest: store.loadClassicBest,
  replayTutorial() {
    tutorial.restart();
    ui.toast('Tutorial tips are back on. Start a new game to see them all.');
  },
};

await loadSprites();
const ui = new UI(game, hooks);

// ---------------------------------------------------------------- phases

function onPhase(from: Phase, to: Phase): void {
  canvas.classList.toggle('aiming', to === 'round' || to === 'sundown');
  firing = false;
  if (to !== 'round' && to !== 'sundown') skipping = false; // a skip runs through sundown, then the harvest goes at your speed
  if (to !== 'round' && to !== 'sundown') paused = false;
  if (to === 'sundown') {
    if (game.lastNight) ui.banner('Dawn!', game.roundStats.bucks >= game.lastNightBucks ? 'Every Buck is down' : 'The Bucks are making a run for it');
    else ui.banner('Sundown!', 'The bunnies are heading home');
  }
  if (to === 'harvest') ui.banner('Harvest!', '', 1.1);
  if (to === 'summary') {
    store.recordBest(game.stats.harvest, game.round);
    ui.showSummary();
  }
  if (to === 'gameover' || to === 'victory') {
    const won = to === 'victory';
    const days = won ? game.round : game.round - 1;
    store.clearSave();
    store.recordBest(game.stats.harvest, days);
    const rank = store.addScore({
      score: game.stats.harvest, days, kills: game.stats.kills, bosses: game.stats.bossesBeaten,
      date: new Date().toISOString().slice(0, 10), retired: game.retired, sealed: won, hard: game.mode === 'hard',
    });
    if (won) store.openHardMode();
    if (won) ui.showVictory(rank);
    else ui.showGameOver(rank);
  }
  if (from === 'title' && to === 'planning') canvas.focus();
}

// ---------------------------------------------------------------- input

let painting = false;
let lastPainted = -1;
let firing = false; // the button is held down during the day (the pellet gun and hose keep going)

function toWorld(e: PointerEvent): void {
  const r = canvas.getBoundingClientRect();
  view.mouseX = ((e.clientX - r.left) / r.width) * WORLD_W;
  view.mouseY = ((e.clientY - r.top) / r.height) * WORLD_H;
  view.mouseIn = view.mouseX >= 0 && view.mouseY >= 0 && view.mouseX < WORLD_W && view.mouseY < WORLD_H;
  view.hoverTile = view.mouseIn ? tileAt(view.mouseX / TILE, view.mouseY / TILE) : -1;
  ui.hoverTile = view.hoverTile;
}

/** Crops, fences, and the shovel paint along a drag; everything else is one per click. */
const paintable = (item: ShopItem) => item.type === 'crop' || item.type === 'remove' || item.type === 'till' ||
  item.type === 'land' || (item.type === 'defense' && item.kind === 'fence');

function placeAtHover(first: boolean): void {
  const item = ui.selected;
  const i = view.hoverTile;
  if (!item || i < 0 || i === lastPainted) return;
  if (!first && game.placeProblem(item, i)) return; // don't nag while dragging
  lastPainted = i;
  if (game.place(item, i)) persist();
}

canvas.addEventListener('pointermove', (e) => {
  toWorld(e);
  if (painting && ui.selected && paintable(ui.selected)) placeAtHover(false);
});

canvas.addEventListener('pointerleave', () => {
  view.mouseIn = false;
  view.hoverTile = -1;
  ui.hoverTile = -1;
});

canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  toWorld(e);
  if (ui.modalOpen) return;
  if (classic) {
    if (e.button === 0 && !paused) classic.fire(view.mouseX / TILE, view.mouseY / TILE);
    return;
  }
  if (game.phase === 'round' || game.phase === 'sundown') {
    if (e.button === 0 && !paused) {
      game.fire(view.mouseX / TILE, view.mouseY / TILE);
      firing = true;
      canvas.setPointerCapture(e.pointerId);
    }
    return;
  }
  if (game.phase !== 'planning' || view.hoverTile < 0) return;
  if (e.button === 2) {
    if (game.removeAt(view.hoverTile)) persist();
    return;
  }
  if (e.button !== 0) return;
  if (!ui.selected) {
    // clicking something you own picks up that kind of item, handy for building rows
    const t = game.tiles[view.hoverTile];
    if (t.crop) ui.pick({ type: 'crop', kind: t.crop.kind });
    else if (t.structure) ui.pick({ type: 'defense', kind: t.structure.kind });
    return;
  }
  painting = true;
  lastPainted = -1;
  canvas.setPointerCapture(e.pointerId);
  placeAtHover(true);
});

canvas.addEventListener('pointerup', () => {
  painting = false;
  lastPainted = -1;
  firing = false;
  game.stopHose();
});

// the mouse wheel flips through the weapons you own
canvas.addEventListener('wheel', (e) => {
  if (game.phase !== 'round' && game.phase !== 'sundown') return;
  e.preventDefault();
  const owned = WEAPON_ORDER.filter((k) => game.weapons[k] > 0);
  const at = owned.indexOf(game.weapon);
  game.selectWeapon(owned[(at + (e.deltaY > 0 ? 1 : -1) + owned.length) % owned.length]);
}, { passive: false });

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  unlockAudio();
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === ' ') e.preventDefault();
  if (ui.modalOpen) {
    if (ui.modalKey(key)) e.preventDefault();
    return;
  }
  if (classic) {
    if (key === ' ' || key === 'p' || key === 'Escape') hooks.togglePause();
    if (key === 'm') hooks.toggleMute();
    if (key === 'n') hooks.toggleMusic();
    return;
  }
  if (ui.allClearKey(key)) {
    e.preventDefault();
    return;
  }
  if (key === 'f') hooks.toggleSpeed();
  if (key === 'm') hooks.toggleMute();
  if (key === 'n') hooks.toggleMusic();
  if (game.phase === 'planning') {
    const item = HOTKEYS[key];
    if (item) {
      ui.pick(item);
    } else if (key === 'Escape') {
      ui.select(null);
    } else if (key === ' ' || key === 'Enter') {
      hooks.startDay();
    }
  } else if (game.phase === 'round' || game.phase === 'sundown') {
    if (key === ' ' || key === 'p' || key === 'Escape') hooks.togglePause();
    const n = '12345'.indexOf(key);
    if (n >= 0) game.selectWeapon(WEAPON_ORDER[n]);
  } else if (game.phase === 'harvest' && (key === ' ' || key === 'Enter')) {
    game.finishHarvestNow();
  }
});

window.addEventListener('beforeunload', persist);

// Don't let the bunnies feast while you're in another window.
function autoPause(): void {
  const live = classic ? !classic.done : game.phase === 'round' || game.phase === 'sundown';
  if (live && !paused && !ui.modalOpen) hooks.togglePause();
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});

// ---------------------------------------------------------------- layout

function fit(): void {
  const dpr = window.devicePixelRatio || 1;
  const side = document.getElementById('side') as HTMLElement;
  const minSide = 262;
  const gutters = 14 + 28 + 4; // between the windows, the desk's padding, window borders
  const availW = window.innerWidth - minSide - gutters;
  const availH = window.innerHeight - 22 - 28 - 20 - 4;
  // device pixels per art pixel if the farm filled the space
  const s = Math.max(0.25, Math.min(availW / WORLD_W, availH / WORLD_H) * dpr);
  // A whole number keeps every art pixel the same size on screen. When that would waste a lot of the
  // window, draw one size up and let the browser shrink it smoothly: pixels stay even, edges go soft.
  const whole = Math.floor(s);
  const crisp = whole >= 1 && whole / s >= 0.8;
  const zoom = crisp ? whole : Math.max(1, Math.ceil(s));
  if (renderer.zoom !== zoom) renderer.setZoom(zoom);
  const shown = crisp ? zoom : s;
  const w = (WORLD_W * shown) / dpr;
  const h = (WORLD_H * shown) / dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.imageRendering = crisp ? 'pixelated' : 'auto';
  // any width left over goes to the sidebar, so the store and the Almanac wrap less
  const sideW = Math.floor(Math.max(minSide, Math.min(330, window.innerWidth - w - gutters)));
  side.style.width = `${sideW}px`;
  side.classList.toggle('wide', sideW >= 310);
  // the sidebar may run taller than the farm window when the store needs the room
  side.style.height = `${Math.max(h + 22, window.innerHeight - 22 - 28)}px`;
}
fit();
window.addEventListener('resize', fit);
// moving the window to a screen with a different pixel density doesn't always fire a resize
const watchDensity = (): void => {
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => {
    fit();
    watchDensity();
  }, { once: true });
};
watchDensity();

// ---------------------------------------------------------------- loop

let lastPhase: Phase = game.phase;
let acc = 0;
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const modal = ui.modalOpen;
  if (classic) {
    frameClassic(classic, dt, !paused && !modal);
    requestAnimationFrame(frame);
    return;
  }
  const running = !paused && (!modal || modal === 'title');
  if (running) {
    const rate = skipping ? 8 : speed;
    acc += dt * rate;
    let n = 0;
    const cap = 10 * Math.max(1, rate / 2);
    while (acc >= STEP && n < cap) {
      game.update(STEP);
      acc -= STEP;
      n++;
    }
    if (n >= cap) acc = 0;
  }
  if (firing && running && view.mouseIn && WEAPONS[game.weapon].hold) game.fire(view.mouseX / TILE, view.mouseY / TILE);
  else if (!firing || !view.mouseIn) game.stopHose();
  if (game.hoseAim) sfx.play('hose');
  if (settings.autoSkip && !skipping && running && game.allClear()) {
    skipping = true;
    ui.banner('All clear!', 'Skipping to sundown', 1.2);
  }
  const events = game.events.splice(0);
  for (const e of events) {
    if (e.t === 'error') ui.toast(e.msg);
    if (e.t === 'smoke') {
      ui.select(null); // one a day
      ui.banner('Smoked out!', 'An Asteroid Buck is coming today', 2.2);
    }
  }
  renderer.handle(events);
  sfx.handle(events);
  if (game.phase !== lastPhase) {
    const from = lastPhase;
    lastPhase = game.phase;
    onPhase(from, game.phase);
  }
  music.play(songFor());
  view.selected = game.phase === 'planning' ? ui.selected : null;
  renderer.render(game, view, paused ? 0 : dt); // effects keep fading behind dialogs; only Pause freezes them
  ui.update(dt);
  tutorial.update(game, dt, !!modal && modal !== 'title');
  requestAnimationFrame(frame);
}

function frameClassic(c: Classic, dt: number, running: boolean): void {
  if (running) c.update(dt);
  const events = c.events.splice(0);
  renderer.handleClassic(events);
  for (const e of events) classicSound(e);
  music.play(c.done ? 'title' : 'day');
  renderer.renderClassic(c, view, running ? dt : 0);
  ui.update(dt);
  if (c.done && !classicResultsShown) {
    classicResultsShown = true;
    const record = store.recordClassicBest(c.score);
    ui.showClassicResults(c, record);
  }
}

function classicSound(e: ClassicEvent): void {
  switch (e.t) {
    case 'shot': sfx.play('sling'); break;
    case 'miss': sfx.play('miss'); break;
    case 'hit': sfx.play('hit'); break;
    case 'kill': sfx.play(e.kind === 'golden' ? 'bigpoof' : 'poof'); sfx.play('coin'); break;
    case 'dog': sfx.play('woof'); sfx.play('error'); break;
    case 'combo': sfx.play('buy'); break;
    case 'popup': sfx.play('dig'); break;
  }
}

function songFor(): Song | null {
  switch (game.phase) {
    case 'title':
    case 'gameover':
    case 'victory':
      return 'title';
    case 'round':
      return game.lastNight || game.bunnies.some((b) => b.kind === 'mutant') ? 'boss' : 'day';
    default:
      return 'plan';
  }
}

document.addEventListener('pointerdown', unlockAudio, { capture: true });

game.setupAttract();
ui.showTitle();
requestAnimationFrame(frame);

// A handle for poking at the game from the console / automated screenshots.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).bk4 = {
    game, ui, hooks, view, sfx, music,
    get classic() {
      return classic;
    },
    /**
     * Advance the simulation by `seconds` of game time, instantly. Phase side effects (summary, scores)
     * only see the net change on the next frame, so don't step across a sundown with it.
     */
    step(seconds: number) {
      for (let t = 0; t < seconds; t += STEP) game.update(STEP);
    },
  };
}
