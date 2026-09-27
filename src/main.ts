// Boot, main loop, and input. The rules live in game.ts; this file just wires things up.
import { Sfx } from './audio';
import { Classic, type ClassicEvent } from './classic';
import { Music, type Song } from './music';
import { TILE, WORLD_H, WORLD_W } from './config';
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

const view: View = { mouseX: 0, mouseY: 0, mouseIn: false, hoverTile: -1, selected: null, previewExpand: false };
let paused = false;
let speed = 1;
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
}

const hooks: UiHooks = {
  newGame() {
    store.clearSave();
    game.newGame();
    freshStart();
    persist();
    ui.banner('Day 1', 'Plant some seeds, then start the day');
  },
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
    ui.banner(`Day ${game.round}`, 'Here they come!', 1.3);
  },
  nextDay() {
    game.continueAfterSummary();
    ui.closeModal();
    if (game.phase === 'planning') {
      persist();
      ui.banner(`Day ${game.round}`, game.round % 5 === 0 ? 'The crater is glowing…' : 'A new morning');
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
    speed = speed === 1 ? 2 : 1;
  },
  skipDay() {
    // nothing left to fight: let the crops finish growing in a hurry
    if (game.phase === 'round' && game.bunniesLeft() === 0) speed = 8;
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
  speed: () => speed,
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
  if (speed > 2) speed = 1; // a skip only lasts until sundown
  if (to !== 'round' && to !== 'sundown') paused = false;
  if (to === 'sundown') ui.banner('Sundown!', 'The bunnies are heading home');
  if (to === 'harvest') ui.banner('Harvest!', '', 1.1);
  if (to === 'summary') {
    store.recordBest(game.stats.harvest, game.round);
    ui.showSummary();
  }
  if (to === 'gameover') {
    store.clearSave();
    store.recordBest(game.stats.harvest, game.round - 1);
    const rank = store.addScore({
      score: game.stats.harvest, days: game.round - 1, kills: game.stats.kills, bosses: game.stats.bossesBeaten,
      date: new Date().toISOString().slice(0, 10), retired: game.retired,
    });
    ui.showGameOver(rank);
  }
  if (from === 'title' && to === 'planning') canvas.focus();
}

// ---------------------------------------------------------------- input

let painting = false;
let lastPainted = -1;

function toWorld(e: PointerEvent): void {
  const r = canvas.getBoundingClientRect();
  view.mouseX = ((e.clientX - r.left) / r.width) * WORLD_W;
  view.mouseY = ((e.clientY - r.top) / r.height) * WORLD_H;
  view.mouseIn = view.mouseX >= 0 && view.mouseY >= 0 && view.mouseX < WORLD_W && view.mouseY < WORLD_H;
  view.hoverTile = view.mouseIn ? tileAt(view.mouseX / TILE, view.mouseY / TILE) : -1;
  ui.hoverTile = view.hoverTile;
}

/** Crops, fences, and the shovel paint along a drag; everything else is one per click. */
const paintable = (item: ShopItem) =>
  item.type === 'crop' || item.type === 'remove' || (item.type === 'defense' && item.kind === 'fence');

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
    if (e.button === 0 && !paused) game.fireSling(view.mouseX / TILE, view.mouseY / TILE);
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
    if (t.crop) ui.select({ type: 'crop', kind: t.crop.kind });
    else if (t.structure) ui.select({ type: 'defense', kind: t.structure.kind });
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
});

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
  if (key === 'f') hooks.toggleSpeed();
  if (key === 'm') hooks.toggleMute();
  if (key === 'n') hooks.toggleMusic();
  if (game.phase === 'planning') {
    const item = HOTKEYS[key];
    if (item) {
      const same = ui.selected && JSON.stringify(ui.selected) === JSON.stringify(item);
      ui.select(same ? null : item);
    } else if (key === 'Escape') {
      ui.select(null);
    } else if (key === ' ' || key === 'Enter') {
      hooks.startDay();
    }
  } else if (game.phase === 'round' || game.phase === 'sundown') {
    if (key === ' ' || key === 'p' || key === 'Escape') hooks.togglePause();
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
  const sideW = 262 + 14;
  const availW = window.innerWidth - sideW - 28 - 4;
  const availH = window.innerHeight - 22 - 28 - 20 - 4;
  let s = Math.min(availW / WORLD_W, availH / WORLD_H);
  const whole = Math.floor(s);
  if (whole >= 1 && whole / s > 0.86) s = whole;
  s = Math.max(1, s);
  const w = Math.floor(WORLD_W * s);
  const h = Math.floor(WORLD_H * s);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  // the sidebar may run taller than the farm window when the store needs the room
  const sideH = Math.max(h + 22, Math.min(window.innerHeight - 22 - 28, 760));
  (document.getElementById('side') as HTMLElement).style.height = `${sideH}px`;
}
fit();
window.addEventListener('resize', fit);

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
    acc += dt * speed;
    let n = 0;
    const cap = 10 * Math.max(1, speed / 2);
    while (acc >= STEP && n < cap) {
      game.update(STEP);
      acc -= STEP;
      n++;
    }
    if (n >= cap) acc = 0;
  }
  const events = game.events.splice(0);
  for (const e of events) if (e.t === 'error') ui.toast(e.msg);
  renderer.handle(events);
  sfx.handle(events);
  if (game.phase !== lastPhase) {
    const from = lastPhase;
    lastPhase = game.phase;
    onPhase(from, game.phase);
  }
  music.play(songFor());
  view.selected = game.phase === 'planning' ? ui.selected : null;
  view.previewExpand = ui.previewExpand;
  renderer.render(game, view, running ? dt : 0);
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
      return 'title';
    case 'round':
      return game.bunnies.some((b) => b.kind === 'mutant') ? 'boss' : 'day';
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
