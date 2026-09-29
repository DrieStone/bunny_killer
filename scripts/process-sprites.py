"""Turn the raw sprite-ai.art output in assets/sprites/ into game-ready sprites in src/art/sprites/.

- trims transparent borders (animation frames share one crop so they stay aligned)
- removes the few cast shadows the generator added despite being asked not to
- recolors purple soil mounds to the brown every other crop uses
- scrubs stray magenta pixels out of the animation sheets
- mirrors the dog so every creature faces right (the game flips them for left)
- derives the jackrabbit, burrower, ninja (headband), Pot-Head (pot), Leaper, Bandit (mask), Snow Hare, and
  two-thirds-size Kits from the brown bunny's hop frames, and the Bunny Queen from the Chonk

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
            elif kind == 'ninja':  # charcoal
                px[x, y] = rgb(232 / 360, 0.07 + l * 0.44, 0.13)
            elif kind == 'leaper':  # russet hare
                px[x, y] = rgb(20 / 360, 0.14 + l * 0.72, 0.55 + s * 0.2)
            elif kind == 'bandit':  # dusty gray-brown
                px[x, y] = rgb(30 / 360, 0.1 + l * 0.8, 0.12)
            elif kind == 'snow':  # white, with cool blue shading
                px[x, y] = rgb(210 / 360, 0.5 + l * 0.5, 0.22)
            elif kind == 'kit':  # a lighter, fluffier brown
                px[x, y] = rgb(26 / 360, 0.2 + l * 0.85, 0.42)
            else:  # slate-gray burrower, dusted with dirt
                px[x, y] = rgb(212 / 360, 0.1 + l * 0.92, 0.09)
    return im


def head_offset(ref, im, box=(10, 7, 22, 15), reach=4):
    """Where the head in hop frame `ref` (the patch `box`) went in frame `im`, as (dx, dy)."""
    rp, ip = ref.load(), im.load()
    best, best_off = None, (0, 0)
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            miss = 0
            for y in range(box[1], box[3]):
                for x in range(box[0], box[2]):
                    a = rp[x, y][3] > 0
                    nx, ny = x + dx, y + dy
                    b = 0 <= nx < im.width and 0 <= ny < im.height and ip[nx, ny][3] > 0
                    miss += a != b
            if best is None or miss < best:
                best, best_off = miss, (dx, dy)
    return best_off


BAND = {'hi': (232, 64, 52, 255), 'lo': (150, 30, 24, 255)}


def headband(im, off):
    """Tie a red ninja headband across the forehead (hop frame 0 coordinates, shifted by `off`)."""
    im = im.copy()
    px = im.load()
    dx, dy = off

    def put(x, y, c, over_outline=True):
        x, y = x + dx, y + dy
        if 0 <= x < im.width and 0 <= y < im.height and (px[x, y][3] > 0 or over_outline):
            px[x, y] = c

    for x in range(12, 20):  # the band, above the eye
        put(x, 9, BAND['hi'], False)
    for x in range(12, 16):
        put(x, 10, BAND['lo'], False)
    # the knot's tails, streaming out behind
    for x, y, c in [(11, 9, 'hi'), (10, 9, 'hi'), (9, 10, 'hi'), (8, 10, 'lo'), (11, 10, 'lo'), (10, 11, 'lo'), (9, 11, 'lo')]:
        put(x, y, BAND[c])
    return im


def overlay(im, off, rects):
    """Paint (x, y, w, h, color) rectangles given in hop-frame-0 coordinates, shifted to where the head went."""
    im = im.copy()
    px = im.load()
    dx, dy = off
    for x0, y0, w, h, c in rects:
        for y in range(y0, y0 + h):
            for x in range(x0, x0 + w):
                if 0 <= x + dx < im.width and 0 <= y + dy < im.height:
                    px[x + dx, y + dy] = c
    return im


POT = {'o': (34, 36, 44, 255), 'd': (94, 102, 114, 255), 'm': (143, 152, 166, 255), 'l': (205, 212, 222, 255)}


def pot(im, off):
    """An upside-down cooking pot jammed on the head, handle sticking out the back."""
    return overlay(im, off, [
        (8, 5, 5, 3, POT['o']), (9, 6, 3, 1, POT['d']),  # handle
        (12, 3, 10, 5, POT['o']), (13, 4, 8, 3, POT['m']), (13, 4, 8, 1, POT['l']), (19, 5, 2, 2, POT['d']),  # body
        (11, 7, 12, 3, POT['o']), (12, 8, 10, 1, POT['l']),  # rim
    ])


def mask(im, off):
    """A robber's mask across the eyes, with the eye left shining through."""
    return overlay(im, off, [
        (12, 10, 9, 2, (28, 26, 34, 255)), (10, 10, 2, 1, (28, 26, 34, 255)), (9, 11, 2, 1, (28, 26, 34, 255)),
        (16, 10, 1, 1, (255, 255, 255, 255)), (17, 11, 1, 1, (255, 255, 255, 255)),
    ])


def shrink(im, keep=(0, 1)):
    """Two-thirds size: of every three rows and columns keep two (a whole-pixel shrink, no blending),
    then give the edge a fresh outline. Ears and eyes survive, which halving doesn't manage."""
    xs = [x for x in range(im.width) if x % 3 in keep]
    ys = [y for y in range(im.height) if y % 3 in keep]
    out = Image.new('RGBA', (len(xs), len(ys)), (0, 0, 0, 0))
    src, dst = im.load(), out.load()
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            dst[i, j] = src[x, y]
    w, h = out.size
    edge = [(x, y) for y in range(h) for x in range(w) if dst[x, y][3] > 0 and any(
        not (0 <= x + i < w and 0 <= y + j < h) or dst[x + i, y + j][3] == 0 for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in edge:
        if hls(dst[x, y])[1] > 0.3:
            dst[x, y] = (42, 27, 20, 255)
    return out


def queen(im):
    """The Chonk in royal lavender, with a little gold crown on her head."""
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] == 0:
                continue
            h, l, s = hls(p)
            deg = h * 360
            if 12 <= deg <= 52 and s > 0.1 and 0.2 < l < 0.95:
                px[x, y] = rgb(272 / 360, 0.3 + l * 0.62, 0.42)
    gold, shine, dark, gem = (255, 206, 58, 255), (255, 243, 160, 255), (138, 92, 16, 255), (224, 69, 123, 255)
    rows = ['d...d...d', 'dd.dgd.dd', 'dgdgggdgd', 'dgsggjggd', 'dgggggggd', 'ddddddddd']
    ox, oy = 24, 6
    for ry, row in enumerate(rows):
        for rx, ch in enumerate(row):
            c = {'d': dark, 'g': gold, 's': shine, 'j': gem}.get(ch)
            if c:
                px[ox + rx, oy + ry] = c
    return im


def oak(im):
    """Push pale pinkish wood toward a light golden oak that stands out on dark tilled soil."""
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
                px[x, y] = rgb(30 / 360, 0.2 + l * 0.62, min(0.62, s * 0.6 + 0.22))
            elif 260 <= deg < 340 and l < 0.3:
                px[x, y] = rgb(22 / 360, l * 0.95, 0.4)  # plum outline -> dark brown, like everything else
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
    head = head_offset(hop[0], f)
    emit(headband(recolor_fur(f, 'ninja'), head), f'bunny_ninja_{i}')
    emit(pot(f, head), f'bunny_pothead_{i}')
    emit(recolor_fur(f, 'leaper'), f'bunny_leaper_{i}')
    emit(mask(recolor_fur(f, 'bandit'), head), f'bunny_bandit_{i}')
    emit(recolor_fur(f, 'snow'), f'bunny_snow_{i}')
    emit(shrink(recolor_fur(f, 'kit')), f'bunny_kit_{i}')
fat = trim(remove_shadow(load('bunnies/fat_sit'), 0.25))
emit(fat, 'bunny_fat')
emit(queen(fat), 'bunny_queen')
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
# the sprinkler and snap trap are drawn in code (src/render/sprites.ts): the generated ones didn't read
emit(trim(oak(load('defenses/turret'))), 'def_turret')
emit(trim(load('defenses/doghouse')), 'def_doghouse')

# --- scenery
for name in ['farmhouse', 'tree_oak', 'tree_apple', 'bush', 'rocks', 'flowers', 'stump', 'haybale', 'crater', 'burrow', 'pond']:
    emit(trim(load(f'scenery/{name}')), f'sc_{name}')

json.dump(meta, open(f'{OUT}/../sprites.json', 'w'), indent=1)
print(f'{len(meta)} sprites -> {OUT}')
