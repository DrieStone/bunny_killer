# Bunny Killer 4 — Design (v0.2)

> *It's been years since the asteroid. The bunnies never left… and some of them glow.*

BK4 continues Bunny Killer 3 (1994, Modified Environments). You're the farmer, but you never appear on
screen. You're the hand that plants and builds, and you fire the sling in first person, as in the old
games. It's a farming sim combined with a tower defense game, plus the original shooting gallery as
Classic Mode.

## Core loop (one round = one growing day)

1. **Plan** (no time limit). Buy seeds and plant them. Buy defenses, place them, and upgrade them.
   Expand your land, repair damage, and upgrade your sling. The Scouting Report shows the weather,
   which burrows the bunnies will come from, and how many of each kind are coming.
2. **Defend** (60 s). Crops grow while bunnies arrive from burrows at the map edge. Each bunny walks to
   the crop it likes best, eats until it's full, and runs home. Your defenses act on their own, and you
   click bunnies to hit them with your sling. A hit makes the bunny vanish in a **poof of fur**.
3. **Sundown**. Any bunnies still on the field run off.
4. **Harvest**. Every ripe crop sells for credits (¢). Its price scales with how much of it is left and
   with the season. Crops that haven't finished growing stay in the ground for next round.
5. **Breeding**. Every bunny that got home with a full belly means one more bunny next round.

The game is **endless**. Your score is your lifetime harvest. A run ends when you go bust (no crops in
the ground and not enough credits for a seed, counting what your defenses would sell for) or when you
**retire the farm** (Game menu, planning only). Finished runs go on a top-ten high score table.

## Calendar: seasons and weather

A year is 28 days: seven each of spring, summer, fall, and winter.

| Season | Growth | Sell price | Bunnies | Look |
|--------|-------:|-----------:|--------:|------|
| Spring | ×1.00 | ×1.00 | ×1.0 | fresh green |
| Summer | ×1.15 | ×1.00 | ×1.1 | warm green |
| Fall   | ×0.95 | ×1.25 | ×1.0 | gold and russet trees, falling leaves |
| Winter | ×0.80 | ×1.20 | ×0.8 | snow, frosted trees |

Each day rolls its weather from the season's odds. Day 1 is always sunny.

| Weather | Effect |
|---------|--------|
| Sunny | none |
| Rain | crops grow +30%, bunnies move at 85% speed |
| Fog | 20% more bunnies |
| Snow (winter) | crops grow ×0.85, bunnies move at 90% speed |

## Crops

| Crop       | Seed | Grows | Sells | Toughness | Bunny appeal      |
|------------|-----:|------:|------:|----------:|-------------------|
| Radish     |   4¢ |   30s |    9¢ |         3 | low: bunnies mostly ignore it |
| Lettuce    |   6¢ |   40s |   15¢ |         4 | **very high**: good bait |
| Carrot     |  10¢ |   50s |   25¢ |         5 | high              |
| Corn       |  16¢ |   75s |   48¢ |         7 | medium: takes 2 days, or 1 next to a sprinkler |
| Strawberry |  24¢ |   45s |   19¢ |         5 | high: **perennial**, regrows after each harvest (5 harvests) |
| Pumpkin    |  28¢ |  110s |   90¢ |        12 | medium: takes 2 days |

A partly eaten crop sells for less. A crop eaten down to zero is gone.

## Defenses

Defenses are placed on plot tiles, so every one you place costs you a tile you could have planted.
They stay between rounds, wear down as bunnies chew them, and can be repaired, sold, or **upgraded**
twice (★★). Each level adds 18% range, is 15% faster, adds 25% longer effects, gives 60% more
sturdiness, and adds +1 damage for the turret, the trap, and the dog. The first upgrade costs the
defense's price; the second costs 1.6× that.

| Defense      | Cost | What it does |
|--------------|-----:|--------------|
| Fence        |   6¢ | Blocks the tile. Bunnies go around it or chew through it. |
| Snap Trap    |  15¢ | Hidden from bunnies. 3 damage when stepped on, then re-arms in 5 s. |
| Scarecrow    |  25¢ | Every 2.5 s, scares nearby bunnies off their food and away from it. A startled crow flies off. |
| Sprinkler    |  30¢ | Knocks bunnies back and soaks them so they move at half speed. Crops nearby grow 40% faster. |
| Sling Turret |  45¢ | Fires pebbles automatically at bunnies in range. |
| Dog          |  60¢ | Chases and bites bunnies. It's tied to its doghouse by a leash. |

## Bunnies

| Bunny          | First day | Notes |
|----------------|----------:|-------|
| Common         | 1 | Brown and hungry. |
| Jackrabbit     | 2 | Sandy colored. Fast, and eats less before heading home. |
| Burrower       | 3 | Slate gray. Tunnels under fences and traps. It can only be hit when it comes up to eat. |
| Chonk          | 4 | Tough, slow, and eats a lot. A trap won't finish it. |
| Asteroid Buck  | every 5th | Boss. Glows green, crawls out of the crater, ignores scarecrows and sprinklers. Pays a 40¢ bounty. |

The number of bunnies grows every day, scaled by season and weather. Each well-fed escapee adds another,
up to 25. After day 6 bunnies get tougher, and they get a little faster over time.

## Sling (you)

Click a bunny to hit it. The sling needs a moment to reload between shots. Upgrades are Oak Sling
(faster reload) and Steel Shot (2 damage per hit).

## Classic Mode

The original Bunny Killer shooting gallery, on the farm, from the title screen:
- **Time:** sixty seconds.
- **Targets:** bunnies race across the field and pop out of burrows.
- **Points:** bunny 10, jackrabbit 25, chonk 30 (three hits), pop-up 15, golden bunny 100.
- **Combos:** five hits in a row doubles your points, ten triples them, and twenty quadruples them.
  A miss resets the combo.
- **The dog:** don't hit it (−50).

It keeps its own best score.

## Look, sound, and help

- **Art:** the sprites were generated with sprite-ai.art under one shared style file (`sprite-style.md`),
  then cleaned up by `scripts/process-sprites.py`. That script trims them, removes the generator's cast
  shadows and stray pixels, recolors odd soil, and palette-swaps the jackrabbit, burrower, and golden
  bunny from the brown bunny's 8-frame hop animation.
- **Drawn in code:** the ground is textured and dithered, with grass tufts, clover, wildflowers, and a
  dirt path. Fences are also drawn in code, as is the seasonal foliage (fall and winter recolors of the
  trees).
- **Lighting and life:** soft shadows, drifting cloud shadows, a golden afternoon, a violet sundown, and
  a blue evening with lamplit farmhouse windows. There are butterflies, chimney smoke, pond sparkles,
  and the crater's glow.
- **Interface:** **classic System 7**, with a menubar, striped title bars, rounded buttons, Geneva type
  with double-struck bold, and Chicago-style logo lettering. **Balloon Help** runs the first-game
  tutorial, and Help › Show Balloons explains anything you point at.
- **Sound:** synthesized sound effects and a four-track chiptune score (morning, day, boss, title),
  each separately mutable.
- **Saving:** progress autosaves in the browser (localStorage).

## Not yet (ideas for later)

Water, fertilizer, and more maps. Online leaderboards and daily seeds. A black-and-white "Classic Mac"
art mode. More bunny types (e.g. a ninja bunny that dodges pebbles). Defense synergies. A proper
ending, such as a final asteroid storm at the end of year 3.
