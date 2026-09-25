import {describe, expect, it} from 'vitest';

import {flipWebGLPixelRows} from './XRCameraSnapshot';

describe('flipWebGLPixelRows', () => {
  it('flips bottom-up RGBA rows into top-left image order', () => {
    const bottomRow = [1, 2, 3, 255, 4, 5, 6, 255];
    const topRow = [7, 8, 9, 255, 10, 11, 12, 255];
    const flipped = flipWebGLPixelRows(
      new Uint8Array([...bottomRow, ...topRow]),
      2,
      2
    );
    expect([...flipped]).toEqual([...topRow, ...bottomRow]);
  });
});
