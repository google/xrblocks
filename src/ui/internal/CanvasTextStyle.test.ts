import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  cssColor,
  fontShorthand,
  graphemes,
  graphemeSegments,
  resolveFontWeight,
  resolveLineHeight,
  resolveRasterScale,
  SYSTEM_FONT_STACK,
} from './CanvasTextStyle';

describe('canvas text style helpers', () => {
  it('builds a font shorthand from the system stack', () => {
    expect(fontShorthand(16)).toBe(`400 16px ${SYSTEM_FONT_STACK}`);
    expect(fontShorthand(20, 'bold')).toBe(`700 20px ${SYSTEM_FONT_STACK}`);
    expect(resolveFontWeight('medium')).toBe(500);
    expect(resolveFontWeight(350)).toBe(350);
    expect(resolveFontWeight(undefined)).toBe(400);
  });

  it('resolves CSS-like line heights against the font size', () => {
    expect(resolveLineHeight(1.5, 16)).toBe(24);
    expect(resolveLineHeight('30px', 16)).toBe(30);
    expect(resolveLineHeight('150%', 16)).toBe(24);
    expect(resolveLineHeight(undefined, 10)).toBeCloseTo(12, 6);
  });

  it('converts colors without disturbing CSS strings', () => {
    expect(cssColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(cssColor(0xff8800)).toBe('#ff8800');
    expect(cssColor(new THREE.Color('#123456'))).toBe('#123456');
  });

  it('splits on grapheme boundaries, not code units', () => {
    expect(graphemes('a😀b👩‍👩‍👧')).toEqual(['a', '😀', 'b', '👩‍👩‍👧']);
    expect(graphemeSegments('a😀')).toEqual([
      {segment: 'a', index: 0},
      {segment: '😀', index: 1},
    ]);
  });

  it('caps the raster scale so a large surface stays within one texture', () => {
    expect(resolveRasterScale(100, 50)).toBeGreaterThan(0);
    expect(resolveRasterScale(8192, 50)).toBeCloseTo(0.5, 6);
    // A zero-sized surface imposes no cap; callers skip drawing it instead.
    expect(resolveRasterScale(0, 0)).toBeGreaterThan(0);
  });
});
