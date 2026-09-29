// Checks the sidebar at common window sizes: does the Farm Store have to scroll, does the Almanac window
// fit on screen, and does any Almanac entry run past its box? Run from the repo root with the dev server up.
import { chromium } from 'playwright-core';

const SIZES = [[1280, 720], [1440, 789], [1512, 860], [1440, 900], [1728, 1000]];
// early: most of the store still locked. mid: a busy mid-game farm with a market glut.
const STAGES = {
  early: { round: 2, kills: 3, harvest: 100, bucks: 0, plot: 0, project: 0 },
  mid: { round: 17, kills: 300, harvest: 9000, bucks: 2, plot: 1, project: 1 },
};

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let problems = 0;
for (const [w, h] of SIZES) {
  for (const [stage, st] of Object.entries(STAGES)) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await page.goto('http://localhost:5190/', { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('bk4.tutorial', 'done'); });
    await page.reload({ waitUntil: 'networkidle' });
    await page.click('.dialog button:has-text("New Game")');
    await page.click('.farm-card'); // the farm picker: Home Farm
    await page.evaluate((st) => {
      const { game } = window.bk4;
      Object.assign(game, { seed: 4242, round: st.round, credits: 3000, project: st.project });
      if (st.plot) { game.lots = game.lots.map((_, n) => (n % 8) >= 2 && (n % 8) <= 5); for (const i of game.ownedTiles()) game.tilled[i] = 1; }
      Object.assign(game.stats, { kills: st.kills, harvest: st.harvest, bossesBeaten: st.bucks });
      game.glut.carrot = 9;
      if (st.plot) game.order = { who: 'Mrs. Pennywhistle', kind: 'sunflower', want: 14, got: 5, due: st.round + 2, bonus: 170 };
      game.loadSave(game.toSave());
      const r = game.plot;
      const at = (x, y) => y * 22 + x;
      game.place({ type: 'crop', kind: 'carrot' }, at(r.x0, r.y0));
      game.place({ type: 'defense', kind: 'trap' }, at(r.x0 + 1, r.y0));
    }, st);
    await page.waitForTimeout(250);
    const layout = await page.evaluate(() => {
      const sc = document.querySelector('#plan-panel .scroll');
      return { scroll: sc.scrollHeight - sc.clientHeight, bottom: document.getElementById('info-win').getBoundingClientRect().bottom };
    });
    const clipped = [];
    const check = async (label) => {
      await page.waitForTimeout(80);
      const over = await page.evaluate(() => {
        const el = document.getElementById('info');
        const box = el.clientHeight;
        el.style.height = 'auto';
        const need = el.scrollHeight;
        el.style.height = '';
        return need - box;
      });
      if (over > 0) clipped.push(`${label} +${over}px`);
    };
    const tabs = { seeds: ['#seed-items .item'], defense: ['#def-items .item', '#tool-items .item'], weapons: ['#weapon-rows .shoprow'],
      lab: ['#lab-items .item'], farm: ['#farm-tools .item', '#farm-rows .shoprow'] };
    let tallestPage = 0;
    for (const [tab, sels] of Object.entries(tabs)) {
      await page.click(`#store-tabs .tab[data-tab="${tab}"]`);
      await page.waitForTimeout(60);
      tallestPage = Math.max(tallestPage, await page.evaluate(() => {
        const sc = document.querySelector('#plan-panel .scroll');
        return sc.scrollHeight - sc.clientHeight;
      }));
      for (const sel of sels) {
        const n = await page.locator(sel).count();
        for (let k = 0; k < n; k++) {
          const el = page.locator(sel).nth(k);
          await el.hover();
          const name = await el.locator('.name').count() ? (await el.locator('.name').first().textContent()).trim() : sel;
          await check(`${tab}/${name}`);
        }
      }
    }
    layout.scroll = Math.max(layout.scroll, tallestPage);
    for (const id of ['btn-project', 'btn-start']) {
      await page.hover(`#${id}`);
      await check(id);
    }
    const box = await page.locator('#game').boundingBox();
    const spots = await page.evaluate(() => {
      const g = window.bk4.game;
      return [[g.plot.x0, g.plot.y0], [g.plot.x0 + 1, g.plot.y0], [g.plot.x0 + 2, g.plot.y0], [g.burrows[0].x, g.burrows[0].y], [19, 11]];
    });
    for (const [tx, ty] of spots) {
      await page.mouse.move(box.x + ((tx + 0.5) / 22) * box.width, box.y + ((ty + 0.5) / 16) * box.height);
      await check(`tile ${tx},${ty}`);
    }
    const bad = layout.scroll > 0 || layout.bottom > h || clipped.length > 0;
    if (bad) problems++;
    console.log(`${w}x${h} ${stage.padEnd(5)} store scrolls ${String(layout.scroll).padStart(3)}px · almanac ${layout.bottom <= h ? 'on screen' : 'OFF SCREEN'}` +
      ` · ${clipped.length ? `clipped: ${clipped.join(', ')}` : 'no entry clipped'}`);
    await page.close();
  }
}
await browser.close();
console.log(problems ? `${problems} size/stage combos need a look` : 'all good');
