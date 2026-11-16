import {describe, it, expect} from 'vitest';
import * as THREE from 'three';

import {uvToNdc} from './DepthSampling';

describe('uvToNdc', () => {
  const out = new THREE.Vector2();

  it('compresses horizontal when snapshot is narrower than camera', () => {
    // snapAspect = 1 (square), camAspect = 2 (wide)
    // sx = 1/2, sy = 1
    uvToNdc(0, 0.5, 1, 2, out);
    // x = (-1) * 0.5 = -0.5
    // y = 0
    expect(out.x).toBeCloseTo(-0.5);
    expect(out.y).toBeCloseTo(0);

    uvToNdc(1, 0.5, 1, 2, out);
    // x = 1 * 0.5 = 0.5
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(0);
  });
});
