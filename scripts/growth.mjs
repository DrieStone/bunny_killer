// Screenshots of growing faster: the day counts on the seed shelf, the Almanac, and a planted crop's ETA. shots/growth-*.png
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
await wait(1800);

// summer, Rich Soil 3: corn and watermelon lose a day, strawberries and tomatoes fruit twice
const morning = async (round, soil, weather) => page.evaluate(([round, soil, weather]) => {
  const { game, hooks } = window.bk4;
  game.round = round;
  game.credits = 3000;
  Object.assign(game.stats, { kills: 400, harvest: 9000, bossesBeaten: 3 });
  game.loadSave(game.toSave());
  game.farm.soil = soil;
  game.weather = weather;
  hooks.changed();
}, [round, soil, weather]);
await morning(10, 3, 'sunny');
await page.click('#store-tabs .tab[data-tab="seeds"]');
await page.hover('#seed-items .item:nth-child(5)'); // corn
await wait(400);
await page.screenshot({ path: 'shots/growth-1-summer-corn.png' });
await page.hover('#seed-items .item:nth-child(7)'); // strawberry
await wait(400);
await page.screenshot({ path: 'shots/growth-2-summer-berry.png' });

// winter with no upgrades: the slow ones go red
await morning(23, 0, 'snow');
await page.hover('#seed-items .item:nth-child(3)'); // carrot
await wait(400);
await page.screenshot({ path: 'shots/growth-3-winter.png' });

// a pumpkin in the ground: when will it be ripe?
await morning(16, 1, 'sunny');
const tile = await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  const r = game.plot;
  const i = (r.y0 + 1) * 22 + r.x0 + 2;
  game.place({ type: 'crop', kind: 'pumpkin' }, i);
  game.tiles[i].crop.growth = 20;
  hooks.changed();
  return { x: r.x0 + 2, y: r.y0 + 1 };
});
const box = await page.locator('#game').boundingBox();
await page.mouse.move(box.x + ((tile.x + 0.5) / 22) * box.width, box.y + ((tile.y + 0.5) / 16) * box.height);
await wait(400);
await page.screenshot({ path: 'shots/growth-4-pumpkin.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
