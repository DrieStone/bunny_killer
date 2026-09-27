// Generate sprites listed in assets/sprites/manifest.json through the sprite-gen skill.
// Skips anything already on disk, so re-running never re-spends. Usage:
//   node scripts/gen-sprites.mjs [--only name1,name2] [--dry-run]
// A manifest entry's "ref" may be "@other/name" to use that sprite's id as the style reference
// (keeps a bunny's poses looking like the same bunny).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const dry = args.includes('--dry-run');
const manifest = JSON.parse(readFileSync('assets/sprites/manifest.json', 'utf8'));
const idOf = (name) => JSON.parse(readFileSync(`assets/sprites/${name}.sai.json`, 'utf8')).id;

let spent = 0;
for (const it of manifest) {
  if (only && !only.has(it.name)) continue;
  const out = `assets/sprites/${it.name}`;
  if (existsSync(`${out}.png`)) continue;
  const flags = ['gen', it.prompt, '--type', it.type ?? 'item', '--size', String(it.size ?? 32), '--out', out];
  if (it.camera) flags.push('--camera', it.camera);
  if (it.direction) flags.push('--direction', it.direction);
  if (it.ref) flags.push('--ref', it.ref.startsWith('@') ? idOf(it.ref.slice(1)) : it.ref);
  if (dry) flags.push('--dry-run');
  try {
    const res = execFileSync('scripts/sprite.sh', flags, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const ok = res.split('\n').find((l) => l.startsWith('OK'));
    console.log(ok ?? `${it.name}: ${dry ? 'dry-run' : res.trim().split('\n').pop()}`);
    if (ok) spent++;
  } catch (e) {
    console.log(`FAIL ${it.name}: ${(e.stderr || e.message).toString().trim().split('\n').pop()}`);
  }
}
console.log(`generated ${spent} sprite(s)`);
