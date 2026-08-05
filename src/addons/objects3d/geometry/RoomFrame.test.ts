import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  estimateRoomYawFromMesh,
  RoomFrameAccumulator,
  yawRelativeToRoom,
} from './RoomFrame';
import {yawDelta90} from './YawEstimation';

const deg = THREE.MathUtils.degToRad;

/**
 * A mesh of four walls enclosing a room of half-extent `half`, rotated by
 * `yawDeg` about the origin. Triangles are kept small so they survive the
 * `maxEdge` skirt filter.
 */
function roomMesh(yawDeg: number, half = 2, cell = 0.1): THREE.Mesh {
  const positions: number[] = [];
  const q = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    deg(yawDeg)
  );
  const push = (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z).applyQuaternion(q);
    positions.push(v.x, v.y, v.z);
  };
  // Each wall is a grid of quads in a plane of constant x or z.
  const steps = Math.max(2, Math.round((2 * half) / cell));
  const hSteps = Math.max(2, Math.round(2 / cell));
  for (const [axis, sign] of [
    ['x', 1],
    ['x', -1],
    ['z', 1],
    ['z', -1],
  ] as const) {
    for (let i = 0; i < steps; ++i) {
      for (let j = 0; j < hSteps; ++j) {
        const t0 = -half + (i / steps) * 2 * half;
        const t1 = -half + ((i + 1) / steps) * 2 * half;
        const y0 = (j / hSteps) * 2;
        const y1 = ((j + 1) / hSteps) * 2;
        const fixed = sign * half;
        const corner = (t: number, y: number) =>
          axis === 'x' ? push(fixed, y, t) : push(t, y, fixed);
        corner(t0, y0);
        corner(t1, y0);
        corner(t1, y1);
        corner(t0, y0);
        corner(t1, y1);
        corner(t0, y1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld();
  return mesh;
}

/** A mesh of only horizontal (floor) triangles. */
function floorMesh(): THREE.Mesh {
  const positions: number[] = [];
  for (let i = 0; i < 20; ++i) {
    for (let j = 0; j < 20; ++j) {
      const x0 = i * 0.1,
        x1 = x0 + 0.1;
      const z0 = j * 0.1,
        z1 = z0 + 0.1;
      positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1);
      positions.push(x0, 0, z0, x1, 0, z1, x0, 0, z1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  return new THREE.Mesh(geometry);
}

describe('estimateRoomYawFromMesh', () => {
  it('recovers an axis-aligned room', () => {
    const frame = estimateRoomYawFromMesh(roomMesh(0))!;
    expect(frame).not.toBeNull();
    expect(Math.abs(yawDelta90(frame.yaw, 0))).toBeLessThan(deg(1.5));
    expect(frame.confidence).toBeGreaterThan(0.9);
    expect(frame.supportArea).toBeGreaterThan(1);
  });

  it('recovers a rotated room', () => {
    for (const d of [17, 30, 41]) {
      const frame = estimateRoomYawFromMesh(roomMesh(d))!;
      expect(Math.abs(yawDelta90(frame.yaw, deg(d)))).toBeLessThan(deg(1.5));
      expect(frame.confidence).toBeGreaterThan(0.9);
    }
  });

  it('handles the wrap at 89 degrees', () => {
    const frame = estimateRoomYawFromMesh(roomMesh(89))!;
    expect(Math.abs(yawDelta90(frame.yaw, deg(89)))).toBeLessThan(deg(1.5));
    expect(frame.yaw).toBeGreaterThanOrEqual(0);
    expect(frame.yaw).toBeLessThan(Math.PI / 2);
  });

  it('returns null for a floor-only mesh', () => {
    expect(estimateRoomYawFromMesh(floorMesh())).toBeNull();
  });

  it('reports low confidence for a cylindrical room', () => {
    const positions: number[] = [];
    const N = 240;
    for (let i = 0; i < N; ++i) {
      const t0 = (i / N) * Math.PI * 2;
      const t1 = ((i + 1) / N) * Math.PI * 2;
      const r = 2;
      const x0 = Math.cos(t0) * r,
        z0 = Math.sin(t0) * r;
      const x1 = Math.cos(t1) * r,
        z1 = Math.sin(t1) * r;
      for (let j = 0; j < 12; ++j) {
        const y0 = j * 0.15,
          y1 = y0 + 0.15;
        positions.push(x0, y0, z0, x1, y0, z1, x1, y1, z1);
        positions.push(x0, y0, z0, x1, y1, z1, x0, y1, z0);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const frame = estimateRoomYawFromMesh(new THREE.Mesh(geometry))!;
    expect(frame).not.toBeNull();
    expect(frame.confidence).toBeLessThan(0.25);
  });

  /**
   * Pins the skirt filter. Depth meshes bridge discontinuities with long
   * triangles whose normals are silhouette artefacts; without `maxEdge` they
   * outvote the real walls because their area is large.
   */
  it('rejects stretched skirt triangles', () => {
    const mesh = roomMesh(20);
    const positions = Array.from(
      (mesh.geometry.attributes['position'] as THREE.BufferAttribute)
        .array as Float32Array
    );
    // Huge triangles bridging opposite walls. They are *vertical*, so the
    // verticality filter admits them and only maxEdge can reject them, and
    // their normals point ~30 degrees off the room grid.
    for (let i = 0; i < 12; ++i) {
      const y = i * 0.15;
      // Long horizontal edge plus a purely vertical edge => horizontal normal.
      positions.push(-2, y, -2, 2, y, 1.4, -2, y + 1.5, -2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const dirty = new THREE.Mesh(geometry);

    const filtered = estimateRoomYawFromMesh(dirty)!;
    expect(Math.abs(yawDelta90(filtered.yaw, deg(20)))).toBeLessThan(deg(2));

    // With the filter effectively disabled the skirts are admitted and drag
    // the support area up with off-grid normals.
    const unfiltered = estimateRoomYawFromMesh(dirty, {maxEdge: 100})!;
    expect(unfiltered.supportArea).toBeGreaterThan(filtered.supportArea);
    expect(unfiltered.confidence).toBeLessThan(filtered.confidence);
  });

  it('honours the range cap', () => {
    const near = estimateRoomYawFromMesh(roomMesh(0), {
      viewerPosition: new THREE.Vector3(0, 1, 0),
      maxRange: 10,
    })!;
    const clipped = estimateRoomYawFromMesh(roomMesh(0), {
      viewerPosition: new THREE.Vector3(0, 1, 0),
      maxRange: 2.05,
    });
    expect(near).not.toBeNull();
    // A 2 m half-extent room is mostly beyond a 2.05 m radius at the corners.
    if (clipped) {
      expect(clipped.supportArea).toBeLessThan(near.supportArea);
    }
  });

  it('returns null for an empty geometry', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    expect(estimateRoomYawFromMesh(new THREE.Mesh(geometry))).toBeNull();
  });

  it('applies the mesh world matrix', () => {
    const mesh = roomMesh(0);
    mesh.rotation.y = deg(25);
    mesh.updateMatrixWorld();
    const frame = estimateRoomYawFromMesh(mesh)!;
    expect(Math.abs(yawDelta90(frame.yaw, deg(25)))).toBeLessThan(deg(2));
  });
});

describe('RoomFrameAccumulator', () => {
  const frame = (yawDeg: number, confidence = 0.95, supportArea = 10) => ({
    yaw: deg(yawDeg),
    confidence,
    supportArea,
    triangles: 500,
  });

  it('starts empty', () => {
    expect(new RoomFrameAccumulator().current).toBeNull();
  });

  it('ignores null estimates', () => {
    const acc = new RoomFrameAccumulator();
    expect(acc.push(null)).toBeNull();
  });

  it('averages consistent estimates', () => {
    const acc = new RoomFrameAccumulator();
    acc.push(frame(17));
    const result = acc.push(frame(18))!;
    expect(Math.abs(yawDelta90(result.yaw, deg(17.5)))).toBeLessThan(deg(0.5));
  });

  it('holds its ground on a single outlier', () => {
    const acc = new RoomFrameAccumulator();
    acc.push(frame(17));
    const afterOutlier = acc.push(frame(60))!;
    expect(Math.abs(yawDelta90(afterOutlier.yaw, deg(17)))).toBeLessThan(
      deg(1)
    );
  });

  it('re-seeds after sustained drift', () => {
    const acc = new RoomFrameAccumulator();
    acc.push(frame(17));
    acc.push(frame(60));
    const result = acc.push(frame(60))!;
    expect(Math.abs(yawDelta90(result.yaw, deg(60)))).toBeLessThan(deg(1));
  });

  it('clears on reset', () => {
    const acc = new RoomFrameAccumulator();
    acc.push(frame(17));
    acc.reset();
    expect(acc.current).toBeNull();
  });
});

describe('yawRelativeToRoom', () => {
  it('is zero for an aligned object', () => {
    expect(
      Math.abs(
        yawRelativeToRoom(deg(17), {
          yaw: deg(17),
          confidence: 1,
          supportArea: 5,
          triangles: 1,
        })
      )
    ).toBeLessThan(1e-9);
  });

  it('treats a 90 degree offset as aligned', () => {
    expect(
      Math.abs(
        yawRelativeToRoom(deg(107), {
          yaw: deg(17),
          confidence: 1,
          supportArea: 5,
          triangles: 1,
        })
      )
    ).toBeLessThan(1e-9);
  });

  it('measures against the world axes without a frame', () => {
    expect(yawRelativeToRoom(deg(10), null)).toBeCloseTo(deg(10), 9);
  });
});
