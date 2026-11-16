import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {estimateRoomYawFromMesh, RoomFrameAccumulator} from './RoomFrame';
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

describe('estimateRoomYawFromMesh', () => {
  // Room yaws in degrees, chosen away from the 0° / 45° / 90° symmetries of
  // the 4θ vote so a bias toward the cardinal axes would show up.
  const ROTATED_ROOM_YAWS_DEG = [17, 30, 41];

  it('recovers a rotated room', () => {
    for (const d of ROTATED_ROOM_YAWS_DEG) {
      const frame = estimateRoomYawFromMesh(roomMesh(d))!;
      expect(Math.abs(yawDelta90(frame.yaw, deg(d)))).toBeLessThan(deg(1.5));
      expect(frame.confidence).toBeGreaterThan(0.9);
    }
  });

  /**
   * Pins the skirt filter. Depth meshes bridge discontinuities with long
   * triangles whose normals are silhouette artefacts; without `maxEdge` they
   * outvote the real walls because their area is large.
   */
});

describe('RoomFrameAccumulator', () => {
  const frame = (yawDeg: number, confidence = 0.95, supportArea = 10) => ({
    yaw: deg(yawDeg),
    confidence,
    supportArea,
    triangles: 500,
  });

  it('holds its ground on a single outlier', () => {
    const acc = new RoomFrameAccumulator();
    acc.push(frame(17));
    const afterOutlier = acc.push(frame(60))!;
    expect(Math.abs(yawDelta90(afterOutlier.yaw, deg(17)))).toBeLessThan(
      deg(1)
    );
  });
});
