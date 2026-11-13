import {describe, expect, it} from 'vitest';
import {
  graphemes,
  graphemeSegments,
  resolveRasterScale,
} from './CanvasTextStyle';

describe('text input boundaries', () => {
  it('keeps surrogate pairs and joined emoji on grapheme boundaries', () => {
    expect(graphemes('a😀b👩‍👩‍👧')).toEqual(['a', '😀', 'b', '👩‍👩‍👧']);
    expect(graphemeSegments('a😀')).toEqual([
      {segment: 'a', index: 0},
      {segment: '😀', index: 1},
    ]);
  });
  it('keeps rasterized surfaces inside the texture limit', () => {
    for (const [width, height] of [
      [100, 50],
      [8192, 50],
      [50, 8192],
    ]) {
      const scale = resolveRasterScale(width, height);
      expect(scale).toBeGreaterThan(0);
      expect(Math.max(width, height) * scale).toBeLessThanOrEqual(4096);
    }
  });
});
