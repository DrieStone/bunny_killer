"""Turn the raw sprite-ai.art output in assets/sprites/ into game-ready sprites in src/art/sprites/.

- trims transparent borders (animation frames share one crop so they stay aligned)
- removes the few cast shadows the generator added despite being asked not to
- recolors purple soil mounds to the brown every other crop uses
- scrubs stray magenta pixels out of the animation sheets
- mirrors the dog so every creature faces right (the game flips them for left)
- derives the white jackrabbit and gray burrower from the brown bunny's hop frames,
  and the sprung trap from the open one

Run: python3 scripts/process-sprites.py
"""
import colorsys
import json
import os
from PIL import Image

SRC = 'assets/sprites'
OUT = 'src/art/sprites'
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith('.png'):
        os.remove(os.path.join(OUT, f))


def load(name):
    return Image.open(f'{SRC}/{name}.png').convert('RGBA')


def hls(px):
    return colorsys.rgb_to_hls(px[0] / 255, px[1] / 255, px[2] / 255)


def rgb(h, l, s, a=255):
    r, g, b = colorsys.hls_to_rgb(h % 1.0, max(0, min(1, l)), max(0, min(1, s)))
    return (round(r * 255), round(g * 255), round(b * 255), a)


def trim(im):
    box = im.getbbox()
    return im.crop(box) if box else im


def save(im, name):
    im.save(f'{OUT}/{name}.png')
    return im


def remove_shadow(im, frac=0.3):
    """Drop flat gray cast-shadow pixels from the bottom of a sprite."""
    im = im.copy()
    box = im.getbbox()
    top = box[3] - (box[3] - box[1]) * frac
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] == 0 or y < top:
                continue
            h, l, s = hls(p)
            if s < 0.06 and 0.4 < l < 0.85:
                px[x, y] = (0, 0, 0, 0)
    return im


def brown_soil(im, frac=0.5):
    """Recolor purple / lavender soil in the lower part of a crop sprite to tilled-soil brown."""
    im = im.copy()
    box = im.getbbox()
    top = box[1] + (box[3] - box[1]) * (1 - frac)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] == 0 or y < top:
                continue
            h, l, s = hls(p)
            deg = h * 360
            if (275 <= deg <= 345 or (deg >= 345 and s < 0.15)) and l < 0.72:
                px[x, y] = rgb(24 / 360, 0.08 + l * 0.95, 0.42)
    return im


def scrub_magenta(im):
    """Replace generator glitch pixels (saturated magenta) with a neighboring color, or clear them."""
    im = im.copy()
    px = im.load()
    bad = []
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] == 0:
                continue
            h, l, s = hls(p)
            if 280 <= h * 360 <= 335 and s > 0.45:
                bad.append((x, y))
    bad_set = set(bad)
    for x, y in bad:
        neigh = []
        edge = False
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < im.width and 0 <= ny < im.height) or px[nx, ny][3] == 0:
                edge = True
            elif (nx, ny) not in bad_set:
                neigh.append(px[nx, ny])
        if edge or not neigh:
            px[x, y] = (0, 0, 0, 0)
        else:
            px[x, y] = max(set(neigh), key=neigh.count)
    return im


def recolor_fur(im, kind):
    """Palette-swap the brown bunny's fur, leaving outline, eyes, ears and tail alone."""
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] == 0:
                continue
            h, l, s = hls(p)
            deg = h * 360
            if not (5 <= deg <= 48 and s > 0.1 and 0.16 < l < 0.86):
                continue
            if kind == 'jack':  # sandy cream jackrabbit
                px[x, y] = rgb(40 / 360, 0.42 + l * 0.58, 0.18 + s * 0.3)
            else:  # slate-gray burrower, dusted with dirt
                px[x, y] = rgb(212 / 360, 0.1 + l * 0.92, 0.09)
    return im


def oak(im):
    """Push pale pinkish wood toward a darker, warmer oak brown."""
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] == 0:
                continue
            h, l, s = hls(p)
            deg = h * 360
            if (deg >= 340 or deg <= 45) and s > 0.12 and l > 0.25:
                px[x, y] = rgb(24 / 360, 0.1 + l * 0.55, min(0.5, s * 0.55 + 0.14))
    return im


def frames(sheet_name, n=8):
    sheet = scrub_magenta(load(f'anim/{sheet_name}_sheet'))
    fw = sheet.width // n
    fs = [sheet.crop((i * fw, 0, i * fw + fw, sheet.height)) for i in range(n)]
    # one shared crop so the frames stay registered
    boxes = [f.getbbox() for f in fs]
    box = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    return [f.crop(box) for f in fs]


meta = {}


def emit(im, name, **info):
    save(im, name)
    meta[name] = {'w': im.width, 'h': im.height, **info}


# --- bunnies
hop = frames('bunny_hop')
for i, f in enumerate(hop):
    emit(f, f'bunny_common_{i}')
    emit(recolor_fur(f, 'jack'), f'bunny_jack_{i}')
    emit(recolor_fur(f, 'digger'), f'bunny_digger_{i}')
emit(trim(remove_shadow(load('bunnies/fat_sit'), 0.25)), 'bunny_fat')
emit(trim(load('bunnies/boss_sit')), 'bunny_boss')
emit(trim(load('bunnies/digger_mound')), 'digger_mound')

# --- dog (generated facing left)
for i, f in enumerate(frames('dog_run')):
    emit(f.transpose(Image.FLIP_LEFT_RIGHT), f'dog_{i}')
emit(trim(load('misc/dog_stand')).transpose(Image.FLIP_LEFT_RIGHT), 'dog_stand')

# --- crops
emit(trim(load('crops/seed')), 'crop_seed')
emit(trim(load('crops/sprout')), 'crop_sprout')
for kind in ['radish', 'lettuce', 'carrot', 'corn', 'pumpkin', 'strawberry']:
    young = load(f'crops/{kind}_young')
    if kind == 'pumpkin':
        young = remove_shadow(young, 0.3)
    if kind in ('corn', 'strawberry'):
        young = brown_soil(young, 0.45)
    emit(trim(young), f'crop_{kind}_young')
    emit(trim(load(f'crops/{kind}_ripe')), f'crop_{kind}_ripe')

# --- defenses
emit(trim(load('defenses/scarecrow')), 'def_scarecrow')
emit(trim(remove_shadow(load('defenses/sprinkler'), 0.3)), 'def_sprinkler')
emit(trim(oak(load('defenses/turret'))), 'def_turret')
emit(trim(load('defenses/doghouse')), 'def_doghouse')
trap = trim(load('defenses/trap_open'))
emit(trap, 'def_trap_open')
emit(trap.transpose(Image.FLIP_LEFT_RIGHT), 'def_trap_shut')

# --- scenery
for name in ['farmhouse', 'tree_oak', 'tree_apple', 'bush', 'rocks', 'flowers', 'stump', 'haybale', 'crater', 'burrow', 'pond']:
    emit(trim(load(f'scenery/{name}')), f'sc_{name}')

json.dump(meta, open(f'{OUT}/../sprites.json', 'w'), indent=1)
print(f'{len(meta)} sprites -> {OUT}')
