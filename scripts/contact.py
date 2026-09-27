"""Contact sheet of sprite PNGs, blown up with nearest-neighbor, for reviewing generated art.
Usage: python3 scripts/contact.py out.png [scale] file1.png file2.png ..."""
import sys
from PIL import Image, ImageDraw

out, rest = sys.argv[1], sys.argv[2:]
scale = 6
if rest and rest[0].isdigit():
    scale, rest = int(rest[0]), rest[1:]
ims = [(p, Image.open(p).convert('RGBA')) for p in rest]
pad, label = 16, 14
cols = min(6, len(ims))
cell_w = max(im.width for _, im in ims) * scale + pad
cell_h = max(im.height for _, im in ims) * scale + pad + label
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGBA', (cols * cell_w + pad, rows * cell_h + pad), (118, 170, 88, 255))
d = ImageDraw.Draw(sheet)
for n, (p, im) in enumerate(ims):
    x = pad + (n % cols) * cell_w
    y = pad + (n // cols) * cell_h
    # checker behind the sprite so transparency is visible
    d.rectangle([x - 2, y - 2, x + im.width * scale + 1, y + im.height * scale + 1], fill=(150, 196, 118, 255))
    sheet.alpha_composite(im.resize((im.width * scale, im.height * scale), Image.NEAREST), (x, y))
    d.text((x, y + im.height * scale + 2), p.split('/')[-1].replace('.png', ''), fill=(0, 0, 0, 255))
sheet.save(out)
print(out, sheet.size)
