// Screenshot the planning-phase burrow tags on every edge, plus the Almanac for a hovered burrow.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('bk4.tutorial', 'done'));
await page.reload({ waitUntil: 'networkidle' });
const info = await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  hooks.newGame();
  game.round = 7;
  game.loadSave(game.toSave());
  // one burrow on each edge so every tag direction shows
  game.burrows = [{ x: 0, y: 8 }, { x: 21, y: 6 }, { x: 11, y: 0 }, { x: 16, y: 13 }];
  game.wave.forEach((w, k) => { if (w.burrow >= 0) w.burrow = k % 4; });
  return { counts: game.burrowCounts(), burrows: game.burrows };
});
await page.waitForTimeout(2600);
const box = await page.locator('#game').boundingBox();
await page.mouse.move(box.x + (0.5 / 22) * box.width, box.y + (8.5 / 16) * box.height);
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/burrows.png' });
console.log(JSON.stringify(info), errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
