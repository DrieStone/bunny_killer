// Screenshot tour of the main game states, written to shots/tour-*.png
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await wait(1200);
await page.screenshot({ path: 'shots/tour-1-title.png' });

const box = await page.locator('#game').boundingBox();
const scr = (tx, ty) => ({ x: box.x + ((tx + 0.5) / 22) * box.width, y: box.y + ((ty + 0.5) / 16) * box.height });

// --- planning: a small farm going in, scarecrow in hand
await page.click('.dialog button:has-text("New Game")');
await page.click('.farm-card'); // the farm picker: Home Farm
await page.evaluate(() => {
  const { game } = window.bk4;
  const at = (x, y) => y * 22 + x;
  for (let x = 11; x <= 13; x++) game.place({ type: "crop", kind: "carrot" }, at(x, 8));
  game.place({ type: 'crop', kind: 'lettuce' }, at(11, 9));
  game.place({ type: 'defense', kind: 'trap' }, at(12, 9));
});
await page.keyboard.press('e');
let p = scr(12, 7);
await page.mouse.move(p.x, p.y);
await wait(1900);
await page.screenshot({ path: 'shots/tour-2-plan.png' });
await page.keyboard.press('Escape');

// --- day 3: a defended field mid-afternoon, sling in action
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 3; game.credits = 600; game.lots = game.lots.map((_, n) => (n % 8) >= 2 && (n % 8) <= 5); for (const i of game.ownedTiles()) game.tilled[i] = 1;
  game.loadSave(game.toSave());
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  const crops = ['carrot', 'lettuce', 'carrot', 'radish', 'pumpkin'];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if (y === r.y0 + 1 && x >= r.x0 + 1 && x <= r.x0 + 4) game.place({ type: 'defense', kind: 'fence' }, at(x, y));
    else if (x === r.x0 + 5 && y === r.y0 + 4) game.place({ type: 'defense', kind: 'scarecrow' }, at(x, y));
    else if (x === r.x0 + 2 && y === r.y0 + 5) game.place({ type: 'defense', kind: 'sprinkler' }, at(x, y));
    else if ((x * 3 + y) % 9 === 0) game.place({ type: 'defense', kind: 'trap' }, at(x, y));
    else if ((x + y) % 2 === 0) game.place({ type: 'crop', kind: crops[(x + y * 2) % 5] }, at(x, y));
  }
  for (const t of game.tiles) if (t.crop) t.crop.growth = 20;
  hooks.startDay();
  window.bk4.step(21);
  game.events.length = 0;
});
p = scr(7, 10);
await page.mouse.move(p.x, p.y);
await wait(1600);
// click the nearest visible bunny and catch the poof
for (let k = 0; k < 60; k++) {
  const t = await page.evaluate(() => {
    const g = window.bk4.game;
    const b = g.bunnies.find((b) => g.isSurfaced(b) && b.state !== 'exit' && b.x > 3 && b.x < 19 && b.y > 2 && b.y < 12);
    return b ? { x: b.x, y: b.y - 0.3 } : null;
  });
  if (t) {
    await page.mouse.click(box.x + (t.x / 22) * box.width, box.y + (t.y / 16) * box.height);
    await wait(110);
    break;
  }
  await wait(150);
}
await page.screenshot({ path: 'shots/tour-3-day.png' });

// --- day 5: the Asteroid Buck
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.phase = 'planning';
  game.round = 5; game.credits = 3000; game.lots = game.lots.map((_, n) => (n % 8) >= 2 && (n % 8) <= 5); for (const i of game.ownedTiles()) game.tilled[i] = 1;
  game.loadSave(game.toSave());
  for (let i = 0; i < game.tiles.length; i++) { game.tiles[i].crop = null; game.tiles[i].structure = null; }
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  const crops = ['carrot', 'lettuce', 'pumpkin', 'carrot', 'corn', 'radish'];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if (y === r.y0 && x < r.x0 + 5) game.place({ type: 'defense', kind: 'fence' }, at(x, y));
    else if (x === r.x0 + 2 && y === r.y0 + 3) game.place({ type: 'defense', kind: 'scarecrow' }, at(x, y));
    else if (x === r.x1 - 2 && y === r.y0 + 2) game.place({ type: 'defense', kind: 'turret' }, at(x, y));
    else if (x === r.x1 - 1 && y === r.y1 - 2) game.place({ type: 'defense', kind: 'doghouse' }, at(x, y));
    else if (x === r.x0 + 4 && y === r.y1 - 2) game.place({ type: 'defense', kind: 'sprinkler' }, at(x, y));
    else if ((x + y) % 7 === 0) game.place({ type: 'defense', kind: 'trap' }, at(x, y));
    else game.place({ type: 'crop', kind: crops[(x * 5 + y * 3) % 6] }, at(x, y));
  }
  for (const t of game.tiles) if (t.crop) t.crop.growth = 22;
  hooks.startDay();
  window.bk4.step(27);
  game.events.length = 0;
});
await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.45);
await wait(1700);
await page.screenshot({ path: 'shots/tour-4-boss.png' });

// --- evening: the harvest summary
await page.evaluate(async () => {
  const { game, step } = window.bk4;
  step(45);
  await new Promise((r) => setTimeout(r, 300));
  game.finishHarvestNow();
});
await wait(900);
await page.screenshot({ path: 'shots/tour-5-summary.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
