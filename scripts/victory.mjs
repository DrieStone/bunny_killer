// Screenshots of the victory: the cap coming down, fireworks, the dialog, and a farm kept after the win. shots/victory-*.png
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
await wait(1200);

// the Last Night, won
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 29;
  game.credits = 12000;
  Object.assign(game.stats, { kills: 1500, harvest: 60000, bossesBeaten: 4 });
  game.project = 2;
  game.loadSave(game.toSave());
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y += 2) game.place({ type: 'crop', kind: 'carrot' }, at(x, y));
  game.fundProject();
  hooks.changed();
  hooks.startDay();
  for (let t = 0; t < 120 && game.phase !== 'harvest' && game.phase !== 'summary'; t += 1 / 60) {
    game.update(1 / 60);
    for (const b of game.bunnies) if (b.kind === 'mutant' && !b.dead) game.damageBunny(b, 9999);
  }
  game.finishHarvestNow();
  game.events.length = 0;
});
await wait(700);
await page.keyboard.press('Enter'); // Dawn
await wait(1100);
await page.screenshot({ path: 'shots/victory-1-cap.png' });
await wait(1400);
await page.screenshot({ path: 'shots/victory-2-landed.png' });
await wait(1100);
await page.screenshot({ path: 'shots/victory-3-fireworks.png' });
await wait(1400);
await page.screenshot({ path: 'shots/victory-4-dialog.png' });
await page.click('.dialog button:has-text("Keep Farming")');
await wait(1200);
await page.screenshot({ path: 'shots/victory-5-kept.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
