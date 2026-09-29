// Screenshots of defense combos: gold links in the morning, and the COMBO! pop in the day. shots/combos-*.png
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
await page.evaluate(() => window.bk4.hooks.newGame('normal', 'home'));
await wait(1600);

// a hive among the sunflowers, a trap by a decoy
const hive = await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 14;
  game.credits = 3000;
  Object.assign(game.stats, { kills: 400, harvest: 5000, bossesBeaten: 2 });
  game.loadSave(game.toSave());
  for (const k of ['beehive', 'decoy', 'sunflower', 'trap', 'scarecrow', 'sprinkler']) game.unlocked.add(k);
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  const hive = at(r.x0 + 2, r.y0 + 1);
  game.place({ type: 'defense', kind: 'beehive' }, hive);
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 1], [1, 2], [2, 1]]) game.place({ type: 'crop', kind: 'sunflower' }, at(r.x0 + 2 + dx, r.y0 + 1 + dy));
  game.place({ type: 'defense', kind: 'decoy' }, at(r.x1 - 1, r.y0 + 2));
  game.place({ type: 'defense', kind: 'trap' }, at(r.x1 - 2, r.y0 + 1));
  game.place({ type: 'defense', kind: 'trap' }, at(r.x1, r.y0 + 3));
  hooks.changed();
  return { x: r.x0 + 2, y: r.y0 + 1 };
});
const box = await page.locator('#game').boundingBox();
const at = (tx, ty) => ({ x: box.x + ((tx + 0.5) / 22) * box.width, y: box.y + ((ty + 0.5) / 16) * box.height });
let p = at(hive.x, hive.y);
await page.mouse.move(p.x, p.y);
await wait(600);
await page.screenshot({ path: 'shots/combos-1-hive.png' });

// holding a decoy: the traps it would help light up
await page.keyboard.press('s');
p = at(hive.x + 9, hive.y + 2);
await page.mouse.move(p.x, p.y);
await wait(500);
await page.screenshot({ path: 'shots/combos-2-decoy.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
