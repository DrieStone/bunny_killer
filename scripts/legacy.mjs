// Screenshots of the Farm Legacy: the store line after the win, a landmark going up, the finale, the noon bell,
// and all five landmarks on each farm. shots/legacy-*.png
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

/** Win on a farm (the Last Night, every Buck bonked), then keep farming with money to spend. */
async function winOn(map) {
  await page.evaluate((map) => window.bk4.hooks.newGame('normal', map), map);
  await wait(900);
  await page.evaluate(() => {
    const { game, hooks } = window.bk4;
    game.round = 29;
    game.credits = 12000;
    Object.assign(game.stats, { kills: 1500, harvest: 60000, bossesBeaten: 4 });
    game.project = 2;
    game.loadSave(game.toSave());
    const r = game.plot;
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) game.place({ type: 'crop', kind: 'carrot' }, y * 22 + x);
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
  await wait(600);
  await page.keyboard.press('Enter'); // Dawn: the cap comes down
  await wait(5500);
  await page.click('.dialog button:has-text("Keep Farming")');
  await wait(1500);
  await page.evaluate(() => {
    const { game, hooks } = window.bk4;
    game.credits = 200000;
    const r = game.plot;
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) game.place({ type: 'crop', kind: ['carrot', 'lettuce', 'corn'][(x + y) % 3] }, y * 22 + x);
    hooks.changed();
  });
  await wait(300);
}

await winOn('home');
await page.hover('#btn-project');
await wait(400);
await page.screenshot({ path: 'shots/legacy-1-store.png' });
// the first two landmarks, then the banner for the second
await page.click('#btn-project');
await wait(3200);
await page.click('#btn-project');
await wait(700);
await page.screenshot({ path: 'shots/legacy-2-windmill.png' });
await wait(2600);
await page.click('#btn-project');
await wait(2800);
await page.click('#btn-project');
await wait(2800);
await page.click('#btn-project'); // the fifth: the finale
await wait(2500);
await page.screenshot({ path: 'shots/legacy-3-finale.png' });
await page.click('.dialog button:has-text("Keep Farming")');
await wait(800);
await page.mouse.move(5, 5);
await page.screenshot({ path: 'shots/legacy-4-farm.png' });
// the noon bell
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  hooks.startDay();
  for (let t = 0; t < 29.2; t += 1 / 60) game.update(1 / 60);
  game.events.length = 0;
});
await wait(900);
await page.evaluate(() => { const { game } = window.bk4; for (let t = 0; t < 1; t += 1 / 60) game.update(1 / 60); });
await wait(250);
await page.screenshot({ path: 'shots/legacy-5-bell.png' });
// the other two farms, all five built
for (const map of ['river', 'orchard']) {
  await winOn(map);
  await page.evaluate(() => { const { game, hooks } = window.bk4; while (game.legacy < 5) game.fundLegacy(); game.events.length = 0; hooks.changed(); window.bk4.ui.closeModal?.(); });
  await wait(1500);
  await page.keyboard.press('Escape');
  await wait(400);
  await page.mouse.move(5, 5);
  await page.locator('#game').screenshot({ path: `shots/legacy-6-${map}.png` });
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
