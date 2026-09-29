import { describe, expect, it } from 'vitest';
import { dither } from '../src/render/mono';

/** An 8x8 block of one color through the 1993 Mode dither: how many of its 64 pixels come out white. */
function whites(r: number, g: number, b: number): number {
  const src = new Uint8ClampedArray(64 * 4);
  for (let p = 0; p < src.length; p += 4) src.set([r, g, b, 255], p);
  const out = new Uint32Array(64);
  dither(src, out, 8, 8);
  expect(out.every((v) => v === 0xffffffff || v === 0xff000000)).toBe(true);
  return out.filter((v) => v === 0xffffffff).length;
}

describe('1993 Mode', () => {
  it('leaves black and white alone', () => {
    expect(whites(0, 0, 0)).toBe(0);
    expect(whites(255, 255, 255)).toBe(64);
  });

  it('turns grays into a few flat patterns, lighter for lighter', () => {
    const levels = [30, 50, 80, 110, 150, 185, 230].map((v) => whites(v, v, v));
    expect(levels).toEqual([0, 8, 16, 32, 48, 56, 64]);
  });
});
