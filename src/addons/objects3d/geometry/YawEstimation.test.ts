import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  canonicalizeYawObb,
  localToWorldXZ,
  minAreaRectXZ,
  pcaYawXZ,
  ransacVerticalPlane,
  yawDelta90,
} from './YawEstimation';

/** Deterministic PRNG (mulberry32) so RANSAC tests cannot flake. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rotate a local (u, v) footprint point into world XZ at yaw `a`. */
function at(u: number, v: number, a: number) {
  return localToWorldXZ(u, v, a);
}

const deg = THREE.MathUtils.degToRad;

/**
 * The eight corners of an OBB, computed the way the renderer draws it:
 * `BoxGeometry(size)` rotated by `rotation.y = angle` about `center`.
 * Tests assert on corner sets rather than angles wherever an angle has more
 * than one valid representation.
 */
function renderCorners(obb: {
  center: THREE.Vector3;
  size: THREE.Vector3;
  angle: number;
}): THREE.Vector3[] {
  const q = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    obb.angle
  );
  const out: THREE.Vector3[] = [];
  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        out.push(
          new THREE.Vector3(sx * obb.size.x, sy * obb.size.y, sz * obb.size.z)
            .applyQuaternion(q)
            .add(obb.center)
        );
      }
    }
  }
  return out;
}

/** Smallest distance from `p` to any point in `set`. */
function nearestDistance(p: THREE.Vector3, set: THREE.Vector3[]): number {
  return Math.min(...set.map((q) => q.distanceTo(p)));
}

describe('canonicalizeYawObb', () => {
  const base = {
    center: new THREE.Vector3(1, 2, 3),
    size: new THREE.Vector3(2, 1, 0.5),
  };

  it('preserves the rendered volume for angles across the circle', () => {
    for (let d = -180; d <= 180; d += 7) {
      const obb = {...base, size: base.size.clone(), angle: deg(d)};
      const c = canonicalizeYawObb(obb);
      const before = renderCorners(obb);
      const after = renderCorners(c);
      // Same eight corners, possibly in a different order.
      for (const p of before) {
        expect(nearestDistance(p, after)).toBeLessThan(1e-9);
      }
      expect(c.size.y).toBeCloseTo(obb.size.y, 12);
    }
  });
});

describe('minAreaRectXZ', () => {
  /** A filled rectangle footprint of extent w x d, yawed by `a`. */
  const rect = (w: number, d: number, a: number, steps = 12) => {
    const pts = [];
    for (let i = 0; i < steps; ++i) {
      for (let j = 0; j < steps; ++j) {
        pts.push(
          at((i / (steps - 1) - 0.5) * w, (j / (steps - 1) - 0.5) * d, a)
        );
      }
    }
    return pts;
  };

  it('recovers a rotated rectangle', () => {
    for (const d of [15, 30, 60, -25]) {
      const r = minAreaRectXZ(rect(2, 1, deg(d)))!;
      expect(Math.abs(yawDelta90(r.angle, deg(d)))).toBeLessThan(deg(2));
    }
  });

  /**
   * The case that justifies preferring the rectangle fit over PCA. Two visible
   * faces of a piece of furniture form an L; PCA's principal axis bisects the
   * two legs and lands ~45 degrees off, while the minimising rectangle locks
   * onto the faces.
   */
  it('beats PCA on an L-shaped two-face scan', () => {
    const a = deg(30);
    const pts = [];
    for (let i = 0; i < 60; ++i) {
      pts.push(at((i / 59) * 1.2, 0, a)); // along u
      pts.push(at(0, (i / 59) * 1.2, a)); // along v
    }
    const rectFit = minAreaRectXZ(pts)!;
    expect(Math.abs(yawDelta90(rectFit.angle, a))).toBeLessThan(deg(3));

    let cx = 0,
      cz = 0;
    for (const p of pts) {
      cx += p.x;
      cz += p.z;
    }
    const pca = pcaYawXZ(pts, cx / pts.length, cz / pts.length)!;
    // PCA lands near the bisector, i.e. ~45 degrees off in the mod-90 domain.
    expect(Math.abs(yawDelta90(pca.angle, a))).toBeGreaterThan(deg(30));
  });
});

describe('ransacVerticalPlane', () => {
  it('finds a vertical wall among floor clutter', () => {
    const pts: THREE.Vector3[] = [];
    // A vertical plane at 25 degrees.
    for (let i = 0; i < 60; ++i) {
      const p = at((i / 59 - 0.5) * 2, 0, deg(25));
      pts.push(new THREE.Vector3(p.x, (i % 6) * 0.2, p.z));
    }
    // Plus horizontal floor points, which a general plane fit might prefer.
    for (let i = 0; i < 40; ++i) {
      pts.push(new THREE.Vector3((i % 8) * 0.2, 0, Math.floor(i / 8) * 0.2));
    }
    const fit = ransacVerticalPlane(pts, {rng: seededRng(11)})!;
    expect(fit).not.toBeNull();
    expect(Math.abs(fit.normal.y)).toBeLessThan(1e-9);
    // The wall runs along 25 degrees, so its normal is 90 degrees off — the
    // same class in the mod-90 domain.
    const normalYaw = Math.atan2(fit.normal.x, fit.normal.z);
    expect(Math.abs(yawDelta90(normalYaw, deg(25)))).toBeLessThan(deg(4));
  });
});
