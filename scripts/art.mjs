// Usage: node scripts/art.mjs out.png — blows up chosen sprites on soil and grass for review.
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'shots/art.png';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
const url = await page.evaluate(async () => {
  const m = await import('/src/render/sprites.ts');
  const sp = await m.loadSprites();
  const list = [
    sp.defenses.trapOpen, sp.defenses.trapShut, ...sp.sprinklerSpin, sp.defenses.turret, sp.defenses.scarecrow,
    sp.bunnies.common.frames[0], sp.bunnies.speedy.frames[0], sp.bunnies.digger.frames[0], ...sp.bunnies.fat.frames,
  ];
  const S = 4;
  const pad = 6;
  const w = list.reduce((a, c) => a + c.width + pad, pad);
  const h = Math.max(...list.map((c) => c.height)) + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = w * S;
  cv.height = h * 2 * S;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#6f4a2f';
  ctx.fillRect(0, 0, cv.width, h * S);
  ctx.fillStyle = '#6fb244';
  ctx.fillRect(0, h * S, cv.width, h * S);
  for (const row of [0, 1]) {
    let x = pad;
    for (const c of list) {
      ctx.drawImage(c, x * S, (row * h + h - pad - c.height) * S, c.width * S, c.height * S);
      x += c.width + pad;
    }
  }
  return cv.toDataURL();
});
const fs = await import('node:fs');
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
