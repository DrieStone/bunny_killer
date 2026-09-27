// Play Classic Mode with a bot for a few seconds, then screenshot it and the results.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.click('.dialog button:has-text("Classic Mode")');
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/classic-intro.png' });
await page.click('.dialog button:has-text("Start")');
const box = await page.locator('#game').boundingBox();
let shots = 0;
const t0 = Date.now();
while (Date.now() - t0 < 9000) {
  const t = await page.evaluate(() => {
    const c = window.bk4.classic;
    const x = c && c.targets.find((t) => t.kind !== 'dog' && t.x > 0.5 && t.x < 27.5 && (t.kind !== 'popup' || t.age > 0.15));
    return x && c.reload <= 0 ? { x: x.x + x.vx * 0.03, y: x.y - 0.3 } : null;
  });
  if (t) {
    await page.mouse.click(box.x + (t.x / 28) * box.width, box.y + (t.y / 18) * box.height);
    shots++;
    if (shots === 7) {
      await page.waitForTimeout(60);
      await page.screenshot({ path: 'shots/classic-play.png' });
    }
  }
  await page.waitForTimeout(40);
}
const mid = await page.evaluate(() => { const c = window.bk4.classic; return { score: c.score, hits: c.hits, shots: c.shots, combo: c.bestCombo }; });
await page.evaluate(() => { window.bk4.classic.time = 59.95; });
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/classic-results.png' });
console.log('bot shots', shots, JSON.stringify(mid), errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
