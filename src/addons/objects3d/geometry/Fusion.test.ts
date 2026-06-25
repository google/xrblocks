import {describe, it, expect} from 'vitest';
import * as THREE from 'three';

import {box2dIoU, snapBoxToFloor} from './Fusion';

function makeBox2(minX: number, minY: number, maxX: number, maxY: number) {
  return new THREE.Box2(
    new THREE.Vector2(minX, minY),
    new THREE.Vector2(maxX, maxY)
  );
}

describe('box2dIoU', () => {
  it('returns 0 for null inputs', () => {
    expect(box2dIoU(null, null)).toBe(0);
    expect(box2dIoU(makeBox2(0, 0, 1, 1), null)).toBe(0);
    expect(box2dIoU(null, makeBox2(0, 0, 1, 1))).toBe(0);
  });

  it('returns 1 for identical boxes', () => {
    const a = makeBox2(0, 0, 1, 1);
    const b = makeBox2(0, 0, 1, 1);
    expect(box2dIoU(a, b)).toBeCloseTo(1);
  });

  it('returns 0 for non-overlapping boxes', () => {
    const a = makeBox2(0, 0, 0.4, 0.4);
    const b = makeBox2(0.6, 0.6, 1.0, 1.0);
    expect(box2dIoU(a, b)).toBeCloseTo(0);
  });

  it('returns the correct IoU for partially overlapping boxes', () => {
    // Two 0.5×0.5 boxes overlapping by 0.25×0.25
    const a = makeBox2(0, 0, 0.5, 0.5);
    const b = makeBox2(0.25, 0.25, 0.75, 0.75);
    // intersection = 0.25 * 0.25 = 0.0625
    // union = 0.25 + 0.25 - 0.0625 = 0.4375
    expect(box2dIoU(a, b)).toBeCloseTo(0.0625 / 0.4375);
  });

  it('is symmetric', () => {
    const a = makeBox2(0.1, 0.1, 0.6, 0.5);
    const b = makeBox2(0.3, 0.0, 0.8, 0.7);
    expect(box2dIoU(a, b)).toBeCloseTo(box2dIoU(b, a));
  });
});

describe('snapBoxToFloor', () => {
  it('does nothing when floorY is null', () => {
    const obb = {
      center: new THREE.Vector3(0, 0.5, 0),
      size: new THREE.Vector3(1, 1, 1),
      angle: 0,
    };
    const result = snapBoxToFloor(obb, null);
    expect(result.center.y).toBeCloseTo(0.5);
    expect(result.size.y).toBeCloseTo(1);
  });

  it('does nothing when box is above the floor', () => {
    const obb = {
      center: new THREE.Vector3(0, 1, 0),
      size: new THREE.Vector3(1, 1, 1),
      angle: 0,
    };
    snapBoxToFloor(obb, 0.0, 0.05);
    // bottom = 1 - 0.5 = 0.5 > 0 - 0.05, so no snap
    expect(obb.center.y).toBeCloseTo(1);
  });

  it('snaps the box bottom to the floor when it dips below', () => {
    const obb = {
      center: new THREE.Vector3(0, 0.4, 0),
      size: new THREE.Vector3(1, 1, 1),
      angle: 0,
    };
    // bottom = 0.4 - 0.5 = -0.1, floorY = 0, slack = 0.05
    // -0.1 < 0 - 0.05 = -0.05 → snap
    snapBoxToFloor(obb, 0, 0.05);
    // top stays at 0.4 + 0.5 = 0.9
    // new sizeY = 0.9 - 0 = 0.9
    // new centerY = 0 + 0.9/2 = 0.45
    expect(obb.size.y).toBeCloseTo(0.9);
    expect(obb.center.y).toBeCloseTo(0.45);
  });
});
