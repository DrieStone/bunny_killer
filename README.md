# Bunny Killer 4 (prototype)

A farm sim and tower defense game, following Bunny Killer II (1993) and Bunny Killer 3 (1994) for the Mac.
Plant crops, set up and upgrade defenses, bonk bunnies with your sling, and harvest at sundown, through
seasons and weather. The store opens up as you play. Crop prices move with the market. To win, fund the
Crater Project and survive The Last Night; that opens Hard Mode. Classic Mode brings back the original
shooting gallery. The full design is in [DESIGN.md](DESIGN.md).

## Play

```sh
npm install
npm run dev          # then open http://localhost:5190
```

Note: this shell exports `NODE_ENV=production`. The npm scripts override it where needed, so run things
through `npm run …` rather than calling `npx vite` directly. Otherwise the dev-only debug hooks are missing.

Build:

```sh
npm run build          # static site in dist/ (serve it from any web server, MAMP included)
npm run build:single   # also writes dist/bunny-killer-4.html, one file you can double-click or send to someone
```

There's no server side: the game is plain HTML, JavaScript and inlined pixel art (about 400 KB), and saves
live in the browser's localStorage. `dist/` works on any static host. Browsers won't run `dist/index.html`
straight from disk (they block its script over `file://`), which is what the one-file build is for.

## Controls

| | |
|---|---|
| Click / drag on your land | place the selected seed or defense (crops, fences and the hoe paint along a drag) |
| `H` / `L` | the hoe (till grass so crops can grow) / buy land (click a lot for sale, or drag across several) |
| `B` | a smoke bomb: click the crater and an Asteroid Buck comes out today (after your first Buck) |
| Right-click | dig up a crop or sell a defense (full refund for anything bought today) |
| `1`–`9`, `0` | seeds, in store order (planning) |
| `1`–`5`, mouse wheel | switch weapons (during the day) |
| `Q W E R T Y`, `A S D` | defenses: fence, snap trap, scarecrow, sprinkler, sling turret, dog, thumper, decoy, beehive |
| `X` / `U` / `Esc` | dig-up/sell tool / upgrade tool / put the tool down |
| `Space` | start the day (planning), pause (during the day) |
| `Enter` / `Esc` | when the **All clear!** box is up: skip to sundown / keep watching |
| Click a bunny | fire (hold for the pellet gun and hose); click a dirt mound to startle a Burrower out |
| `F` / `M` / `N` | day speed 1×/2×/4× / sound / music |

## Development

```sh
npm test                                       # headless rules tests (pathfinding, economy, unlocks, the Crater Project, market, saves)
BALANCE=1 SEED=7 npm test -- tests/balance.test.ts   # 70-day campaigns for four bot skill levels (SEED, DAYS=n, HARD=1)
npm run typecheck
```

- Balance numbers (crops, defenses, upgrades, bunnies, seasons, weather, prices) are all in `src/config.ts`.
- `http://localhost:5190/sprites.html` shows every sprite blown up, for art work.
- In dev builds, `window.bk4` exposes `game`, `ui`, `hooks`, and `step(seconds)` for poking at the game from the console.
- Scripts that drive the game in headless Chrome and write screenshots to `shots/` (run them from the repo root while the dev server is up):
  - `scripts/tour.mjs`: the main screens, at Retina scale
  - `scripts/progress.mjs`: unlocks, the Crater Project, the Last Night, and the Year 2 bunnies
  - `scripts/art.mjs`: a sprite close-up
  - `scripts/sidebar-fit.mjs`: at five common window sizes, checks that the store fits and that no Almanac entry is cut off
  - `scripts/arsenal.mjs`: the store tabs, weapons in action, and the new bunnies
  - `scripts/art2.mjs`: a close-up of the crops, defenses, and shop icons drawn in code
  - `scripts/modes.mjs`: the All clear! box, Repair All, and Hard Mode (title, intro, a hard morning, the victory screen)
  - `scripts/smoke.mjs`: the smoke bomb: aiming at the crater, the smoke, and the Buck it brings out
  - also `scripts/shot.mjs`, `playtest.mjs`, `fx.mjs`, `seasons.mjs`, `classic.mjs`, and `burrows.mjs`

## Art pipeline

The sprites come from sprite-ai.art through the `sprite-gen` skill. It uses the shared style in
`sprite-style.md` and your `SPRITE_AI_KEY`, which `scripts/sprite.sh` reads from `~/.zshrc`.

```sh
node scripts/gen-sprites.mjs --dry-run      # what would be generated from assets/sprites/manifest.json
node scripts/gen-sprites.mjs --only NAME    # generate one (it skips anything already on disk)
python3 scripts/process-sprites.py          # raw assets/sprites/ -> game-ready src/art/sprites/
```

Don't set `reference_asset_id`. On sprite-ai.art it copies the reference image's content, not just its
style. The raw generations live in `assets/sprites/` and the rejected takes in `assets/rejects/`.

## Layout

```
src/
  config.ts        every tunable number
  game.ts          rules and state machine (no DOM, so it runs in tests)
  sim/bunnies.ts   bunny AI: seek, eat, chew, spooked, flee
  sim/defenses.ts  traps, scarecrows, sprinklers, turrets, dogs, pebbles
  path.ts          grid Dijkstra
  world.ts         map layout, the grid of lots, scenery, burrows
  classic.ts       Classic Mode rules (the shooting gallery)
  render/          sprite loading, the renderer (ground, lighting, weather), particles, pixel font
  art/sprites/     processed sprites (generated by scripts/process-sprites.py)
  ui/ui.ts         System 7 chrome: menubar, Farm Store, Almanac, dialogs
  ui/balloons.ts   Balloon Help and the first-game tutorial
  audio.ts         synthesized sound effects (WebAudio, no files)
  music.ts         the chiptune sequencer and its four songs
  save.ts          localStorage autosave and best score
```
