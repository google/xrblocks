import {describe, it, expect} from 'vitest';

import {
  ARKIT_BLENDSHAPE_NAMES,
  blendshapesToVisemes,
  ZERO_VISEME,
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
  it('returns zero visemes for all-zero blendshape input', () => {
    const out = blendshapesToVisemes(makeBlend({}));
    expect(out).toEqual(ZERO_VISEME);
  });

  it('jawOpen alone drives the aa channel and leaves oo / ee at zero', () => {
    const out = blendshapesToVisemes(makeBlend({jawOpen: 0.8}));
    expect(out.aa).toBeGreaterThan(0.3);
    expect(out.jawOpen).toBeGreaterThan(0.3);
    expect(out.oo).toBe(0);
    expect(out.ee).toBe(0);
  });

  it('mouthPucker alone drives oo and leaves aa near zero', () => {
    const out = blendshapesToVisemes(makeBlend({mouthPucker: 0.9}));
    expect(out.oo).toBeGreaterThan(0.5);
    expect(out.aa).toBe(0);
  });

  it('jawOpen + mouthPucker together produces the oh channel', () => {
    const out = blendshapesToVisemes(
      makeBlend({jawOpen: 0.7, mouthPucker: 0.7})
    );
    expect(out.oh).toBeGreaterThan(0.2);
  });

  it('mouthStretch (not mouthSmile) drives the ee channel', () => {
    const stretch = blendshapesToVisemes(
      makeBlend({mouthStretchLeft: 0.8, mouthStretchRight: 0.8})
    );
    expect(stretch.ee).toBeGreaterThan(0.4);

    // mouthSmile is a much weaker contributor — verify it alone doesn't dominate.
    const smile = blendshapesToVisemes(
      makeBlend({mouthSmileLeft: 0.8, mouthSmileRight: 0.8})
    );
    expect(stretch.ee).toBeGreaterThan(smile.ee);
  });

  it('clips values below the dead-zone threshold to zero', () => {
    // Sub-dead-zone jawOpen should not register at all. The dead-zone
    // protects against MediaPipe FaceLandmarker's per-face rest-pose
    // baseline (jawOpen typically sits at 0.05-0.15 at rest) showing up
    // as a permanently slightly-open avatar mouth.
    const out = blendshapesToVisemes(makeBlend({jawOpen: 0.08}));
    expect(out.jawOpen).toBe(0);
    expect(out.aa).toBe(0);
  });

  it('outputs are clamped to [0, 1]', () => {
    const out = blendshapesToVisemes(
      makeBlend({jawOpen: 2.0, mouthPucker: 2.0, mouthFunnel: 2.0})
    );
    for (const v of Object.values(out)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('requires exactly 52 blendshape inputs (ARKit-compatible)', () => {
    expect(ARKIT_BLENDSHAPE_NAMES).toHaveLength(52);
  });
});
