// Screenshots of the smoke bomb: aiming at the crater, the smoke, and the Buck it brings out. shots/smoke-*.png
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
await wait(1800);

// Day 9: one Buck down, a Crater Project stage waiting on the next one
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 9;
  game.credits = 2600;
  Object.assign(game.stats, { kills: 160, harvest: 2600, bossesBeaten: 1 });
  game.project = 1;
  game.loadSave(game.toSave());
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if ((x - r.x0) % 4 === 1 && y === r.y0 + 1) game.place({ type: 'defense', kind: 'scarecrow' }, at(x, y));
    else game.place({ type: 'crop', kind: (x + y) % 3 ? 'carrot' : 'corn' }, at(x, y));
  }
  hooks.changed();
});
const box = await page.locator('#game').boundingBox();
const at = (tx, ty) => ({ x: box.x + ((tx + 0.5) / 22) * box.width, y: box.y + ((ty + 0.5) / 16) * box.height });
await page.keyboard.press('b');
let p = at(19.5, 11.5);
await page.mouse.move(p.x, p.y);
await wait(600);
await page.screenshot({ path: 'shots/smoke-1-aim.png' });

// in it goes
await page.mouse.click(p.x, p.y);
await wait(900);
await page.screenshot({ path: 'shots/smoke-2-thrown.png' });
p = at(8, 4);
await page.mouse.move(p.x, p.y);
await wait(2500);
await page.screenshot({ path: 'shots/smoke-3-smoking.png' });

// the day: the Buck climbs out of the smoke
await page.evaluate(() => {
  const { game, hooks, step } = window.bk4;
  hooks.startDay();
  step(19.6);
  game.events.length = 0;
});
await wait(1500);
await page.screenshot({ path: 'shots/smoke-4-buck.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
