// Screenshots of the Daily Farm: the intro, a day in, and the results with the share text. shots/daily-*.png
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
await page.click('.dialog button:has-text("Daily Farm")');
await wait(400);
await page.screenshot({ path: 'shots/daily-1-intro.png' });
await page.click('.dialog button:has-text("Play")');
await wait(2600);
await page.screenshot({ path: 'shots/daily-2-day1.png' });

// farm the ten days quickly with the test bot's habits: plant carrots, fire at whatever's close
await page.evaluate(() => {
  const { game } = window.bk4;
  for (let day = 0; day < 12 && game.phase === 'planning'; day++) {
    for (const i of game.ownedTiles()) if (game.tilled[i] && !game.tiles[i].crop && !game.tiles[i].structure) game.place({ type: 'crop', kind: 'carrot' }, i);
    game.startRound();
    let shot = 0;
    for (let t = 0; t < 120 && game.phase !== 'summary'; t += 1 / 60) {
      game.update(1 / 60);
      if ((shot -= 1 / 60) <= 0 && (game.phase === 'round' || game.phase === 'sundown')) {
        const b = game.bunnies.find((x) => !x.dead && game.isSurfaced(x));
        if (b) game.fire(b.x, b.y - 0.3);
        shot = 0.45;
      }
      if (game.phase === 'harvest') game.finishHarvestNow();
    }
    game.events.length = 0;
    if (game.round >= 10) break;
    game.continueAfterSummary();
  }
});
await wait(600);
await page.keyboard.press('Enter');
await wait(700);
await page.screenshot({ path: 'shots/daily-3-results.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
