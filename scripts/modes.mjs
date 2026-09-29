// Screenshots of the all-clear box, Repair All, and Hard Mode: shots/modes-*.png
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bk4.tutorial', 'done'); });
await page.reload({ waitUntil: 'networkidle' });
await wait(500);
await page.click('.dialog button:has-text("New Game")');
await page.click('.farm-card'); // the farm picker: Home Farm
await wait(1800);

// a small day where every bunny gets bonked: the all-clear box comes up over the farm
await page.evaluate(() => {
  const { game, hooks, step } = window.bk4;
  game.round = 4;
  game.credits = 400;
  game.loadSave(game.toSave());
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if (x === r.x0 + 2 && y === r.y0 + 1) game.place({ type: 'defense', kind: 'trap' }, at(x, y));
    else game.place({ type: 'crop', kind: (x + y) % 3 ? 'carrot' : 'lettuce' }, at(x, y));
  }
  game.wave = game.wave.slice(0, 5).map((w, n) => ({ ...w, at: 1 + n * 0.4 }));
  hooks.startDay();
  step(12);
  for (const b of game.bunnies) game.damageBunny(b, 99);
  step(0.5);
  game.events.length = 0;
});
await wait(900);
await page.screenshot({ path: 'shots/modes-1-allclear.png' });

// skip it: the rest of the day flies by, then the harvest
await page.click('#ac-skip');
await wait(1000);
await page.screenshot({ path: 'shots/modes-2-skipping.png' });
await page.waitForFunction(() => window.bk4.game.phase === 'harvest', null, { timeout: 20000 });
await page.evaluate(() => window.bk4.game.finishHarvestNow());
await page.waitForFunction(() => window.bk4.ui.modalOpen === 'summary', null, { timeout: 5000 });
await page.keyboard.press('Enter');
await wait(600);

// next morning, some chewed defenses: Repair All in the Defense tab
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.credits = 600;
  game.unlocked.add('turret');
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (const [x, y, kind] of [[r.x0, r.y0, 'turret'], [r.x1, r.y0, 'fence'], [r.x1 - 1, r.y0, 'fence'], [r.x0 + 4, r.y1, 'scarecrow']]) {
    const i = at(x, y);
    game.tiles[i].crop = null;
    game.place({ type: 'defense', kind }, i);
  }
  for (const t of game.tiles) if (t.structure) { t.structure.fresh = false; t.structure.hp *= 0.4; }
  hooks.changed();
});
await page.click('#store-tabs .tab[data-tab="defense"]');
await page.hover('#repair-cell');
await wait(600);
await page.screenshot({ path: 'shots/modes-3-repair.png' });

// Hard Mode, once the crater has been sealed
await page.evaluate(() => {
  localStorage.setItem('bk4.hardOpen', 'true');
  window.bk4.hooks.toTitle();
});
await wait(700);
await page.screenshot({ path: 'shots/modes-4-title.png' });
await page.click('.dialog button:has-text("Hard Mode")');
await wait(500);
await page.screenshot({ path: 'shots/modes-5-hardintro.png' });
await page.click('.dialog button:has-text("Start")');
await wait(300);
await page.click('.farm-card'); // the farm picker
await wait(300);
const confirm = await page.$('.dialog button:has-text("New Game")');
if (confirm) await confirm.click();
await wait(1600);

// a Hard Mode morning in the fall: ninjas already
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 17;
  game.credits = 900;
  game.stats.bossesBeaten = 2;
  game.project = 1;
  game.loadSave(game.toSave());
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (let x = r.x0; x <= r.x1; x++) game.place({ type: 'crop', kind: 'carrot' }, at(x, r.y0 + 1));
  hooks.changed();
});
await wait(600);
await page.screenshot({ path: 'shots/modes-6-hardday.png' });

// and the victory screen that opens it
await page.evaluate(() => {
  const { game, ui } = window.bk4;
  game.mode = 'normal';
  game.round = 31;
  Object.assign(game.stats, { kills: 1650, bossesBeaten: 5, harvest: 98000 });
  ui.showVictory(0);
});
await wait(500);
await page.screenshot({ path: 'shots/modes-7-victory.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
