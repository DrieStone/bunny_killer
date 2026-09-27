import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.click('.dialog button:has-text("New Game")');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'shots/tut-0.png' });
// plant one carrot -> step 1
const box = await page.locator('#game').boundingBox();
await page.keyboard.press('3');
await page.mouse.click(box.x + (12.5 / 28) * box.width, box.y + (8.5 / 18) * box.height);
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/tut-1.png' });
// help mode balloon over the Scarecrow item
await page.click('.mb[data-menu="help"]');
await page.click('.mi[data-action="balloons"]');
await page.hover('#def-items .item:nth-child(3)');
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/tut-help.png' });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
