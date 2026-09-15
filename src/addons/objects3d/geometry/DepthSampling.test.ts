import {describe, it, expect} from 'vitest';
import * as THREE from 'three';

import {uvToNdc} from './DepthSampling';

describe('uvToNdc', () => {
  const out = new THREE.Vector2();

  it('maps (0.5, 0.5) to origin when aspects match', () => {
    uvToNdc(0.5, 0.5, 1, 1, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0);
  });

  it('maps corners correctly when aspects match', () => {
    uvToNdc(0, 0, 1, 1, out);
    expect(out.x).toBeCloseTo(-1);
    expect(out.y).toBeCloseTo(1);

    uvToNdc(1, 1, 1, 1, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(-1);
  });

  it('is a no-op scale when snapAspect equals camAspect', () => {
    uvToNdc(0.25, 0.75, 16 / 9, 16 / 9, out);
    const expectedX = 0.25 * 2 - 1; // -0.5
    const expectedY = (1 - 0.75) * 2 - 1; // -0.5
    expect(out.x).toBeCloseTo(expectedX);
    expect(out.y).toBeCloseTo(expectedY);
  });

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

  it('compresses vertical when snapshot is wider than camera', () => {
    // snapAspect = 2, camAspect = 1
    // sx = 1, sy = 1/2
    uvToNdc(0.5, 0, 2, 1, out);
    // x = 0, y = 1 * 0.5 = 0.5
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(0.5);

    uvToNdc(0.5, 1, 2, 1, out);
    // x = 0, y = -1 * 0.5 = -0.5
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(-0.5);
  });

  it('treats null snapAspect as equal to camAspect (no correction)', () => {
    uvToNdc(0.5, 0, null, 1.5, out);
    expect(out.y).toBeCloseTo(1); // full-range no compression
  });

  it('treats undefined snapAspect as equal to camAspect (no correction)', () => {
    uvToNdc(0.5, 0, undefined, 1.5, out);
    expect(out.y).toBeCloseTo(1);
  });
});
