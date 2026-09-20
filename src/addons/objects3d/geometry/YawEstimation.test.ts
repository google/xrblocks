import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  canonicalizeYawObb,
  combineYawCandidates,
  convexHullXZ,
  localToWorldXZ,
  minAreaRectXZ,
  pcaYawConfidence,
  pcaYawXZ,
  ransacVerticalPlane,
  worldToLocalXZ,
  wrapPi,
  wrapQuarterPi,
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

describe('wrapPi', () => {
  it('wraps into (-pi, pi]', () => {
    expect(wrapPi(0)).toBeCloseTo(0, 10);
    expect(wrapPi(deg(190))).toBeCloseTo(deg(-170), 10);
    expect(wrapPi(deg(-190))).toBeCloseTo(deg(170), 10);
    expect(wrapPi(deg(720))).toBeCloseTo(0, 10);
  });
});

describe('wrapQuarterPi', () => {
  it('wraps into [-45deg, 45deg)', () => {
    expect(wrapQuarterPi(deg(0))).toBeCloseTo(0, 10);
    expect(wrapQuarterPi(deg(30))).toBeCloseTo(deg(30), 10);
    expect(wrapQuarterPi(deg(90))).toBeCloseTo(0, 10);
    expect(wrapQuarterPi(deg(100))).toBeCloseTo(deg(10), 10);
    expect(wrapQuarterPi(deg(-100))).toBeCloseTo(deg(-10), 10);
  });

  it('always lands inside the half-open interval', () => {
    for (let d = -360; d <= 360; d += 3) {
      const w = wrapQuarterPi(deg(d));
      expect(w).toBeGreaterThanOrEqual(-Math.PI / 4 - 1e-12);
      expect(w).toBeLessThan(Math.PI / 4 + 1e-12);
    }
  });
});

describe('yawDelta90', () => {
  it('treats yaws 90 degrees apart as identical', () => {
    // Same box: rotate 90 degrees and swap width/depth.
    expect(Math.abs(yawDelta90(deg(0), deg(90)))).toBeLessThan(1e-9);
    expect(Math.abs(yawDelta90(deg(30), deg(120)))).toBeLessThan(1e-9);
  });

  it('measures small differences with sign', () => {
    expect(yawDelta90(deg(44), deg(46))).toBeCloseTo(deg(-2), 9);
    expect(yawDelta90(deg(89), deg(1))).toBeCloseTo(deg(-2), 9);
    expect(yawDelta90(deg(1), deg(89))).toBeCloseTo(deg(2), 9);
  });

  it('reports maximal disagreement at 45 degrees', () => {
    expect(Math.abs(yawDelta90(deg(0), deg(45)))).toBeCloseTo(Math.PI / 4, 9);
  });
});

describe('worldToLocalXZ / localToWorldXZ', () => {
  it('matches the renderer convention (rotation.y = angle)', () => {
    // three.js Ry(a) maps local +X to world (cos a, 0, -sin a). A point one
    // unit along the box's u axis must therefore land there.
    const a = deg(30);
    const w = localToWorldXZ(1, 0, a);
    expect(w.x).toBeCloseTo(Math.cos(a), 12);
    expect(w.z).toBeCloseTo(-Math.sin(a), 12);

    // Cross-check against three.js itself rather than trusting the algebra.
    const v = new THREE.Vector3(1, 0, 0).applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    );
    expect(w.x).toBeCloseTo(v.x, 12);
    expect(w.z).toBeCloseTo(v.z, 12);
  });

  it('round-trips for arbitrary angles and offsets', () => {
    for (const d of [0, 17, 45, 90, -33, 200]) {
      const a = deg(d);
      const {u, v} = worldToLocalXZ(0.7, -1.3, a);
      const back = localToWorldXZ(u, v, a);
      expect(back.x).toBeCloseTo(0.7, 12);
      expect(back.z).toBeCloseTo(-1.3, 12);
    }
  });
});

describe('canonicalizeYawObb', () => {
  const base = {
    center: new THREE.Vector3(1, 2, 3),
    size: new THREE.Vector3(2, 1, 0.5),
  };

  it('leaves an already-canonical yaw untouched', () => {
    const obb = {...base, angle: deg(20)};
    const c = canonicalizeYawObb(obb);
    expect(c.angle).toBeCloseTo(deg(20), 12);
    expect(c.size.x).toBe(2);
    expect(c.size.z).toBe(0.5);
  });

  it('swaps extents when it rotates by an odd quarter turn', () => {
    const c = canonicalizeYawObb({...base, angle: deg(100)});
    expect(c.angle).toBeCloseTo(deg(10), 9);
    expect(c.size.x).toBeCloseTo(0.5, 12);
    expect(c.size.z).toBeCloseTo(2, 12);
  });

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

  it('does not mutate its input', () => {
    const obb = {...base, size: base.size.clone(), angle: deg(100)};
    canonicalizeYawObb(obb);
    expect(obb.angle).toBeCloseTo(deg(100), 12);
    expect(obb.size.x).toBe(2);
  });
});

describe('convexHullXZ', () => {
  it('drops interior points', () => {
    const hull = convexHullXZ([
      {x: 0, z: 0},
      {x: 2, z: 0},
      {x: 2, z: 2},
      {x: 0, z: 2},
      {x: 1, z: 1},
      {x: 0.5, z: 1.2},
    ]);
    expect(hull).toHaveLength(4);
  });

  it('excludes collinear points on an edge', () => {
    const hull = convexHullXZ([
      {x: 0, z: 0},
      {x: 1, z: 0},
      {x: 2, z: 0},
      {x: 2, z: 2},
      {x: 0, z: 2},
    ]);
    expect(hull).toHaveLength(4);
  });

  it('returns short inputs unchanged', () => {
    expect(
      convexHullXZ([
        {x: 0, z: 0},
        {x: 1, z: 1},
      ])
    ).toHaveLength(2);
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

  it('recovers an axis-aligned rectangle', () => {
    const r = minAreaRectXZ(rect(2, 1, 0))!;
    expect(r).not.toBeNull();
    expect(Math.abs(yawDelta90(r.angle, 0))).toBeLessThan(deg(1));
    expect(Math.max(r.width, r.depth)).toBeCloseTo(2, 1);
    expect(Math.min(r.width, r.depth)).toBeCloseTo(1, 1);
  });

  it('recovers a rotated rectangle', () => {
    for (const d of [15, 30, 60, -25]) {
      const r = minAreaRectXZ(rect(2, 1, deg(d)))!;
      expect(Math.abs(yawDelta90(r.angle, deg(d)))).toBeLessThan(deg(2));
    }
  });

  it('recovers the face direction of a single-face slab', () => {
    // One visible face of a large object: a thin, long slab.
    const pts = [];
    for (let i = 0; i < 80; ++i) {
      pts.push(at((i / 79 - 0.5) * 1.5, ((i % 3) - 1) * 0.01, deg(30)));
    }
    const r = minAreaRectXZ(pts)!;
    expect(Math.abs(yawDelta90(r.angle, deg(30)))).toBeLessThan(deg(2));
    expect(r.supportRatio).toBeGreaterThan(0.8);
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

  it('resists a few far outliers thanks to trimming upstream', () => {
    // Untrimmed, the hull is dragged by extremes; documents why ObbFitting
    // trims to the 2/98 percentile before calling this.
    const pts = rect(2, 1, deg(30));
    const clean = minAreaRectXZ(pts)!;
    pts.push({x: 8, z: -6}, {x: -7, z: 9});
    const dirty = minAreaRectXZ(pts)!;
    expect(Math.abs(yawDelta90(clean.angle, deg(30)))).toBeLessThan(deg(2));
    expect(dirty.area).toBeGreaterThan(clean.area * 5);
  });

  it('returns null for a degenerate footprint', () => {
    expect(minAreaRectXZ([{x: 0, z: 0}])).toBeNull();
  });
});

describe('pcaYawXZ / pcaYawConfidence', () => {
  it('is confident about a thin slab', () => {
    const pts = [];
    for (let i = 0; i < 200; ++i) {
      pts.push(at((i / 199 - 0.5) * 1.5, ((i % 3) - 1) * 0.005, deg(20)));
    }
    const s = pcaYawXZ(pts, 0, 0)!;
    expect(Math.abs(yawDelta90(s.angle, deg(20)))).toBeLessThan(deg(2));
    expect(s.anisotropy).toBeGreaterThan(0.9);
    expect(pcaYawConfidence(s)).toBeGreaterThan(0.35);
  });

  it('is not confident about a round blob', () => {
    const pts = [];
    for (let i = 0; i < 300; ++i) {
      const t = (i / 300) * Math.PI * 2;
      pts.push({x: Math.cos(t) * 0.5, z: Math.sin(t) * 0.5});
    }
    const s = pcaYawXZ(pts, 0, 0)!;
    expect(s.anisotropy).toBeLessThan(0.1);
    expect(pcaYawConfidence(s)).toBeLessThan(0.35);
  });

  it('rejects small samples outright', () => {
    const pts = [];
    for (let i = 0; i < 10; ++i) pts.push(at(i * 0.1, 0, 0));
    const s = pcaYawXZ(pts, 0.45, 0)!;
    expect(pcaYawConfidence(s)).toBe(0);
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

  it('is reproducible with a seeded rng', () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 50; ++i) {
      pts.push(new THREE.Vector3((i % 10) * 0.1, Math.floor(i / 10) * 0.3, 1));
    }
    const a = ransacVerticalPlane(pts, {rng: seededRng(5)})!;
    const b = ransacVerticalPlane(pts, {rng: seededRng(5)})!;
    expect(a.normal.x).toBeCloseTo(b.normal.x, 12);
    expect(a.inlierCount).toBe(b.inlierCount);
  });

  it('returns null without enough points', () => {
    expect(ransacVerticalPlane([new THREE.Vector3()])).toBeNull();
  });
});

describe('combineYawCandidates', () => {
  it('treats candidates 90 degrees apart as agreeing', () => {
    const r = combineYawCandidates([
      {angle: deg(0), weight: 1, method: 'a'},
      {angle: deg(90), weight: 1, method: 'b'},
    ])!;
    expect(r.agreementR).toBeCloseTo(1, 6);
    expect(Math.abs(yawDelta90(r.angle, 0))).toBeLessThan(1e-6);
  });

  it('cancels for candidates 45 degrees apart', () => {
    const r = combineYawCandidates([
      {angle: deg(0), weight: 1, method: 'a'},
      {angle: deg(45), weight: 1, method: 'b'},
    ])!;
    expect(r.agreementR).toBeLessThan(0.05);
  });

  it('ignores zero-weight candidates and reports the top method', () => {
    const r = combineYawCandidates([
      {angle: deg(80), weight: 0, method: 'ignored'},
      {angle: deg(10), weight: 0.9, method: 'winner'},
      {angle: deg(12), weight: 0.2, method: 'other'},
    ])!;
    expect(r.method).toBe('winner');
    expect(Math.abs(yawDelta90(r.angle, deg(10)))).toBeLessThan(deg(2));
  });

  it('returns null when nothing carries weight', () => {
    expect(
      combineYawCandidates([{angle: 0, weight: 0, method: 'a'}])
    ).toBeNull();
  });
});
