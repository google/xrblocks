import {describe, it, expect} from 'vitest';
import * as THREE from 'three';

import {Detected3DObject} from './Detected3DObject';

describe('Detected3DObject.nearestSurfacePointTo — rotated box (90° yaw)', () => {
  // Box at origin, half-extents (2, 1, 0.5), rotated 90° around Y
  // After rotation: local X axis becomes world -Z, local Z axis becomes world X
  const obj = new Detected3DObject('test', 'furniture', {
    center: new THREE.Vector3(0, 0, 0),
    size: new THREE.Vector3(4, 2, 1), // he = (2, 1, 0.5)
    angle: Math.PI / 2,
  });

  it('correctly handles a query along the rotated axis', () => {
    // In world space the +Z face of the original box becomes the -X side after
    // 90° yaw. A query at world (0, 0, 5) is along local +X of the rotated box
    // (world Z → local X after inverse 90°-yaw rotation).
    // Expected nearest surface point: local (2, 0, 0) → world (0, 0, 2).
    const q = new THREE.Vector3(0, 0, 5);
    const result = obj.nearestSurfacePointTo(q);
    // The box is 4m wide in local X = 4m in world Z direction
    // halfExtent along local X = 2m → world Z = 2m
    expect(result.z).toBeCloseTo(2, 1);
    expect(Math.abs(result.x)).toBeLessThan(0.01);
    expect(Math.abs(result.y)).toBeLessThan(0.01);
  });
});

describe('Detected3DObject.syncFromInternalObb', () => {
  it('updates public obb and position from new internal state', () => {
    const obj = new Detected3DObject('table', 'furniture', {
      center: new THREE.Vector3(0, 0, 0),
      size: new THREE.Vector3(2, 1, 1),
      angle: 0,
    });
    obj.syncFromInternalObb({
      center: new THREE.Vector3(1, 0.5, 2),
      size: new THREE.Vector3(3, 1.5, 0.8),
      angle: Math.PI / 4,
    });
    expect(obj.obb.center.x).toBeCloseTo(1);
    expect(obj.obb.halfExtents.x).toBeCloseTo(1.5);
    expect(obj.obb.halfExtents.y).toBeCloseTo(0.75);
    expect(obj.position.x).toBeCloseTo(1);
  });
});
