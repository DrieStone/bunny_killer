// Dev-only: every sprite on one page, blown up, for eyeballing the art.
import { drawText } from '../render/pixels';
import { loadSprites } from '../render/sprites';

const sp = await loadSprites();
const items: [string, HTMLCanvasElement][] = [];
for (const [k, b] of Object.entries(sp.bunnies)) b.frames.forEach((f, i) => items.push([`${k} ${i}`, f]));
items.push(['mound', sp.mound], ['dog', sp.dog.stand]);
sp.dog.run.forEach((f, i) => items.push([`dog run ${i}`, f]));
items.push(['seed', sp.seed], ['sprout', sp.sprout]);
for (const [k, c] of Object.entries(sp.crops)) items.push([`${k} young`, c.young], [`${k} ripe`, c.ripe]);
for (const [k, d] of Object.entries(sp.defenses)) items.push([k, d]);
[0, 2, 5, 8, 10, 15].forEach((m) => items.push([`fence ${m}`, sp.fence[m]]));
for (const [k, s] of Object.entries(sp.scenery)) items.push([k, s]);

const S = 3;
const cell = 100 * S;
const perRow = 6;
const canvas = document.getElementById('sheet') as HTMLCanvasElement;
canvas.width = perRow * cell;
canvas.height = Math.ceil(items.length / perRow) * (cell + 10);
const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
items.forEach(([name, img], n) => {
  const x = (n % perRow) * cell;
  const y = Math.floor(n / perRow) * (cell + 10);
  ctx.fillStyle = (n + Math.floor(n / perRow)) % 2 ? '#8d5835' : '#6fb244';
  ctx.fillRect(x, y, cell, cell);
  ctx.drawImage(img, x + 6, y + 6, img.width * S, img.height * S);
  drawText(ctx, name, x + 4, y + cell - 14, '#ffffff', '#000000', 2);
});
(window as unknown as { sheetReady: boolean }).sheetReady = true;
