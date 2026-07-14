import {describe, it, expect} from 'vitest';

import {SegmentCategory} from './SegmentationMask';

describe('SegmentCategory', () => {
  it('matches the selfie multiclass model index ordering', () => {
    // These indices are dictated by the model output, do not renumber.
    expect(SegmentCategory.Background).toBe(0);
    expect(SegmentCategory.Hair).toBe(1);
    expect(SegmentCategory.BodySkin).toBe(2);
    expect(SegmentCategory.FaceSkin).toBe(3);
    expect(SegmentCategory.Clothes).toBe(4);
    expect(SegmentCategory.Others).toBe(5);
  });

  it('treats only background as non-person (index 0)', () => {
    // Convention used by consumers: anything >= 1 is part of a person.
    expect(SegmentCategory.Background).toBe(0);
    expect(SegmentCategory.Hair).toBeGreaterThanOrEqual(1);
    expect(SegmentCategory.Others).toBeGreaterThanOrEqual(1);
  });
});
