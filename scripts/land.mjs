// Screenshots of buying and tilling land: shots/land-*.png
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1512, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bk4.tutorial', 'done'); });
await page.reload({ waitUntil: 'networkidle' });
await wait(500);
await page.click('.dialog button:has-text("New Game")');
await wait(1800); // let the banner go
const box = await page.locator('#game').boundingBox();
const at = (tx, ty) => ({ x: box.x + ((tx + 0.5) / 22) * box.width, y: box.y + ((ty + 0.5) / 16) * box.height });

// day 2: a few crops in the starting lots, then the Buy Land tool over a lot for sale
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 2;
  game.credits = 420;
  game.loadSave(game.toSave());
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (let x = r.x0; x <= r.x1; x++) game.place({ type: 'crop', kind: x % 3 ? 'carrot' : 'lettuce' }, at(x, r.y0 + 1));
  game.place({ type: 'defense', kind: 'trap' }, at(r.x0 + 3, r.y0 + 2));
  hooks.changed();
});
await page.keyboard.press('l');
let p = at(16, 8);
await page.mouse.move(p.x, p.y);
await wait(500);
await page.screenshot({ path: 'shots/land-1-buy.png' });

// drag across a 4x4 patch to buy its four lots, then till a couple of rows, plant, and build on the grass
p = at(15, 6);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
for (const [x, y] of [[17, 6], [17, 8], [15, 8]]) {
  const q = at(x, y);
  await page.mouse.move(q.x, q.y, { steps: 4 });
}
await page.mouse.up();
await wait(300);
await page.keyboard.press('h');
p = at(15, 6);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
for (let x = 15; x <= 18; x++) {
  const q = at(x, 6);
  await page.mouse.move(q.x, q.y, { steps: 3 });
}
await page.mouse.up();
for (let x = 15; x <= 18; x++) {
  const q = at(x, 7);
  await page.mouse.click(q.x, q.y);
}
await page.keyboard.press('3');
for (let x = 15; x <= 18; x++) {
  const q = at(x, 6);
  await page.mouse.click(q.x, q.y);
}
await page.keyboard.press('w');
p = at(16, 9);
await page.mouse.click(p.x, p.y);
await page.keyboard.press('h');
p = at(17, 8);
await page.mouse.move(p.x, p.y);
await wait(500);
await page.screenshot({ path: 'shots/land-2-till.png' });

// planting on grass says to till first
await page.keyboard.press('3');
p = at(16, 8);
await page.mouse.move(p.x, p.y);
await wait(400);
await page.screenshot({ path: 'shots/land-3-tillfirst.png' });

// the same farm out in the day: no darkening
await page.keyboard.press('Escape');
await page.evaluate(() => {
  const { hooks, step, game } = window.bk4;
  hooks.startDay();
  step(12);
  game.events.length = 0;
});
await wait(1200);
await page.screenshot({ path: 'shots/land-4-day.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
