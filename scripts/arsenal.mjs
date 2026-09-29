// Screenshots of the store tabs, the weapons in action, and the new bunnies: shots/arsenal-*.png
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bk4.tutorial', 'done'); });
await page.reload({ waitUntil: 'networkidle' });
await wait(500);
await page.click('.dialog button:has-text("New Game")');
await wait(300);

// a well-off mid-game farm with a bit of everything
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  Object.assign(game, { seed: 77, round: 17, credits: 6000, project: 1 });
  game.lots = game.lots.map(() => true); for (const i of game.ownedTiles()) game.tilled[i] = 1;
  Object.assign(game.stats, { kills: 420, harvest: 9000, bossesBeaten: 2 });
  game.loadSave(game.toSave());
  game.weapons = { sling: 3, pellet: 2, spud: 2, hose: 1, rocket: 1 };
  game.farm.soil = 2;
  game.hybrid.carrot = 2;
  game.hybrid.pumpkin = 1;
  game.newUnlocks = ['rocket', 'upgrade4', 'watermelon'];
  const r = game.plot;
  const at = (x, y) => y * 22 + x;
  const crops = ['carrot', 'tomato', 'sunflower', 'pumpkin', 'corn', 'strawberry', 'lettuce'];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const k = (x - r.x0) + (y - r.y0) * 10;
    if ((x - r.x0) % 4 === 1 && (y - r.y0) % 4 === 1) game.place({ type: 'defense', kind: 'turret' }, at(x, y));
    else if ((x - r.x0) % 4 === 3 && (y - r.y0) % 4 === 3) game.place({ type: 'defense', kind: k % 2 ? 'beehive' : 'thumper' }, at(x, y));
    else if (x === r.x0 && y === r.y1) game.place({ type: 'defense', kind: 'decoy' }, at(x, y));
    else if (y === r.y0 && x > r.x0 + 5) game.place({ type: 'defense', kind: 'fence' }, at(x, y));
    else if ((x + y) % 9 === 0) game.place({ type: 'defense', kind: 'trap' }, at(x, y));
    else game.place({ type: 'crop', kind: crops[(x * 3 + y) % crops.length] }, at(x, y));
  }
  for (const t of game.tiles) if (t.crop) t.crop.growth = 40;
  for (let i = 0; i < game.tiles.length; i++) {
    const s = game.tiles[i].structure;
    if (s && s.kind === 'turret') { s.level = 3; s.hp = 20; }
    if (s && s.kind === 'fence') s.level = 4;
  }
  hooks.changed();
});
for (const tab of ['weapons', 'lab', 'farm']) {
  await page.click(`#store-tabs .tab[data-tab="${tab}"]`);
  if (tab === 'weapons') await page.hover('#weapon-rows .shoprow:nth-child(3)');
  if (tab === 'lab') await page.hover('#lab-items .item:nth-child(3)');
  if (tab === 'farm') await page.hover('#farm-rows .shoprow:nth-child(1)');
  await wait(350);
  await page.screenshot({ path: `shots/arsenal-tab-${tab}.png` });
}

// a day with the new crowd: pot-heads, leapers, bandits, kits, burrowers
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.wave = [];
  const kinds = ['pothead', 'leaper', 'bandit', 'kit', 'digger', 'common', 'speedy', 'pothead', 'leaper', 'digger', 'bandit'];
  kinds.forEach((kind, n) => game.wave.push({ at: 0.4 + n * 0.5, kind, burrow: n % game.burrows.length }));
  hooks.startDay();
  window.bk4.step(6.5);
  game.events.length = 0;
});
const box = await page.locator('#game').boundingBox();
const at = (tx, ty) => ({ x: box.x + (tx / 22) * box.width, y: box.y + (ty / 16) * box.height });
// a potato into a crowd, and a firework
await page.evaluate(() => {
  const { game } = window.bk4;
  const b = game.bunnies.find((x) => game.isSurfaced(x)) ?? { x: 11, y: 7 };
  game.selectWeapon('spud');
  game.fire(b.x, b.y - 0.3);
});
await wait(260);
await page.evaluate(() => {
  const { game } = window.bk4;
  game.selectWeapon('rocket');
  game.fire(8, 5);
});
let p = at(14, 9);
await page.mouse.move(p.x, p.y);
await wait(700);
await page.screenshot({ path: 'shots/arsenal-day.png' });

// the hose, held down
await page.evaluate(() => window.bk4.game.selectWeapon('hose'));
p = at(12, 8);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
await wait(600);
await page.screenshot({ path: 'shots/arsenal-hose.png' });
await page.mouse.up();

// winter: snow hares
await page.evaluate(() => {
  const { game, hooks, step } = window.bk4;
  step(60);
});
await wait(1500);
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  if (game.phase === 'harvest') game.finishHarvestNow();
});
await wait(500);
await page.keyboard.press('Enter');
await wait(300);
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.round = 23;
  game.loadSave(game.toSave());
  game.weather = 'snow';
  game.wave = game.wave.filter((w) => w.kind === 'snowhare' || w.kind === 'common').slice(0, 14);
  hooks.startDay();
  window.bk4.step(8);
  game.events.length = 0;
});
await wait(900);
await page.screenshot({ path: 'shots/arsenal-winter.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
