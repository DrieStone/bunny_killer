# Bunny Killer 4 — Design (v0.6)

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

**Three farms.** A new game starts by picking a farm. The lots, prices, and rules are the same on all three;
what changes is where the bunnies come from and how they get in. Enter picks the one you played last.
- **Home Farm:** open meadow on every side, a pond, and the crater to the east.
- **River Bend:** a river wraps the west and south sides. Bunnies from across the water have to come over
  one of four bridges, so that's where the defenses go.
- **Old Orchard:** rows of old fruit trees crowd every edge, and bunnies come down the lanes between them.
  The crater is in the southwest.

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

**After the win**, the cap comes down on the crater with a thud, the glow goes out, and fireworks go up over
the farm. Then you can **Keep Farming**: same farm, no more Bucks, and the crater stays quiet, so you can
build the farm out for as long as you like. The high score table keeps your win and notes how far you
farmed on ("farmed on to day 50").

A run also ends if you go bust (no crops in the ground and not enough credits for a seed, counting what
your defenses would sell for) or **retire the farm** (Game menu, planning only). The top-ten high score
table ranks farms that sealed the crater first, fastest on top, and the rest by lifetime harvest.

With the current numbers, the test bots (three seeds, six seeded replays each) play like this. Golden bunnies,
orders, and the fair make a farm richer than it used to be, so the crater comes down a few days sooner:
- **Sharp:** seals the crater every time, on day 26–32.
- **Decent:** every time, on day 26–32.
- **Casual:** every time, on day 28–37.

## Hard Mode

Sealing the crater opens **Hard Mode** (on the title screen, and on the victory screen). Prices, crops, and
the Crater Project are the same. The pressure isn't:
- 50% more bunnies every day.
- Regular bunnies are 25% tougher, so a plain bunny needs two hits from day 9 instead of day 14. Bucks are 35%
  tougher.
- The crater gets angry 50% faster with every stage.
- Year 2's bunnies come in Year 1: Pot-Heads from day 8, Leapers day 9, Bandits day 12, Ninjas day 16,
  and Queens day 23.
- The Last Night brings four Asteroid Bucks.

The window title says "(Hard)". Hard wins are marked HARD on the high score table and rank ahead of
normal ones. The bots: sharp seals it in 16 of 18 runs (day 27–40), decent in 12 (day 32–45), and casual in 6
(day 35–55). A failed Last Night costs days: the retries are where most of the long games come from.

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

**Orders from town.** From Day 3, on a morning with no order open, someone in town may post one (the diner,
the school, the pie shop, the county fair, Mrs. Pennywhistle, the grocer): so many of a crop they like, due
in three to five days. The order sits at the top of the Seeds tab, and its seed is highlighted. Harvest that
many by the due day, over as many evenings as you like, and they pay a bonus on top of the market price:
half of what those crops would normally sell for. How many they want grows with the farm. A missed order
just lapses.

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

**Events.** From Day 4, about a quarter of mornings bring something different (never on a Buck day or the Last
Night). The Scouting Report says what, next to the weather.
- **County Fair:** one crop that can ripen today sells for three times the price, the first 20 of it. Its seed
  is highlighted.
- **Hail:** partway through the day it knocks 30% off every crop's toughness (a Greenhouse keeps it off), and
  the bunnies cower where they are for six seconds.
- **Drought:** crops grow at 65% speed unless a sprinkler reaches them.
- **The travelling merchant:** a cart parks by the farm for the morning. Click it for up to three deals:
  something the store hasn't opened yet (a crop for 150¢, a defense for 220¢, a weapon for 300¢; it stays in
  the store after), the next level of Rich Soil at half price, a Seed Lab level at half price, or the next
  level of one of your weapons at 40% off. The cart leaves at sunrise.

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

**Combos.** Some defenses work better together. A burst of sparkles and a "COMBO!" shows when one comes off,
and the Almanac lists each defense's combo (hover a placed one and its partners light up).
- **Soggy scare:** a scarecrow scares a bunny soaked by a sprinkler twice as long.
- **Pollination:** a beehive with a sunflower growing in range stings twice as often.
- **Dazed:** a Burrower knocked loose by a thumper takes double damage from turret pebbles.
- **Watchdog:** the dog goes for bunnies chewing your fences and defenses first, and bites them harder.
- **Bait:** a snap trap within 2 tiles of a Carrot Decoy re-arms twice as fast.

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
| Golden Bunny   | 3 | Most days, one dashes straight across the farm, zig-zagging. It doesn't eat, and your defenses can't touch it: only your own shots. Bonk it for a prize: a pouch of coins (60¢ plus 14¢ a day), a free star on one of your defenses, or a free Seed Lab level. |

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

## Daily Farm

The same ten days for everyone, each calendar day: the same farm (one of the three), weather, bunnies,
events, and orders, from a seed made from the date. Daily Farm #1 was January 1, 2026. Your score is what you
harvest in the ten days (going bust ends it early). The results show your score, bonks, golden bunnies, and
orders filled, today's best, and a few lines to copy and share:

```
Bunny Killer 4 · Daily #271 · River Bend
🥕 4,210¢ harvested in 10 days
🐰 183 bonked · ✨ 3 golden · 📋 2 orders
```

A Daily Farm saves separately, so your own farm and the high scores are untouched, and it can be resumed
the same day.

## Achievements and the Bunny Guide

Twenty-four **achievements** (Help › Achievements…, or the title screen), from First Bonk to Hard as Nails,
Bridge Keeper, Gold Rush, Blue Ribbon, and Old School (1,000 in Classic Mode). A trophy pops up in the
corner of the farm when one is earned. The **Bunny Guide** (Help › Bunny Guide…) fills in as you meet each
kind of bunny: its picture, toughness and speed, what it does, and how many you've bonked across every farm. Both are kept across games.

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
- **The opening:** a short scene on first launch (Help › Replay the Intro, or skip with a click or key):
  "Autumn, 1993." A meteor comes down on the farm at night, the ground shakes, and the crater glows.
  "Years later..."
- **More life:** crops show bite marks as they're eaten and drop crumbs; bunnies running scared get motion
  lines and a sweat drop; a well-fed bunny waddles home.
- **1993 Mode** (Game menu, or the title screen): the whole game in black and white, the way a Mac Plus
  would have shown it. Sprites become black-outlined clip art with pattern fills, sunny grass goes white with
  its tufts left in, soil turns to plowed rows, and land not yet bought gets a dotted shade. Anything else
  (sparks, shadows, the night) goes through an 8×8 ordered dither on its way to the screen, so the picture
  holds still while things move. The store's pictures and the logo follow along.
- **Touch screens:** tap where you'd click, drag to paint a row, and a tap near a bunny counts as a hit. The
  page doesn't scroll or zoom under a finger. On a phone held sideways the Almanac steps aside so the store
  fits; held upright, it asks to be turned.
- **Icon:** the menubar's bunny, in the browser tab, and on a green square for a phone's home screen.
- **Saving:** progress autosaves in the browser (localStorage).

## Not yet (ideas for later)

Water and fertilizer. An online leaderboard for the Daily Farm. The original Bunny Killer II/3 art and
sounds as an option in 1993 Mode.
