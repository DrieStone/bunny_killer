---
default_type: character
default_size: 32
camera_perspective: side
reference_asset_id:
---
# BK4 sprite style

Shared look for every generated sprite in Bunny Killer 4, so the whole farm reads as one set.
The `sprite-gen` skill appends the Style descriptors below to every prompt, and passes
`reference_asset_id` (once set) as a style anchor.

## Style descriptors

Polished 16-bit pixel art for a cozy farming game, SNES-era quality, with the bright charm of
early-90s color Macintosh games. Chunky, cute, instantly readable silhouette that still reads at
small size. Hue-shifted shading with one consistent top-left light source: warm highlights, cool
shadows. Clean one-pixel dark outline in a deep hue-shifted tone, never pure black. Crisp hard
pixels, no anti-aliasing, no blur, minimal dithering. Warm, sunny farm palette. Transparent
background, subject centered and fully in frame, no text, no cast shadow.

## Palette

Sunny farm palette: fresh grass greens, rich tilled-soil browns, carrot orange, radish magenta,
straw yellow, cream highlights, sky-blue accents. No neon, except the Asteroid Buck's radioactive
green glow.

## Anchor / consistency notes

No anchor. On sprite-ai.art a `reference_asset_id` copies the reference's *content*, not just its style
(a carrot-referenced sprout came out as a carrot; a bunny-referenced boss came out as the same brown
bunny). Consistency comes from the descriptors above; motion comes from the animation endpoint, whose
frames derive from the source sprite. The approved bunny look is `assets/sprites/bunnies/common_sit.png`.

## Conventions

- Game tiles are 32px. Bunnies, crops, and defenses are 32px; tall things 48px; bosses and
  buildings 64–96px.
- Characters face right (the game mirrors them for left). Ground tiles are top-down.
- Files: `assets/<group>/<name>.png` (+ `.sai.json` metadata).
