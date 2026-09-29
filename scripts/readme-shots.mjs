// The README's screenshots, staged: a busy summer day, the Morning Report, 1993 Mode, and the Farm Legacy.
// Captured at a window where the farm draws at a whole 2x, so every pixel stays even. docs/screenshots/*.png
import { chromium } from 'playwright-core';

const OUT = 'docs/screenshots';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 600 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bk4.tutorial', 'done'); });
await page.reload({ waitUntil: 'networkidle' });
await page.addStyleTag({ content: '#award { display: none !important; }' }); // no achievement pop-ups in the pictures
await wait(500);

/** A well-kept summer farm: more land, a mix of crops, and defenses around them. */
async function stage(map, day) {
  await page.evaluate(([map, day]) => {
    const { game, hooks } = window.bk4;
    hooks.newGame('normal', map);
    game.round = day;
    game.credits = 40000;
    Object.assign(game.stats, { kills: 900, harvest: 30000, bossesBeaten: 3 });
    game.project = 1;
    game.lots = game.lots.map((_, n) => { const x = n % 8; const y = Math.floor(n / 8); return x >= 1 && x <= 6 && y >= 1 && y <= 4; });
    for (const i of game.ownedTiles()) game.tilled[i] = 1;
    game.loadSave(game.toSave());
    for (const u of ['sunflower', 'corn', 'tomato', 'strawberry', 'pumpkin', 'scarecrow', 'sprinkler', 'turret', 'doghouse', 'beehive', 'thumper', 'trap', 'decoy', 'fence']) game.unlocked.add(u);
    game.weather = 'sunny';
    game.event = null;
    const r = game.plot;
    const at = (x, y) => y * 22 + x;
    const crops = ['carrot', 'lettuce', 'corn', 'tomato', 'strawberry', 'sunflower', 'pumpkin', 'radish'];
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const fx = x - r.x0;
        const fy = y - r.y0;
        const edge = fx === 0 || fy === 0 || x === r.x1 || y === r.y1;
        if (edge && (fx + fy) % 6 === 3) game.place({ type: 'defense', kind: 'fence' }, at(x, y));
        else if (fx % 4 === 2 && fy % 3 === 1) game.place({ type: 'defense', kind: ['scarecrow', 'sprinkler', 'turret', 'beehive'][(fx + fy) % 4] }, at(x, y));
        else game.place({ type: 'crop', kind: crops[(fx * 3 + fy * 5) % crops.length] }, at(x, y));
      }
    }
    game.place({ type: 'defense', kind: 'doghouse' }, at(r.x0 + 1, r.y1 - 1));
    game.tiles.forEach((t) => { if (t.crop) t.crop.growth = Math.random() * 60; });
    hooks.changed();
  }, [map, day]);
  await wait(600);
}

/** Start the day and let it run a little, with a few more bunnies of every sort making for the crops. */
async function busyDay(seconds) {
  await page.evaluate((seconds) => {
    const { game, hooks } = window.bk4;
    hooks.startDay();
    window.bk4.step(seconds);
    const r = game.plot;
    const kinds = ['common', 'speedy', 'fat', 'pothead', 'kit', 'leaper', 'common', 'speedy'];
    kinds.forEach((k, n) => {
      const side = n % 4;
      const x = side === 0 ? r.x0 - 1.5 : side === 1 ? r.x1 + 2.5 : r.x0 + 2 + n * 1.3;
      const y = side === 2 ? r.y0 - 1.2 : side === 3 ? r.y1 + 2.2 : r.y0 + 2 + n * 0.7;
      game.spawnAt(k, x, y);
    });
    window.bk4.step(1.2);
    game.events.length = 0;
  }, seconds);
}

// a busy summer day: bunnies everywhere, pebbles flying, fur in the air
await stage('home', 12);
await busyDay(9);
await wait(1600);
for (let n = 0; n < 5; n++) {
  await page.evaluate(() => {
    const { game } = window.bk4;
    const b = game.bunnies.find((x) => !x.dead && game.isSurfaced(x) && x.state !== 'exit');
    if (b) { game.weaponCd[game.weapon] = 0; game.fire(b.x, b.y - 0.3); }
  });
  await wait(90);
}
await page.mouse.move(700, 300);
await wait(150);
await page.screenshot({ path: `${OUT}/day.png` });

// the Morning Report over a morning on River Bend
await stage('river', 16);
await page.evaluate(() => {
  const { game, hooks } = window.bk4;
  game.weather = 'rain';
  game.event = { kind: 'fair', crop: 'carrot' };
  game.order = { who: 'The diner', kind: 'lettuce', want: 12, got: 3, due: 18, bonus: 90 };
  hooks.changed();
});
await wait(400);
await page.click('#btn-report');
await wait(500);
await page.screenshot({ path: `${OUT}/morning-report.png` });
await page.keyboard.press('Enter');

// 1993 Mode, mid-day
await page.evaluate(() => { const { hooks } = window.bk4; hooks.setMonochrome(true); });
await stage('home', 12);
await busyDay(9);
await wait(1600);
await page.mouse.move(700, 300);
await page.screenshot({ path: `${OUT}/1993-mode.png` });
await page.evaluate(() => window.bk4.hooks.setMonochrome(false));

// the Farm Legacy after the win, fireworks going up
await stage('orchard', 40);
await page.evaluate(() => {
  const { game, hooks, renderer } = window.bk4;
  game.project = 3;
  game.stats.sealedOn = 31;
  const s = game.toSave(); s.legacy = 5; game.loadSave(s);
  hooks.changed();
});
await busyDay(6);
await page.evaluate(() => window.bk4.renderer.fireworksFor(20));
await wait(3400);
await page.mouse.move(5, 5);
await page.screenshot({ path: `${OUT}/farm-legacy.png` });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
