// Screenshots of 1993 Mode: the title, a farm in the morning, and a day with bunnies about. shots/retro-*.png
// Also times the black-and-white pass per frame.
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
await page.click('.dialog a:has-text("1993 Mode")');
await wait(400);
await page.screenshot({ path: 'shots/retro-1-title.png' });
await page.click('.dialog button:has-text("New Game")');
await page.click('.farm-card');
await wait(1500);
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 9;
  game.credits = 3000;
  game.loadSave(game.toSave());
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  const crops = ['carrot', 'lettuce', 'radish', 'corn', 'sunflower', 'tomato'];
  for (const k of [...crops, 'scarecrow']) game.unlocked.add(k);
  let n = 0;
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    if ((x + y) % 5 === 0) game.place({ type: 'defense', kind: 'scarecrow' }, at(x, y));
    else game.place({ type: 'crop', kind: crops[n++ % 3] }, at(x, y));
  }
  hooks.changed();
});
await wait(600);
await page.screenshot({ path: 'shots/retro-2-morning.png' });
await page.click('#btn-start');
await wait(300);
await page.evaluate(() => { window.bk4.step(14); window.bk4.game.events.length = 0; });
await wait(700);
await page.screenshot({ path: 'shots/retro-3-day.png' });
const ms = await page.evaluate(() => {
  const r = window.bk4.renderer;
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) r.finished();
  return (performance.now() - t0) / 60;
});
console.log(`black and white pass: ${ms.toFixed(2)} ms a frame`);
// and back to color
await page.click('.mb[data-menu="game"]');
await page.click('#mi-mono');
await wait(400);
await page.screenshot({ path: 'shots/retro-4-color.png' });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
