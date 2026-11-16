import {describe, it, expect} from 'vitest';

import {
  ARKIT_BLENDSHAPE_NAMES,
  blendshapesToVisemes,
} from './BlendshapeReducer';

// Build a blendshape vector matching the canonical ARKit ordering with a
// few targeted weights set. Anything not named is 0.
function makeBlend(weights: Record<string, number>): Float32Array {
  const arr = new Float32Array(ARKIT_BLENDSHAPE_NAMES.length);
  for (const [k, v] of Object.entries(weights)) {
    const i = ARKIT_BLENDSHAPE_NAMES.indexOf(k);
    if (i < 0) throw new Error(`unknown blendshape: ${k}`);
    arr[i] = v;
  }
  return arr;
}

describe('blendshapesToVisemes', () => {
  it('maps jaw, pucker, and stretch signals to their visible mouth shapes', () => {
    const out = blendshapesToVisemes(makeBlend({jawOpen: 0.8}));
    expect(out.aa).toBeGreaterThan(0.3);
    expect(out.jawOpen).toBeGreaterThan(0.3);
    expect(out.oo).toBe(0);
    expect(out.ee).toBe(0);
    const pucker = blendshapesToVisemes(makeBlend({mouthPucker: 0.9}));
    expect(pucker.oo).toBeGreaterThan(0.5);
    expect(pucker.aa).toBe(0);
    const rounded = blendshapesToVisemes(
      makeBlend({jawOpen: 0.7, mouthPucker: 0.7})
    );
    expect(rounded.oh).toBeGreaterThan(0.2);
    const stretch = blendshapesToVisemes(
      makeBlend({mouthStretchLeft: 0.8, mouthStretchRight: 0.8})
    );
    expect(stretch.ee).toBeGreaterThan(0.4);
    const smile = blendshapesToVisemes(
      makeBlend({mouthSmileLeft: 0.8, mouthSmileRight: 0.8})
    );
    expect(stretch.ee).toBeGreaterThan(smile.ee);
  });

  it('requires exactly 52 blendshape inputs (ARKit-compatible)', () => {
    expect(ARKIT_BLENDSHAPE_NAMES).toHaveLength(52);
  });
});
