// Screenshot a mid-day scene in each season/weather: shots/season-<name>.png
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
const scenes = [['summer-sunny', 10, 'sunny'], ['fall-rain', 16, 'rain'], ['winter-snow', 24, 'snow'], ['spring-fog', 3, 'fog']];
for (const [name, round, weather] of scenes) {
  await page.evaluate(({ round, weather }) => {
    const { game, hooks } = window.bk4;
    hooks.newGame();
    game.round = round; game.credits = 3000; game.lots = game.lots.map((_, n) => (n % 8) >= 2 && (n % 8) <= 5); for (const i of game.ownedTiles()) game.tilled[i] = 1;
    game.loadSave(game.toSave());
    game.weather = weather;
    const r = game.plot;
    const at = (x, y) => y * 22 + x;
    const crops = ['carrot', 'lettuce', 'pumpkin', 'strawberry', 'corn', 'radish'];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (y === r.y0 && x < r.x0 + 5) game.place({ type: 'defense', kind: 'fence' }, at(x, y));
      else if (x === r.x0 + 2 && y === r.y0 + 3) game.place({ type: 'defense', kind: 'scarecrow' }, at(x, y));
      else if (x === r.x1 - 2 && y === r.y0 + 2) game.place({ type: 'defense', kind: 'turret' }, at(x, y));
      else if (x === r.x1 - 1 && y === r.y1 - 2) game.place({ type: 'defense', kind: 'doghouse' }, at(x, y));
      else if (x === r.x0 + 4 && y === r.y1 - 2) game.place({ type: 'defense', kind: 'sprinkler' }, at(x, y));
      else if ((x + y) % 7 === 0) game.place({ type: 'defense', kind: 'trap' }, at(x, y));
      else game.place({ type: 'crop', kind: crops[(x * 5 + y * 3) % 6] }, at(x, y));
    }
    for (const t of game.tiles) {
      if (t.crop) t.crop.growth = 30;
      if (t.structure && (t.structure.kind === 'turret' || t.structure.kind === 'scarecrow')) { game.upgradeAt(game.tiles.indexOf(t)); game.upgradeAt(game.tiles.indexOf(t)); }
    }
    hooks.startDay();
    window.bk4.step(22);
    game.events.length = 0;
  }, { round, weather });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `shots/season-${name}.png` });
}
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
