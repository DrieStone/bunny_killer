// Plays a day with real mouse/keyboard input and reports what happened.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

await page.click('.dialog button:has-text("New Game")');
await page.waitForTimeout(200);

// tile (tx,ty) -> screen point
const box = await page.locator('#game').boundingBox();
const scr = (tx, ty) => ({ x: box.x + ((tx + 0.5) / 22) * box.width, y: box.y + ((ty + 0.5) / 16) * box.height });

// plant a row of carrots by dragging
await page.keyboard.press('3');
let p = scr(8, 7);
await page.mouse.move(p.x, p.y);
await page.mouse.down();
for (let x = 8; x <= 13; x++) { p = scr(x, 7); await page.mouse.move(p.x, p.y, { steps: 3 }); }
await page.mouse.up();
// a trap
await page.keyboard.press('w');
p = scr(10, 9); await page.mouse.click(p.x, p.y);
// dig up one carrot with right-click
p = scr(13, 7); await page.mouse.click(p.x, p.y, { button: 'right' });
// lettuce bait next to the trap
await page.keyboard.press('2');
p = scr(11, 9); await page.mouse.click(p.x, p.y);
await page.keyboard.press('Escape');

const planned = await page.evaluate(() => {
  const g = window.bk4.game;
  return { credits: g.credits, crops: g.cropCount(), trap: g.tiles.filter((t) => t.structure).length };
});
console.log('planned', JSON.stringify(planned));
await page.screenshot({ path: 'shots/pt-plan.png' });

await page.keyboard.press(' ');
await page.waitForTimeout(300);
console.log('phase after space:', await page.evaluate(() => window.bk4.game.phase));

// hunt bunnies for a while at 2x speed
await page.keyboard.press('f');
let shots = 0;
const t0 = Date.now();
while (Date.now() - t0 < 40000) {
  const phase = await page.evaluate(() => window.bk4.game.phase);
  if (phase !== 'round' && phase !== 'sundown') break;
  const target = await page.evaluate(() => {
    const g = window.bk4.game;
    const b = g.bunnies.find((b) => g.isSurfaced(b) && b.state !== 'exit' && g.weaponCd.sling <= 0);
    return b ? { x: b.x, y: b.y - 0.3 } : null;
  });
  if (target) {
    const q = { x: box.x + (target.x / 22) * box.width, y: box.y + (target.y / 16) * box.height };
    await page.mouse.click(q.x, q.y);
    shots++;
  }
  if (shots === 3) await page.screenshot({ path: 'shots/pt-round.png' });
  await page.waitForTimeout(120);
}
await page.waitForTimeout(3500);
const result = await page.evaluate(() => {
  const g = window.bk4.game;
  return { phase: g.phase, modal: window.bk4.ui.modalOpen, kills: g.roundStats.kills, lost: g.roundStats.cropsLost, fed: g.roundStats.escapedFed, harvest: g.roundStats.harvestTotal, credits: g.credits };
});
console.log('shots', shots, 'result', JSON.stringify(result));
await page.screenshot({ path: 'shots/pt-end.png' });
// continue to day 2 with Enter
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
console.log('after enter:', JSON.stringify(await page.evaluate(() => ({ phase: window.bk4.game.phase, round: window.bk4.game.round, save: !!localStorage.getItem('bk4.save') }))));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
