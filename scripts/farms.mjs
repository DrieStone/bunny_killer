// Screenshots of the three farms and the farm picker: shots/farms-*.png
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
await wait(500);
await page.screenshot({ path: 'shots/farms-0-pick.png' });

for (const map of ['home', 'river', 'orchard']) {
  await page.evaluate((map) => {
    const { game, hooks } = window.bk4;
    hooks.newGame('normal', map);
    game.round = 12;
    game.credits = 900;
    Object.assign(game.stats, { kills: 200, harvest: 3000, bossesBeaten: 1 });
    game.loadSave(game.toSave());
    const r = game.plot;
    const at = (x, y) => y * 22 + x;
    for (let x = r.x0; x <= r.x1; x++) game.place({ type: 'crop', kind: x % 2 ? 'carrot' : 'lettuce' }, at(x, r.y0 + 1));
    hooks.changed();
  }, map);
  await wait(2200);
  await page.screenshot({ path: `shots/farms-${map}-plan.png` });
  await page.evaluate(() => {
    const { hooks, step, game } = window.bk4;
    hooks.startDay();
    step(16);
    game.events.length = 0;
  });
  await wait(1200);
  await page.screenshot({ path: `shots/farms-${map}-day.png` });
  await page.evaluate(() => {
    const { game } = window.bk4;
    for (let t = 0; t < 70 && game.phase !== 'harvest' && game.phase !== 'summary'; t += 1 / 60) game.update(1 / 60);
    game.finishHarvestNow();
  });
  await wait(300);
  await page.keyboard.press('Enter');
  await wait(300);
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
