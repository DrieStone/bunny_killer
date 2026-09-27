// Regression check: side dialogs opened while paused must hand back to the Paused dialog.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('bk4.tutorial', 'done'));
const state = () => page.evaluate(() => ({ modal: window.bk4.ui.modalOpen, paused: window.bk4.hooks.paused() }));
const menu = async (m, action) => {
  await page.click(`.mb[data-menu="${m}"]`);
  await page.click(`.mi[data-action="${action}"]`);
  await page.waitForTimeout(100);
};
const out = {};
// farm: pause -> Help -> OK
await page.evaluate(() => { const { game, hooks } = window.bk4; hooks.newGame(); game.place({ type: 'crop', kind: 'carrot' }, 8 * 28 + 13); hooks.startDay(); });
await page.keyboard.press('p');
out.farmPaused = await state();
await menu('help', 'help');
await page.click('.dialog button:has-text("OK")');
out.farmAfterHelp = await state();
await menu('game', 'new');
await page.click('.dialog button:has-text("Cancel")');
out.farmAfterCancel = await state();
await menu('bunny', 'about');
await page.keyboard.press('Escape');
out.farmAfterAbout = await state();
await page.keyboard.press('p');
out.farmResumed = await state();
// classic: menu Pause works, then scores -> OK returns to pause
await page.evaluate(() => window.bk4.hooks.startClassic());
await page.waitForTimeout(200);
await menu('game', 'pause');
out.classicMenuPause = await state();
await menu('game', 'scores');
await page.click('.dialog button:has-text("OK")');
out.classicAfterScores = await state();
await page.keyboard.press('p');
out.classicResumed = await state();
console.log(JSON.stringify(out, null, 1));
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
