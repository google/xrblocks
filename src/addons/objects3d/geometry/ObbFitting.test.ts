import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {buildYawAlignedObb, fitFurnitureOBB, fitYawOBB} from './ObbFitting';
import type {InternalObb} from './ObbFitting';
import {localToWorldXZ, yawDelta90} from './YawEstimation';

const deg = THREE.MathUtils.degToRad;

/** Deterministic PRNG (mulberry32) so RANSAC tests cannot flake. */

/**
 * A filled box of samples of full extent `w` (u) x `h` (y) x `d` (v), centred
 * at `center` and yawed by `angle` using the renderer's convention.
 */
function boxPoints(
  w: number,
  h: number,
  d: number,
  angle: number,
  center = new THREE.Vector3(),
  steps = 6
): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < steps; ++i) {
    for (let j = 0; j < steps; ++j) {
      for (let k = 0; k < steps; ++k) {
        const u = (i / (steps - 1) - 0.5) * w;
        const y = (j / (steps - 1) - 0.5) * h;
        const v = (k / (steps - 1) - 0.5) * d;
        const p = localToWorldXZ(u, v, angle);
        out.push(
          new THREE.Vector3(center.x + p.x, center.y + y, center.z + p.z)
        );
      }
    }
  }
  return out;
}

/** Signed distance of `p` from the OBB, in the box's own frame (negative = inside). */
function obbSignedDistance(obb: InternalObb, p: THREE.Vector3): number {
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), obb.angle)
    .invert();
  const local = p.clone().sub(obb.center).applyQuaternion(q);
  return Math.max(
    Math.abs(local.x) - obb.size.x / 2,
    Math.abs(local.y) - obb.size.y / 2,
    Math.abs(local.z) - obb.size.z / 2
  );
}

describe('orientation modes', () => {
  /** A clearly box-shaped footprint, yawed by `d` degrees. */
  const rotatedBox = (d: number) =>
    boxPoints(1.8, 0.9, 0.7, deg(d), new THREE.Vector3(), 8);

  it("keeps a genuinely rotated object's angle in free mode", () => {
    for (const d of [20, 35, -30]) {
      const obb = fitFurnitureOBB(rotatedBox(d), {
        orientation: {mode: 'free'},
      })!;
      expect(Math.abs(yawDelta90(obb.angle, deg(d)))).toBeLessThan(deg(4));
    }
  });
});

/**
 * The sign-convention guard.
 *
 * `fitFurnitureOBB` used to project points onto (cos a, +sin a) while the
 * renderer draws along (cos a, -sin a), so extents were measured along the
 * mirror of the axes they are drawn along. Cardinal snapping hid this,
 * because at multiples of 90 degrees the two axis pairs coincide — which is
 * exactly why the bug survived. These tests drive the projection at free
 * angles, where a mirrored axis produces a box rotated by -2*theta relative
 * to its data.
 */
describe('buildYawAlignedObb (render-convention guard)', () => {
  it('produces a box that encloses the points it was fitted to', () => {
    for (const d of [10, 30, 45, 70, -20]) {
      const a = deg(d);
      const pts = boxPoints(2.0, 1.0, 0.6, a, new THREE.Vector3(2, 0, -1), 8);
      const obb = buildYawAlignedObb(pts, 2, -1, a);
      const worst = Math.max(...pts.map((p) => obbSignedDistance(obb, p)));
      expect(worst).toBeLessThan(0.02);
    }
  });
});

describe('fitYawOBB dispatch', () => {
  it('survives an all-identical point cloud', () => {
    const pts = Array.from({length: 20}, () => new THREE.Vector3(1, 1, 1));
    const obb = fitYawOBB(pts, {category: 'furniture'});
    if (obb) {
      expect(obb.size.x).toBeGreaterThan(0);
      expect(obb.size.y).toBeGreaterThan(0);
      expect(obb.size.z).toBeGreaterThan(0);
      expect(Number.isFinite(obb.angle)).toBe(true);
    }
  });
});
