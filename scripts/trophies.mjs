// Screenshots of achievements (the pop-up and the list) and the Bunny Guide. shots/trophies-*.png
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('bk4.tutorial', 'done');
  localStorage.setItem('bk4.achievements', JSON.stringify({
    first_bonk: '2026-09-20', bonk_100: '2026-09-21', first_buck: '2026-09-22', golden_1: '2026-09-25', order_1: '2026-09-26', combo: '2026-09-28',
  }));
  localStorage.setItem('bk4.guide', JSON.stringify({
    seen: ['common', 'speedy', 'digger', 'kit', 'fat', 'pothead', 'leaper', 'bandit', 'mutant', 'golden'],
    bonked: { common: 812, speedy: 230, digger: 96, kit: 144, fat: 41, pothead: 25, leaper: 18, bandit: 9, mutant: 3, golden: 4 },
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await wait(600);
await page.screenshot({ path: 'shots/trophies-0-title.png' });
await page.click('.dialog a:has-text("Achievements")');
await wait(400);
await page.screenshot({ path: 'shots/trophies-1-list.png' });
await page.keyboard.press('Escape');
await wait(300);
await page.click('.dialog a:has-text("Bunny Guide")');
await wait(400);
await page.screenshot({ path: 'shots/trophies-2-guide.png' });
await page.keyboard.press('Escape');
await wait(300);
await page.click('.dialog button:has-text("New Game")');
await page.click('.farm-card');
await wait(1800);
await page.evaluate(() => window.bk4.ui.award({ id: 'golden_5', name: 'Gold Rush', text: 'Bonk 5 golden bunnies on one farm.' }));
await wait(500);
await page.screenshot({ path: 'shots/trophies-3-award.png' });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
