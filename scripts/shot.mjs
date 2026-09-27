// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [js-to-run-before-shot]
import { chromium } from 'playwright-core';

const [url, out, w = '1400', h = '900', script] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
if (script) {
  const result = await page.evaluate(script);
  if (result !== undefined) console.log('script result:', JSON.stringify(result));
  await page.waitForTimeout(300);
}
await page.screenshot({ path: out });
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
