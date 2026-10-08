import {describe, it, expect} from 'vitest';

import {
  buildDisplacementMap,
  estimateBackgroundColor,
  keyOutBackground,
  RgbaImage,
} from './BackgroundKeyer';

/**
 * Builds a `size` x `size` RGBA image with a uniform `bg` border color and a
 * single `fg` pixel at the center.
 */
function imageWithCenter(
  size: number,
  bg: [number, number, number],
  fg: [number, number, number]
): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  const center = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
  data[center] = fg[0];
  data[center + 1] = fg[1];
  data[center + 2] = fg[2];
  data[center + 3] = 255;
  return {data, width: size, height: size};
}

describe('estimateBackgroundColor', () => {
  it('averages the four corner pixels', () => {
    const image = imageWithCenter(4, [255, 255, 255], [200, 0, 0]);
    expect(estimateBackgroundColor(image)).toEqual([255, 255, 255]);
  });
});

describe('keyOutBackground', () => {
  it('makes background pixels transparent and keeps the subject opaque', () => {
    const image = imageWithCenter(4, [255, 255, 255], [200, 0, 0]);
    const result = keyOutBackground(image);

    // A corner (background) is now transparent.
    expect(result.data[3]).toBe(0);
    // The center (subject) stays opaque.
    const center = (2 * 4 + 2) * 4;
    expect(result.data[center + 3]).toBe(255);
  });

  it('does not mutate the input image', () => {
    const image = imageWithCenter(4, [255, 255, 255], [200, 0, 0]);
    keyOutBackground(image);
    // Original corner alpha is unchanged.
    expect(image.data[3]).toBe(255);
  });

  it('keeps near-background colors within tolerance transparent', () => {
    // Subject color is close to white; a wide tolerance keys it out too.
    const image = imageWithCenter(4, [255, 255, 255], [250, 250, 250]);
    const result = keyOutBackground(image, {tolerance: 100});
    const center = (2 * 4 + 2) * 4;
    expect(result.data[center + 3]).toBe(0);
  });

  it('preserves distinct subjects under a tight tolerance', () => {
    const image = imageWithCenter(4, [255, 255, 255], [10, 10, 10]);
    const result = keyOutBackground(image, {tolerance: 10});
    const center = (2 * 4 + 2) * 4;
    expect(result.data[center + 3]).toBe(255);
  });
});

describe('buildDisplacementMap', () => {
  it('maps transparent background to black (no displacement)', () => {
    const image = imageWithCenter(4, [255, 255, 255], [200, 0, 0]);
    const keyed = keyOutBackground(image);
    const disp = buildDisplacementMap(keyed);
    // A corner was keyed transparent -> displacement 0, opaque.
    expect(disp.data[0]).toBe(0);
    expect(disp.data[3]).toBe(255);
  });

  it('maps the subject to its luminance', () => {
    const image = imageWithCenter(4, [255, 255, 255], [200, 0, 0]);
    const keyed = keyOutBackground(image);
    const disp = buildDisplacementMap(keyed);
    const center = (2 * 4 + 2) * 4;
    const expected = Math.round(0.2126 * 200);
    expect(disp.data[center]).toBe(expected);
    expect(disp.data[center + 3]).toBe(255);
  });
});
