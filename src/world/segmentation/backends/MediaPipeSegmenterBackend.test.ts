import {describe, it, expect, vi} from 'vitest';

import {categoryMaskToSegmentationMask} from './MediaPipeSegmenterBackend';

// Build a synthetic MediaPipe MPMask-shaped object: a per-pixel category
// buffer plus the getter/dims/close() the backend reads.
function makeMpMask(values: number[], width: number, height: number) {
  const source = new Uint8Array(values);
  const close = vi.fn();
  return {
    mask: {
      getAsUint8Array: () => source,
      width,
      height,
      close,
    },
    source,
    close,
  };
}

describe('categoryMaskToSegmentationMask', () => {
  it('maps the MediaPipe category mask to a SegmentationMask with dims', () => {
    const {mask} = makeMpMask([0, 1, 2, 5], 2, 2);
    const result = categoryMaskToSegmentationMask(mask as never);
    expect(result).not.toBeNull();
    expect(Array.from(result!.data)).toEqual([0, 1, 2, 5]);
    expect(result!.width).toBe(2);
    expect(result!.height).toBe(2);
  });

  it('copies the buffer before closing the MediaPipe mask', () => {
    const {mask, source, close} = makeMpMask([3, 4], 2, 1);
    const result = categoryMaskToSegmentationMask(mask as never);
    // Mutating the original source must not change the returned data.
    source[0] = 99;
    expect(result!.data[0]).toBe(3);
    expect(close).toHaveBeenCalledOnce();
  });

  it('returns null when there is no category mask', () => {
    expect(categoryMaskToSegmentationMask(null)).toBeNull();
    expect(categoryMaskToSegmentationMask(undefined)).toBeNull();
  });
});
