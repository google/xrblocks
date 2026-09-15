import {describe, it, expect} from 'vitest';
import * as THREE from 'three';

import {Detected3DObject} from './Detected3DObject';

function makeAxisAlignedObj(
  centerX: number,
  centerY: number,
  centerZ: number,
  hx: number,
  hy: number,
  hz: number
): Detected3DObject {
  return new Detected3DObject('test', 'furniture', {
    center: new THREE.Vector3(centerX, centerY, centerZ),
    size: new THREE.Vector3(hx * 2, hy * 2, hz * 2),
    angle: 0,
  });
}

describe('Detected3DObject.nearestSurfacePointTo — axis-aligned box', () => {
  // Box at origin, half-extents (1, 1, 1)
  const obj = makeAxisAlignedObj(0, 0, 0, 1, 1, 1);

  it('returns the face point for a query outside the box', () => {
    // Query at (3, 0, 0) → nearest surface point on +X face = (1, 0, 0)
    const result = obj.nearestSurfacePointTo(new THREE.Vector3(3, 0, 0));
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it('returns a corner point for a query beyond a corner', () => {
    // Query at (3, 3, 3) → nearest surface point = (1, 1, 1)
    const result = obj.nearestSurfacePointTo(new THREE.Vector3(3, 3, 3));
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(1);
    expect(result.z).toBeCloseTo(1);
  });

  it('projects to the nearest face when query is inside the box', () => {
    // Query at (0.8, 0, 0) — inside the box, closest to the +X face
    const result = obj.nearestSurfacePointTo(new THREE.Vector3(0.8, 0, 0));
    expect(result.x).toBeCloseTo(1); // snapped to +X face
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0);
  });

  it('projects to +Y face when query is just inside the top', () => {
    // Query at (0, 0.9, 0) — inside, dx=0.1, dy=0.1 both equal, but y wins ties
    // when query is most penetrating through Y
    const result = obj.nearestSurfacePointTo(new THREE.Vector3(0, 0.95, 0));
    expect(result.y).toBeCloseTo(1);
  });

  it('writes into the provided `out` vector to avoid allocation', () => {
    const out = new THREE.Vector3();
    const ret = obj.nearestSurfacePointTo(new THREE.Vector3(3, 0, 0), out);
    expect(ret).toBe(out); // same reference
    expect(out.x).toBeCloseTo(1);
  });
});

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

describe('Detected3DObject construction', () => {
  it('keeps position in sync with obb.center', () => {
    const center = new THREE.Vector3(1, 2, 3);
    const obj = new Detected3DObject('lamp', 'light', {
      center,
      size: new THREE.Vector3(0.4, 0.6, 0.4),
      angle: 0,
    });
    expect(obj.position.x).toBeCloseTo(1);
    expect(obj.position.y).toBeCloseTo(2);
    expect(obj.position.z).toBeCloseTo(3);
    expect(obj.obb.center.x).toBeCloseTo(1);
  });

  it('converts size to halfExtents correctly', () => {
    const obj = new Detected3DObject('sofa', 'furniture', {
      center: new THREE.Vector3(0, 0, 0),
      size: new THREE.Vector3(2, 1, 0.8),
      angle: 0,
    });
    expect(obj.obb.halfExtents.x).toBeCloseTo(1);
    expect(obj.obb.halfExtents.y).toBeCloseTo(0.5);
    expect(obj.obb.halfExtents.z).toBeCloseTo(0.4);
  });

  it('sets the fusion bookkeeping fields from the initial OBB', () => {
    const obj = new Detected3DObject('book', 'small', {
      center: new THREE.Vector3(0.5, 1.0, -0.3),
      size: new THREE.Vector3(0.2, 0.05, 0.3),
      angle: 0.1,
    });
    expect(obj._fusionSamples).toBe(1);
    expect(obj._fusionAngle).toBeCloseTo(0.1);
    expect(obj._fusionCenter.x).toBeCloseTo(0.5);
    expect(obj._fusionSize.z).toBeCloseTo(0.3);
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
