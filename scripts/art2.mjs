// Close-up of the drawn-in-code crops, defenses and shop icons, on soil and grass: shots/art2.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE ERROR', String(e)));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
const url = await page.evaluate(async () => {
  const m = await import('/src/render/sprites.ts');
  const ic = await import('/src/render/icons.ts');
  const sp = await m.loadSprites();
  const rows = [
    ['sunflower', 'tomato', 'watermelon', 'golden', 'carrot'].flatMap((k) => [sp.crops[k].young, sp.crops[k].ripe]),
    [sp.defenses.thumperUp, sp.defenses.thumperDown, sp.defenses.decoy, sp.defenses.beehive, sp.defenses.turret,
      ...['sling', 'pellet', 'spud', 'hose', 'rocket'].map((k) => ic.weaponIcon(k)),
      ...['soil', 'well', 'stall', 'greenhouse', 'lab'].map((k) => ic.farmIcon(k))],
  ];
  const S = 4;
  const pad = 6;
  const w = Math.max(...rows.map((r) => r.reduce((a, c) => a + c.width + pad, pad)));
  const hs = rows.map((r) => Math.max(...r.map((c) => c.height)) + pad * 2);
  const cv = document.createElement('canvas');
  cv.width = w * S;
  cv.height = hs.reduce((a, b) => a + b, 0) * S * 2;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let y = 0;
  for (const bg of ['#6f4a2f', '#6fb244']) {
    rows.forEach((r, n) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, y * S, cv.width, hs[n] * S);
      let x = pad;
      for (const c of r) {
        ctx.drawImage(c, x * S, (y + hs[n] - pad - c.height) * S, c.width * S, c.height * S);
        x += c.width + pad;
      }
      y += hs[n];
    });
  }
  return cv.toDataURL();
});
fs.writeFileSync(process.argv[2] ?? 'shots/art2.png', Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
