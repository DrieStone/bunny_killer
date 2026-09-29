// Screenshots of the progression features: shots/prog-*.png
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bk4.tutorial', 'done'); });
await page.reload({ waitUntil: 'networkidle' });
await wait(600);

// --- Day 3: a young farm, some things still locked, a few NEW
await page.click('.dialog button:has-text("New Game")');
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.stats.harvest = 300;
  game.round = 3;
  game.loadSave(game.toSave());
  game.newUnlocks = ['scarecrow', 'corn', 'sling1'];
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (let x = r.x0; x <= r.x1; x++) game.place({ type: 'crop', kind: x % 2 ? 'carrot' : 'lettuce' }, at(x, r.y0 + 2));
  game.place({ type: 'defense', kind: 'trap' }, at(r.x0 + 2, r.y0 + 3));
  hooks.changed();
});
await page.click('#store-tabs .tab[data-tab="defense"]');
await page.hover('#def-items .item:nth-child(4)'); // the locked sprinkler
await wait(700);
await page.screenshot({ path: 'shots/prog-1-locks.png' });

// --- mid-game: two stages done, the crater is angry
await page.evaluate(() => {
  const { game } = window.bk4;
  game.round = 17;
  game.stats.bossesBeaten = 2;
  game.stats.kills = 400;
  game.stats.harvest = 9000;
  game.credits = 4200;
  game.lots = game.lots.map(() => true); for (const i of game.ownedTiles()) game.tilled[i] = 1;
  game.project = 2;
  game.market.carrot = 1.22;
  game.market.corn = 0.78;
  game.glut.lettuce = 11;
  game.loadSave(game.toSave());
});
await page.hover('#btn-project');
await wait(900);
await page.screenshot({ path: 'shots/prog-2-project.png' });

// --- the Last Night
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 29;
  game.stats.bossesBeaten = 4;
  game.credits = 12000;
  game.project = 2;
  game.loadSave(game.toSave());
  for (let i = 0; i < game.tiles.length; i++) { game.tiles[i].crop = null; game.tiles[i].structure = null; }
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  const crops = ['carrot', 'lettuce', 'pumpkin', 'corn', 'radish', 'strawberry'];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if ((x === r.x1 - 1 && y === r.y1 - 1) || (x === r.x1 - 3 && y === r.y0 + 2)) game.place({ type: 'defense', kind: 'turret' }, at(x, y));
    else if (x === r.x0 + 2 && y === r.y0 + 4) game.place({ type: 'defense', kind: 'doghouse' }, at(x, y));
    else if ((x + y) % 6 === 0) game.place({ type: 'defense', kind: 'trap' }, at(x, y));
    else game.place({ type: 'crop', kind: crops[(x * 5 + y * 3) % 6] }, at(x, y));
  }
  for (const t of game.tiles) if (t.crop) t.crop.growth = 25;
  game.fundProject();
  hooks.changed();
});
await wait(400);
await page.screenshot({ path: 'shots/prog-3-capday.png' });
await page.evaluate(() => {
  const { hooks, step, game } = window.bk4;
  hooks.startDay();
  step(24);
  game.events.length = 0;
});
const box = await page.locator('#game').boundingBox();
await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.62);
await wait(1800);
await page.screenshot({ path: 'shots/prog-4-lastnight.png' });

// --- win it
await page.evaluate(async () => {
  const { game } = window.bk4;
  for (let t = 0; t < 120 && game.phase !== 'summary' && game.phase !== 'harvest'; t += 1 / 60) {
    game.update(1 / 60);
    for (const b of game.bunnies) if (b.kind === 'mutant') game.damageBunny(b, 9999);
  }
  game.finishHarvestNow();
});
await wait(900);
await page.screenshot({ path: 'shots/prog-5-sealed.png' });
await page.keyboard.press('Enter');
await wait(900);
await page.screenshot({ path: 'shots/prog-6-victory.png' });

// --- Year 2: ninjas and a queen
await page.evaluate(() => {
  const { hooks, game } = window.bk4;
  hooks.newGame();
  game.round = 38;
  game.stats.bossesBeaten = 5;
  game.stats.kills = 2000;
  game.stats.harvest = 40000;
  game.credits = 3000;
  game.lots = game.lots.map(() => true); for (const i of game.ownedTiles()) game.tilled[i] = 1;
  game.loadSave(game.toSave());
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if ((x + y) % 3) game.place({ type: 'crop', kind: 'carrot' }, at(x, y));
  for (const t of game.tiles) if (t.crop) t.crop.growth = 40;
  game.wave = game.wave.filter((w) => w.kind === 'ninja' || w.kind === 'queen' || w.kind === 'common').slice(0, 30);
  game.wave.push({ at: 1, kind: 'queen', burrow: 0 }, { at: 2, kind: 'ninja', burrow: 1 }, { at: 2.5, kind: 'ninja', burrow: 0 });
  game.wave.sort((a, b) => a.at - b.at);
});
await wait(500);
await page.screenshot({ path: 'shots/prog-7-year2-plan.png' });
await page.evaluate(() => {
  const { hooks, step, game } = window.bk4;
  hooks.startDay();
  step(13);
  game.events.length = 0;
});
await wait(1200);
await page.screenshot({ path: 'shots/prog-8-year2.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
