// Plays a morning and a day on a touch screen (iPad-sized, then a phone on its side): taps only, a little
// off target the way fingers are. shots/touch-*.png
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const [name, viewport] of [['ipad', { width: 1180, height: 820 }], ['phone', { width: 844, height: 390 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bk4.tutorial', 'done'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.tap('.dialog button:has-text("New Game")');
  await page.waitForTimeout(300);
  await page.tap('.farm-card');
  await page.waitForTimeout(1800);
  const box = await page.locator('#game').boundingBox();
  const at = (tx, ty) => ({ x: box.x + ((tx + 0.5) / 22) * box.width, y: box.y + ((ty + 0.5) / 16) * box.height });
  // pick carrots off the shelf, tap a row of soil
  await page.tap('#seed-items .item:nth-child(3)');
  for (let x = 7; x <= 14; x++) {
    const p = at(x, 7);
    await page.touchscreen.tap(p.x, p.y);
  }
  // put the tool down and tap a crop: the Almanac says what it is
  await page.tap('#seed-items .item:nth-child(3)');
  const q = at(9, 7);
  await page.touchscreen.tap(q.x, q.y);
  await page.waitForTimeout(300);
  const info = await page.locator('#info').innerText();
  const planted = await page.evaluate(() => window.bk4.game.cropCount());
  await page.screenshot({ path: `shots/touch-${name}-plan.png` });
  // start the day and tap at bunnies
  await page.tap('#btn-start');
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const g = window.bk4.game;
    window.bk4.step(8);
    g.events.length = 0;
    // count the shots that land on a bunny
    window.hits = 0;
    const fire = g.fire.bind(g);
    g.fire = (x, y) => {
      if (g.weaponCd[g.weapon] <= 0 && g.bunnyAt(x, y)) window.hits++;
      return fire(x, y);
    };
  });
  let taps = 0;
  for (let n = 0; n < 10; n++) {
    const b = await page.evaluate(() => {
      const g = window.bk4.game;
      const x = g.bunnies.find((k) => !k.dead && g.isSurfaced(k));
      return x ? { x: x.x, y: x.y - 0.3 } : null;
    });
    if (b) {
      // a fingertip lands about 12 screen pixels to the side
      const p = { x: box.x + (b.x / 22) * box.width + 12, y: box.y + (b.y / 16) * box.height };
      await page.touchscreen.tap(p.x, p.y);
      taps++;
    }
    await page.waitForTimeout(500);
  }
  const { hits, kills } = await page.evaluate(() => ({ hits: window.hits, kills: window.bk4.game.roundStats.kills }));
  const fits = box.y + box.height <= viewport.height && box.x + box.width <= viewport.width;
  await page.screenshot({ path: `shots/touch-${name}-day.png` });
  console.log(`${name}: farm ${Math.round(box.width)}x${Math.round(box.height)}${fits ? '' : ' (CUT OFF)'}, planted ${planted},`,
    `almanac "${info.split('\n')[0]}", ${hits}/${taps} taps hit, bonked ${kills}`, errors.length ? `ERRORS: ${errors.join(' | ')}` : 'no page errors');
  await ctx.close();
}
await browser.close();
