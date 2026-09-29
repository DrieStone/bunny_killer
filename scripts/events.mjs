// Screenshots of the day events: the merchant's cart and deals, the County Fair, hail, and drought. shots/events-*.png
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
await page.evaluate(() => window.bk4.hooks.newGame('normal', 'home'));
await wait(1600);

const morning = (event) => page.evaluate((event) => {
  const { game, hooks } = window.bk4;
  game.round = 11;
  game.credits = 1400;
  Object.assign(game.stats, { kills: 200, harvest: 2600, bossesBeaten: 1 });
  game.loadSave(game.toSave());
  game.event = event;
  game.eventBought = [];
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  for (let x = r.x0; x <= r.x1; x++) game.place({ type: 'crop', kind: x % 2 ? 'carrot' : 'lettuce' }, at(x, r.y0 + 1));
  hooks.changed();
}, event);
const box = await page.locator('#game').boundingBox();
const at = (tx, ty) => ({ x: box.x + ((tx + 0.5) / 22) * box.width, y: box.y + ((ty + 0.5) / 16) * box.height });

// the merchant: a cart by the farm, then its deals
await morning({
  kind: 'merchant',
  offers: [
    { id: 'rare:watermelon', name: 'Watermelon', text: 'Before the store has it, and it stays in the store after.', price: 150 },
    { id: 'soil', name: 'Rich Soil', text: 'The next level of Rich Soil, half price.', price: 125 },
    { id: 'weapon:sling', name: 'Slingshot parts', text: 'The next level of your Slingshot, 40% off.', price: 90 },
  ],
});
const cart = await page.evaluate(() => window.bk4.game.merchantTile());
let p = at(cart % 22, Math.floor(cart / 22));
await page.mouse.move(p.x, p.y);
await wait(700);
await page.screenshot({ path: 'shots/events-1-cart.png' });
await page.mouse.click(p.x, p.y);
await wait(400);
await page.screenshot({ path: 'shots/events-2-merchant.png' });
await page.keyboard.press('Escape');

// the County Fair
await morning({ kind: 'fair', crop: 'carrot' });
await page.hover('#seed-items .item:nth-child(3)');
await wait(500);
await page.screenshot({ path: 'shots/events-3-fair.png' });

// drought
await morning({ kind: 'drought' });
await page.mouse.move(at(11, 4).x, at(11, 4).y);
await wait(500);
await page.screenshot({ path: 'shots/events-4-drought.png' });

// hail
await morning({ kind: 'hail', at: 6 });
await page.evaluate(() => {
  const { game, hooks, step } = window.bk4;
  hooks.startDay();
  step(6.4);
  game.events.length = 0;
});
await wait(400);
await page.screenshot({ path: 'shots/events-5-hail.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
