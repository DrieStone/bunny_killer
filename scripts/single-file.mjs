// After `vite build`, fold the JS and CSS into one self-contained HTML file you can double-click.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/, (_, file) => {
  const js = readFileSync(join(dist, file), 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/, (_, file) => {
  return `<style>${readFileSync(join(dist, file), 'utf8')}</style>`;
});
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('something was left un-inlined');
writeFileSync(join(dist, 'bunny-killer-4.html'), html);
console.log(`wrote dist/bunny-killer-4.html (${(html.length / 1024).toFixed(0)} KB)`);
