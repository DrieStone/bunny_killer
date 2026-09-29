// Screenshots of the Scouting Report: the store's box, its hover in the Almanac, and the full morning report,
// on a rainy fall day with a County Fair and an order from town. shots/report-*.png
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
await page.click('.farm-card');
await wait(1500);
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 16;
  game.credits = 2500;
  Object.assign(game.stats, { kills: 400, harvest: 6000, bossesBeaten: 2 });
  game.loadSave(game.toSave());
  game.weather = 'rain';
  game.event = { kind: 'fair', crop: 'carrot' };
  game.order = { who: 'The diner', kind: 'lettuce', want: 12, got: 3, due: 18, bonus: 90 };
  game.wanted.pumpkin = 4;
  game.glut.corn = 9;
  game.farm.soil = 1;
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  game.place({ type: 'defense', kind: 'sprinkler' }, at(r.x0 + 1, r.y0 + 1));
  hooks.changed();
});
await wait(500);
await page.screenshot({ path: 'shots/report-1-store.png' });
await page.hover('#scout-box .forecast');
await wait(400);
await page.screenshot({ path: 'shots/report-2-hover.png' });
await page.click('#btn-report');
await wait(500);
await page.screenshot({ path: 'shots/report-3-full.png' });
const fit = await page.evaluate(() => { const d = document.querySelector('.dialog'); return d.scrollHeight - d.clientHeight; });
console.log(`full report ${fit > 0 ? `scrolls ${fit}px` : 'fits'} at 1440x900`);
await page.keyboard.press('Enter');
await wait(300);
// today's best seeds are starred on the shelf, and the Almanac says what a tile earns
const starred = await page.evaluate(() => [...document.querySelectorAll('#seed-items .item.best')].map((e) => e.dataset.key));
console.log('starred:', starred.join(', '));
await page.hover('#seed-items .item.best');
await wait(300);
await page.screenshot({ path: 'shots/report-4-shelf.png' });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
