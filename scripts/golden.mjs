// Screenshots of a golden bunny's dash, and the prize for bonking it: shots/golden-*.png
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

// a morning with a golden bunny due, then run the day up to its dash
await page.evaluate(() => {
  const { game, hooks, step } = window.bk4;
  for (let round = 5; round < 40; round++) {
    game.round = round;
    game.credits = 600;
    game.loadSave(game.toSave());
    if (game.goldenAt >= 0 && !game.isBossDay()) break;
  }
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y += 2) game.place({ type: 'crop', kind: 'carrot' }, at(x, y));
  hooks.changed();
  hooks.startDay();
  step(game.goldenAt + 1.4);
  game.events.length = 0;
});
await wait(250);
await page.screenshot({ path: 'shots/golden-1-dash.png' });
await page.evaluate(() => {
  const { game } = window.bk4;
  const b = game.bunnies.find((x) => x.kind === 'golden');
  if (b) {
    game.selectWeapon('sling');
    game.fire(b.x, b.y - 0.3);
  }
});
await wait(450);
await page.screenshot({ path: 'shots/golden-2-prize.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
