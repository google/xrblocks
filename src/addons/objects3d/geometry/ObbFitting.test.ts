import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  buildYawAlignedObb,
  fitFurnitureOBB,
  fitYawOBB,
  ransacPlane,
} from './ObbFitting';
import type {InternalObb} from './ObbFitting';
import {localToWorldXZ, yawDelta90} from './YawEstimation';

const deg = THREE.MathUtils.degToRad;

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

describe('fitFurnitureOBB', () => {
  it('returns null below six points', () => {
    expect(fitFurnitureOBB(boxPoints(1, 1, 1, 0, undefined, 1))).toBeNull();
  });

  it('encloses an axis-aligned box', () => {
    const pts = boxPoints(2, 1, 0.8, 0);
    const obb = fitFurnitureOBB(pts)!;
    expect(obb).not.toBeNull();
    expect(Math.abs(yawDelta90(obb.angle, 0))).toBeLessThan(1e-6);
    expect(obb.size.x).toBeCloseTo(2, 1);
    expect(obb.size.z).toBeCloseTo(0.8, 1);
    for (const p of pts) {
      expect(obbSignedDistance(obb, p)).toBeLessThan(0.06);
    }
  });

  it('contains its points once cardinal snapping has inflated the footprint', () => {
    // Snapping a rotated cloud to an axis-aligned frame legitimately clips the
    // extreme corners at the 5/95 percentile, so allow a modest overhang; the
    // point here is that nothing escapes wildly.
    for (const d of [15, 30, 40, -25]) {
      const pts = boxPoints(2.0, 1.0, 0.6, deg(d));
      const obb = fitFurnitureOBB(pts)!;
      const worst = Math.max(...pts.map((p) => obbSignedDistance(obb, p)));
      expect(worst).toBeLessThan(0.2);
    }
  });

  it('places the centre at the point cloud centre', () => {
    const c = new THREE.Vector3(1.5, 0.8, -2.25);
    const obb = fitFurnitureOBB(boxPoints(1.2, 0.9, 0.7, deg(20), c))!;
    expect(obb.center.distanceTo(c)).toBeLessThan(0.08);
  });

  it('snaps yaw to a multiple of 90 degrees in cardinal mode (legacy)', () => {
    for (const d of [0, 12, 30, 44, 61, 89, 130, -37]) {
      const obb = fitFurnitureOBB(boxPoints(2, 1, 0.7, deg(d)), {
        orientation: {mode: 'cardinal'},
      })!;
      const quarter = obb.angle / (Math.PI / 2);
      expect(Math.abs(quarter - Math.round(quarter))).toBeLessThan(1e-6);
    }
  });
});

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

  it('keeps a confidently off-grid object off the room grid', () => {
    // Room at 17 degrees, object at 47 degrees: 30 degrees off the grid, well
    // beyond the snap tolerance, so the measured angle must survive.
    const obb = fitFurnitureOBB(rotatedBox(47), {
      orientation: {
        mode: 'roomFrame',
        roomYaw: deg(17),
        roomYawConfidence: 0.9,
      },
    })!;
    expect(Math.abs(yawDelta90(obb.angle, deg(47)))).toBeLessThan(deg(5));
    expect(Math.abs(yawDelta90(obb.angle, deg(17)))).toBeGreaterThan(deg(15));
  });

  it('snaps a nearly-aligned object onto the room grid', () => {
    const obb = fitFurnitureOBB(rotatedBox(20), {
      orientation: {
        mode: 'roomFrame',
        roomYaw: deg(17),
        roomYawConfidence: 0.9,
      },
    })!;
    expect(Math.abs(yawDelta90(obb.angle, deg(17)))).toBeLessThan(1e-6);
    expect(obb.yawMethod).toBe('roomFrame-snap');
  });

  it('falls back to the room frame for an ill-determined footprint', () => {
    // A round blob has no meaningful orientation.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 240; ++i) {
      const t = (i / 240) * Math.PI * 2;
      const r = 0.4 * (0.6 + (0.4 * ((i * 7919) % 97)) / 97);
      pts.push(
        new THREE.Vector3(Math.cos(t) * r, (i % 5) * 0.05, Math.sin(t) * r)
      );
    }
    const obb = fitFurnitureOBB(pts, {
      orientation: {
        mode: 'roomFrame',
        roomYaw: deg(17),
        roomYawConfidence: 0.9,
      },
    })!;
    expect(Math.abs(yawDelta90(obb.angle, deg(17)))).toBeLessThan(1e-6);
    expect(obb.yawMethod).toBe('roomFrame');
  });

  it('degenerates to the world axes when no room frame is available', () => {
    const obb = fitFurnitureOBB(rotatedBox(30), {
      orientation: {mode: 'roomFrame', roomYaw: null},
    })!;
    // The measurement is confident, so it survives even without a room frame.
    expect(Math.abs(yawDelta90(obb.angle, deg(30)))).toBeLessThan(deg(5));
  });

  it('ignores a low-confidence room frame', () => {
    const obb = fitFurnitureOBB(rotatedBox(5), {
      orientation: {
        mode: 'roomFrame',
        roomYaw: deg(40),
        roomYawConfidence: 0.05,
      },
    })!;
    // Room frame is not trusted, so this snaps to the world axes instead of 40.
    expect(Math.abs(yawDelta90(obb.angle, 0))).toBeLessThan(1e-6);
  });

  it('is stable across the 45 degree boundary', () => {
    // 45 degrees is the antipode of the mod-90 domain, where the canonical
    // representative legitimately flips sign. The drawn box must not.
    const a = fitFurnitureOBB(rotatedBox(44.5), {orientation: {mode: 'free'}})!;
    const b = fitFurnitureOBB(rotatedBox(45.5), {orientation: {mode: 'free'}})!;
    expect(Math.abs(yawDelta90(a.angle, b.angle))).toBeLessThan(deg(4));
  });

  it('reports confidence and method', () => {
    const obb = fitFurnitureOBB(rotatedBox(30), {orientation: {mode: 'free'}})!;
    expect(obb.yawConfidence).toBeGreaterThan(0);
    expect(obb.yawConfidence).toBeLessThanOrEqual(1);
    expect(typeof obb.yawMethod).toBe('string');
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
  it('recovers the true extents when told the true yaw', () => {
    for (const d of [10, 30, 45, 70, -20]) {
      const a = deg(d);
      const pts = boxPoints(2.0, 1.0, 0.6, a, new THREE.Vector3(), 8);
      const obb = buildYawAlignedObb(pts, 0, 0, a);
      // With the mirrored convention these come out as the extents of the
      // cloud measured along the wrong axes, i.e. visibly inflated.
      expect(obb.size.x).toBeCloseTo(2.0, 1);
      expect(obb.size.z).toBeCloseTo(0.6, 1);
      expect(obb.angle).toBeCloseTo(a, 12);
    }
  });

  it('produces a box that encloses the points it was fitted to', () => {
    for (const d of [10, 30, 45, 70, -20]) {
      const a = deg(d);
      const pts = boxPoints(2.0, 1.0, 0.6, a, new THREE.Vector3(2, 0, -1), 8);
      const obb = buildYawAlignedObb(pts, 2, -1, a);
      const worst = Math.max(...pts.map((p) => obbSignedDistance(obb, p)));
      expect(worst).toBeLessThan(0.02);
    }
  });

  it('centres the box on the cloud regardless of the seed centre', () => {
    const a = deg(35);
    const c = new THREE.Vector3(1.25, 0.5, -0.75);
    const pts = boxPoints(1.5, 0.8, 0.5, a, c, 8);
    // Seed deliberately offset from the true centre.
    const obb = buildYawAlignedObb(pts, 0, 0, a);
    expect(obb.center.x).toBeCloseTo(c.x, 1);
    expect(obb.center.z).toBeCloseTo(c.z, 1);
  });
});

describe('fitYawOBB dispatch', () => {
  it('falls back to the furniture fitter for an unknown category', () => {
    const pts = boxPoints(2, 1, 0.8, 0);
    const viaDispatch = fitYawOBB(pts, {category: 'nonsense'});
    const direct = fitFurnitureOBB(pts)!;
    expect(viaDispatch).not.toBeNull();
    expect(viaDispatch!.angle).toBeCloseTo(direct.angle, 12);
    expect(viaDispatch!.size.x).toBeCloseTo(direct.size.x, 12);
  });

  it('returns null for too few points', () => {
    expect(
      fitYawOBB([new THREE.Vector3()], {category: 'furniture'})
    ).toBeNull();
  });

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

describe('ransacPlane', () => {
  it('is reproducible with an injected rng', () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 40; ++i) {
      pts.push(new THREE.Vector3((i % 8) * 0.1, Math.floor(i / 8) * 0.1, 0));
    }
    const a = ransacPlane(pts, 40, 0.01, seededRng(7))!;
    const b = ransacPlane(pts, 40, 0.01, seededRng(7))!;
    expect(a).not.toBeNull();
    expect(a.normal.x).toBeCloseTo(b.normal.x, 12);
    expect(a.normal.y).toBeCloseTo(b.normal.y, 12);
    expect(a.normal.z).toBeCloseTo(b.normal.z, 12);
  });

  it('recovers a known plane normal', () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 60; ++i) {
      pts.push(
        new THREE.Vector3((i % 10) * 0.1, Math.floor(i / 10) * 0.1, 2.0)
      );
    }
    const plane = ransacPlane(pts, 60, 0.01, seededRng(3))!;
    expect(plane).not.toBeNull();
    expect(Math.abs(plane.normal.z)).toBeCloseTo(1, 3);
    expect(plane.point.z).toBeCloseTo(2.0, 3);
  });

  it('defaults to Math.random when no rng is given', () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 30; ++i) {
      pts.push(new THREE.Vector3((i % 6) * 0.1, Math.floor(i / 6) * 0.1, 0));
    }
    expect(ransacPlane(pts, 40, 0.01)).not.toBeNull();
  });
});
