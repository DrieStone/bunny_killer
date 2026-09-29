# Bunny Killer 4 — Design (v0.5)

> *It's been years since the asteroid. The bunnies never left… and some of them glow.*

BK4 continues Bunny Killer 3 (1994, Modified Environments). You're the farmer, but you never appear on
screen. You're the hand that plants and builds, and you fire the sling in first person, as in the old
games. It's a farming sim combined with a tower defense game, plus the original shooting gallery as
Classic Mode.

## Core loop (one round = one growing day)

1. **Plan** (no time limit). Buy seeds and plant them. Buy defenses, place them, and upgrade them.
   Expand your land, repair damage (Repair All, in the Defense tab), and upgrade your weapons. The Scouting Report shows the weather,
   which burrows the bunnies will come from, and how many of each kind are coming.
2. **Defend** (60 s). Crops grow while bunnies arrive from burrows at the map edge. Each bunny walks to
   the crop it likes best, eats until it's full, and runs home. Your defenses act on their own, and you
   click bunnies to hit them with your sling. A hit makes the bunny vanish in a **poof of fur**. Once
   every bunny is out of the ground and dealt with, an **All clear!** box offers to skip to sundown: the
   rest of the day runs at 8×, so the crops grow just the same. (Game › Always Skip When All Clear makes it
   automatic.) A Buck or a Bandit running off with a crop still counts as something to fight.
3. **Sundown**. Any bunnies still on the field run off.
4. **Harvest**. Every ripe crop sells for credits (¢). Its price scales with how much of it is left, the
   season, and the market. Crops that haven't finished growing stay in the ground for next round. The
   coins count up in about two and a half seconds, however big the farm is.
5. **Breeding**. Every bunny that got home with a full belly means one more bunny next round.

The map is 22×16 tiles. The middle of it (16×12) is farmland: a grid of 48 **lots** of 2×2 tiles. The
wild country around the lots, with trees, the pond, the crater and the burrows, is where the bunnies live.
The day runs at 1×, 2×, or 4× speed (F).

## Land

You start with the eight lots in the middle (an 8×4 patch), already tilled. From Day 2 you can buy more
with **Buy Land** (the Farm tab, `L`): click a lot, or drag to buy a strip. Any lot is for sale, next to
yours or not, and each one costs a little more than the last: 28¢, 34¢, 42¢, 50¢, 60¢, and so on up to
about 1,200¢ for the last one, about 18,300¢ for the whole farm.

New land comes as grass. **Defenses can go straight onto grass.** Crops need tilled soil, so you prep the
ground first with the **hoe** (`H`, 2¢ a tile; drag to till a row). Tilled soil stays tilled. That lets you
lay a farm out your way: fields of soil with grass lanes and outposts of defenses.

During planning, land that isn't yours is darkened, and lots for sale get a dotted outline. With Buy Land
in hand, the lot under the mouse lights up with its price.

## The goal: seal the crater

You win by funding the three stages of the **Crater Project** (a button at the top of the Farm Store).
Each stage is locked until you've beaten enough Asteroid Bucks. One Buck comes on the last day of every
season.

| Stage | Cost | Needs | |
|-------|-----:|------:|---|
| Survey the Crater | 1,500¢ | 1 Buck | stakes and string around the rim |
| Pour the Ring | 5,000¢ | 2 Bucks | a concrete collar around the hole |
| Cap the Crater | 10,000¢ | 4 Bucks | starts **The Last Night** today |

**Smoke Bombs** (Farm tab, `B`, 250¢, after your first Buck) let you fight a Buck on your own schedule
instead of waiting for the end of the season. Pick one and click the crater in the morning: it goes in with
a *fwoomp*, the crater smokes until the Buck climbs out, and the Scouting Report shows it coming. Beating it
counts toward the Crater Project like any Buck. One a day, and not on a day a Buck is coming anyway or on the
Last Night. For a farm that has the money, the calendar is no longer what holds it back.

Every stage **angers the crater**: waves are 12% bigger per stage, two extra bunnies per stage come
straight out of the crater, and Bucks have 25% more health per stage. The crater's glow grows with it.

**The Last Night** is a boss rush at night: a 25% bigger wave with three Asteroid Bucks (four in Hard Mode). The world goes
moonlit blue, and a lantern follows your aim. Bonk every one before dawn and the crater is sealed: you
win. If any Buck survives, the cap cracks. You go back to stage two, and re-capping costs 35% of the price.

A run also ends if you go bust (no crops in the ground and not enough credits for a seed, counting what
your defenses would sell for) or **retire the farm** (Game menu, planning only). The top-ten high score
table ranks farms that sealed the crater first, fastest on top, and the rest by lifetime harvest.

With the current numbers, the test bots (three seeds, six seeded replays each) play like this:
- **Sharp:** seals the crater every time, on day 30–36.
- **Decent:** every time, on day 30–37.
- **Casual:** on day 33–40, and goes bust about one run in eighteen.

## Hard Mode

Sealing the crater opens **Hard Mode** (on the title screen, and on the victory screen). Prices, crops, and
the Crater Project are the same. The pressure isn't:
- 30% more bunnies every day.
- Regular bunnies are 10% tougher, so a plain bunny needs two hits a couple of days sooner. Bucks are 35%
  tougher.
- The crater gets angry 50% faster with every stage.
- Year 2's bunnies come in Year 1: Pot-Heads from day 8, Leapers day 9, Bandits day 12, Ninjas day 16,
  and Queens day 23.
- The Last Night brings four Asteroid Bucks.

The window title says "(Hard)". Hard wins are marked HARD on the high score table and rank ahead of
normal ones. The bots: sharp seals it in 16 of 18 runs (day 32–42), decent in 13, casual in 5.

## Unlocks

The store starts with radish, lettuce, carrot, fence, snap trap, and the slingshot. Everything else
opens through milestones, so something new arrives most days. Locked items show what they need. The next
morning's banner, NEW badges, and a dot on the store tab announce what opened.

| Opens at | What |
|----------|------|
| Day 3 | Scarecrow, Sunflower |
| Day 4 | Thumper, Rich Soil |
| 250¢ harvested | Corn |
| 40 bonks | Pellet Gun |
| Day 2 | Buying land |
| Day 6 | Carrot Decoy |
| 50 bonks | Sprinkler |
| Day 7 | Spud Gun |
| 1,000¢ harvested | ★★ upgrades |
| Day 8 | Strawberry |
| 1,500¢ harvested | the Seed Lab |
| 80 bonks | Sling Turret |
| Day 10 | Tomato, Garden Hose |
| 2,500¢ harvested | Market Stall |
| Day 12 | Beehive |
| 4,000¢ harvested | Well Pump |
| Day 15 | Pumpkin |
| 250 bonks | Dog |
| 6,000¢ harvested | ★★★ upgrades |
| 1 Buck | Smoke Bombs |
| 2 Bucks | Firework Launcher, ★★★★ upgrades |
| Day 18 | Watermelon |
| Day 20 | Greenhouse |
| 3 Bucks | ★★★★★ upgrades, Golden Carrot |

## The market

Every crop has a daily price, from 70% to 140% of normal. It wanders overnight and is pulled back
toward normal. The store shows tonight's price next to each seed, with an arrow when it's up or down.

An evening's harvest sells 15 of one crop at full price. After that, each one knocks 2% off, down to 55%.
The market remembers 40% of what you sold the next day, so a field of nothing but carrots keeps selling
cheap. Mixing crops keeps prices up.

It works the other way too: town misses what you haven't brought it. Each evening an unlocked crop goes
unsold, it fetches 5% more, up to +40% after eight evenings. Sell even one and it's back to normal. The
Almanac says how long it's been ("Nobody's sold carrots in town for 4 days: +20% tonight"), and the price
next to the seed goes up with it. So it pays to rotate: let the carrots rest a few days, then cash in.

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

| Crop          | Seed | Grows | Sells | Toughness | Notes |
|---------------|-----:|------:|------:|----------:|-------|
| Radish        |   4¢ |   30s |    9¢ |  3 | Bunnies mostly ignore it. |
| Lettuce       |   6¢ |   40s |   15¢ |  4 | **Very high** bunny appeal: good bait. |
| Carrot        |  10¢ |   50s |   25¢ |  5 | High appeal. |
| Sunflower     |  12¢ |   55s |   24¢ |  6 | Bunnies won't touch it unless nothing else is left. |
| Corn          |  16¢ |   68s |   48¢ |  7 | Two days; one at +13% growth. |
| Tomato        |  20¢ |   50s |   17¢ |  5 | **Perennial**: six fruits, one more every 36s of growth. |
| Strawberry    |  24¢ |   45s |   19¢ |  5 | **Perennial**: five fruits, one more every 38s. Bunnies adore it. |
| Pumpkin       |  28¢ |  100s |   90¢ | 12 | Two days; one at +67%. |
| Watermelon    |  40¢ |  135s |  140¢ | 18 | Three days; two at +13%, one at +125%. |
| Golden Carrot |  60¢ |   60s |  150¢ |  5 | Every bunny on the farm can smell it. |

A partly eaten crop sells for less. A crop eaten down to zero is gone.

**Growing faster.** Growth multiplies together: season, weather, sprinklers, Rich Soil, and the Seed Lab.
Everything sells at sundown, so growing faster pays when it crosses a line:
- **A day sooner.** Corn and watermelon lose a day at +13% (summer, Rich Soil 2, or a Seed Lab level). A
  pumpkin ripens in one day with a sprinkler and Rich Soil 3, or the Well Pump. In winter (−20%, snow −15%
  more), carrots, sunflowers and golden carrots slip to two days unless something speeds them back up.
- **More fruit.** Strawberries and tomatoes fruit when they reach their grow time, then again every 38s
  (36s for tomatoes) of growth, as many times as the day allows, and every ripe fruit sells that evening.
  That's once a day normally, twice at +27% (+20% for tomatoes). The plant is spent after its five (six)
  fruits either way; faster just gets them to market sooner.

The seed shelf shows it in the corner of each seed: **2d** for a crop that takes two days today, green when
growing fast has bought a day (or **×2** for two fruits a day), red when the weather costs one. The Almanac
says how much faster a crop would need to grow to do better, and a planted crop says when it'll be ripe.
- **Rich Soil** (3 levels, 250/700/1,800¢): +8% growth per level for every crop.
- **Seed Lab** (per crop, 3 levels, 15×/30×/55× the seed price): +15% growth and +5% price per level.
- **Well Pump** (900¢): sprinklers give +70% growth instead of +40%.
- **Greenhouse** (1,500¢): winter and snow stop slowing crops.
- **Market Stall** (2 levels, 600/1,600¢): +6% on every sale.

## Defenses

Defenses go on your land, grass or tilled soil. One on soil costs you a tile you could have planted.
They stay between rounds, wear down as bunnies chew them (a bar shows the damage), and can be repaired
(Repair All, in the Defense tab, patches every one for half the cost of the damage), sold, or **upgraded to
five stars** (each star level unlocks separately). Each level:
- adds 14% range
- acts 12% faster
- makes its effects last 20% longer
- adds 50% sturdiness
- adds +1 damage for the trap and the dog, and every other level for the turret and beehive

Upgrades cost 1×, 1.6×, 2.6×, then 4× the defense's price. Top levels add perks:
- ★★★★ fences shock chewers.
- ★★★★ sprinklers flood tunnels, popping Burrowers up.
- ★★★★★ turrets fire two pebbles at two bunnies.
- ★★★★★ scarecrows spook even Asteroid Bucks.

| Defense      | Cost | What it does |
|--------------|-----:|--------------|
| Fence        |   6¢ | Blocks the tile. Bunnies go around it or chew through it. |
| Snap Trap    |  15¢ | A wooden mousetrap with cheese, hidden from bunnies. 3 damage when stepped on, then re-arms in 5 s. |
| Scarecrow    |  25¢ | Every 2.5 s, scares nearby bunnies off their food and away from it. A startled crow flies off. |
| Sprinkler    |  30¢ | A spinning lawn sprinkler. Knocks bunnies back and soaks them so they move at half speed. Crops nearby grow faster. |
| Sling Turret |  60¢ | Fires pebbles automatically at bunnies in range (2.6 tiles, every 1.5 s). |
| Dog          |  60¢ | Chases and bites bunnies. It's tied to its doghouse by a leash. |
| Thumper      |  35¢ | An iron weight on an A-frame. When a Burrower tunnels within 2.5 tiles, it pounds the ground and knocks the Burrower up, dazed, for 2 s. |
| Carrot Decoy |  20¢ | A painted wooden carrot. Bunnies within 4 tiles gnaw on it instead of your crops, and go home hungry, so they don't breed. |
| Beehive      |  70¢ | A straw skep. Bees sting the nearest bunny every second. Pot helmets and ninja dodges don't help. |

## Bunnies

| Bunny          | First day | Notes |
|----------------|----------:|-------|
| Common         | 1 | Brown and hungry. |
| Jackrabbit     | 2 | Sandy colored. Fast, and eats less before heading home. |
| Burrower       | 3 | Slate gray. Tunnels under fences and traps. It pops its head up every few seconds, and comes up to eat. A shot at its mound, a thumper, a splash, or the hose knocks it out of the ground. |
| Chonk          | 4 | Tough, slow, and eats a lot. A trap won't finish it. |
| Kits           | 5 | Baby bunnies, tiny and quick, in litters of four. |
| Pot-Head       | 10 | Wears a cooking pot: the first two pebbles clang off. Splash, traps, bees, and dogs ignore the pot. |
| Leaper         | 11 | Russet. Springs over fences and defenses instead of chewing through. |
| Bandit         | 16 | Masked. Pulls up a whole ripe crop and runs for home with it. Bonk it and the crop goes back in the ground. |
| Snow Hare      | 22 (winters) | White on white, and snow doesn't slow it. |
| Ninja Bunny    | 31 | Charcoal, with a red headband. Sidesteps half of all pebbles (sling, pellets, turret). |
| Bunny Queen    | 36 | Lavender, with a crown. Slow and tough. Sends a Burrower into the ground every 5 s, up to 6. |
| Asteroid Buck  | 7, 14, 21, … | Boss, on the last day of each season. Glows green and crawls out of the crater. Ignores scarecrows and sprinklers, and eats a lot before it leaves. Pays a 100¢ bounty. |

The number of bunnies grows every day, scaled by season, weather, and the crater's anger. After the first
year it keeps growing but stops accelerating. Each well-fed escapee adds another bunny, up to 20. After
day 6 bunnies get 7% tougher per day, and they get a little faster over time.

## Weapons (you, from the porch)

Buy and upgrade weapons in the store's Weapons tab, each up to five levels. During the day, switch with
`1`–`5` or the mouse wheel. Each weapon reloads on its own.

| Weapon | Cost | |
|--------|-----:|---|
| Slingshot | yours | One pebble, one bunny. Levels speed it up (0.45 s → 0.22 s) and hit harder (1 → 3). A miss on a Burrower's mound startles it out. |
| Pellet Gun | 200¢ | Hold to fire a spray of pellets: fast and inaccurate. |
| Spud Gun | 350¢ | Lobs a potato that bursts on landing. Hits everything nearby, ignores pots, and shakes Burrowers loose. |
| Garden Hose | 300¢ | Hold to spray. Shoves bunnies back, soaks them slow, and floods Burrowers up. It does damage from level 2. |
| Firework Launcher | 1,000¢ | A big, slow boom. Made for Asteroid Bucks. At level 5 it bursts into three more. |

Upgrades run from 60¢ (the sling's first) to 3,000¢ (the Firework Launcher's last), about 19,000¢ in all.
That's a big part of what the late game's money goes into.

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

- **Pixels:** the world is drawn at 1× art resolution (704×512) and scaled up to the screen by a whole
  number, 3× on a Retina MacBook. Every art pixel is an even block, and sprites move only in whole
  pixels, never stretched. When a whole number would waste too much of the window, the game draws one
  size up and lets the browser shrink it smoothly. World text uses a proportional 5×7 pixel font.
- **Art:** the sprites were generated with sprite-ai.art under one shared style file (`sprite-style.md`),
  then cleaned up by `scripts/process-sprites.py`. That script does the following:
  - trims them, and removes the generator's cast shadows and stray pixels
  - recolors odd soil, and relights the turret as golden oak
  - palette-swaps the jackrabbit, burrower, ninja (plus headband), and golden bunny from the brown
    bunny's 8-frame hop, and the Bunny Queen (plus crown) from the Chonk

  The Chonk and Queen hop with whole-pixel squash and stretch frames.
- **Drawn in code:** the snap trap and the rotary sprinkler (the generated ones read as a pet bowl and
  a birdbath), and fences. The ground is quiet, close-toned grass with a few tufts and flowers, plus a
  dirt path and dark tilled soil so crops and bunnies stand out. The seasonal foliage is drawn in code
  too: fall and winter recolors of the trees, and burgundy fall bushes.
- **Readability:** rest the mouse on anything and a small tag names it ("RIPE CARROT", "NINJA BUNNY").
  Burrows carry head-count tags in the morning.
- **Lighting and life:** soft shadows, drifting cloud shadows, a golden afternoon, a violet sundown, and
  a blue evening. There are butterflies, pond sparkles,
  and the crater's glow, which grows as the Crater Project goes up. On the Last Night, the cap hangs
  on chains over the crater.
- **Interface:** **classic System 7**, with a menubar, striped title bars, rounded buttons, Geneva type
  with double-struck bold, and Chicago-style logo lettering. **Balloon Help** runs the first-game
  tutorial, and Help › Show Balloons explains anything you point at.
- **Sound:** synthesized sound effects and a four-track chiptune score (morning, day, boss, title),
  each separately mutable.
- **Saving:** progress autosaves in the browser (localStorage).

## Not yet (ideas for later)

Water, fertilizer, and more maps. Online leaderboards and daily seeds. A black-and-white "Classic Mac"
art mode. Defense synergies. A "keep farming" option after the crater is sealed.
