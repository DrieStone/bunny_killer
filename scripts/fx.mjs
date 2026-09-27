import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.click('.dialog button:has-text("New Game")');
const box = await page.locator('#game').boundingBox();
const scr = (tx, ty) => ({ x: box.x + ((tx + 0.5) / 28) * box.width, y: box.y + ((ty + 0.5) / 18) * box.height });
await page.evaluate(() => {
  const { game } = window.bk4;
  game.credits = 500;
  const at = (x, y) => y * 28 + x;
  for (let x = 11; x <= 16; x++) game.place({ type: 'crop', kind: 'carrot' }, at(x, 9));
  game.place({ type: 'defense', kind: 'sprinkler' }, at(12, 7));
  game.place({ type: 'defense', kind: 'turret' }, at(15, 7));
});
await page.waitForTimeout(1800); // let the banner fade
await page.keyboard.press('e');
let p = scr(13, 11);
await page.mouse.move(p.x, p.y);
await page.waitForTimeout(250);
await page.screenshot({ path: 'shots/fx-ghost.png', clip: { x: box.x + box.width * 0.3, y: box.y + box.height * 0.25, width: box.width * 0.4, height: box.height * 0.5 } });
// hover the expand button to preview land
await page.keyboard.press('Escape');
await page.hover('#btn-expand');
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/fx-expand.png' });
// start, run to late afternoon, click a bunny and capture the poof
await page.keyboard.press(' ');
await page.evaluate(() => window.bk4.step(20));
let snapped = false;
for (let k = 0; k < 200 && !snapped; k++) {
  const t = await page.evaluate(() => {
    const g = window.bk4.game;
    const b = g.bunnies.find((b) => g.isSurfaced(b) && b.x > 8 && b.x < 20 && b.y > 4 && b.y < 14);
    return b ? { x: b.x, y: b.y - 0.3 } : null;
  });
  if (t) {
    const q = { x: box.x + (t.x / 28) * box.width, y: box.y + (t.y / 18) * box.height };
    await page.mouse.click(q.x, q.y);
    await page.waitForTimeout(90);
    await page.screenshot({ path: 'shots/fx-poof.png', clip: { x: q.x - 150, y: q.y - 110, width: 300, height: 200 } });
    snapped = true;
  } else {
    await page.evaluate(() => window.bk4.step(0.25));
    await page.waitForTimeout(20);
  }
}
await page.evaluate(() => window.bk4.step(Math.max(0, 57 - window.bk4.game.time)));
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/fx-dusk.png' });
console.log('snapped', snapped, errors.join('\n'));
await browser.close();
