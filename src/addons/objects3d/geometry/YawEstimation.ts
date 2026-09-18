/**
 * Yaw-angle utilities for oriented bounding boxes.
 *
 * All functions are pure (no `xb.core` dependencies) and are safe to
 * unit-test without a running XR session.
 *
 * ## Conventions
 *
 * An {@link InternalObb}'s `angle` is a yaw about world +Y, and the renderer
 * applies it as `group.rotation.y = angle` (see `visuals/BoxGroup.ts`'s
 * `buildBoxGroup`). A three.js Y-rotation by `a` maps local
 * +X to world `(cos a, 0, -sin a)`, so the box's local u-axis is
 * `(cos a, -sin a)` and its v-axis is `(sin a, cos a)` in the world XZ plane.
 * {@link worldToLocalXZ} and {@link localToWorldXZ} are the single definition
 * of that convention; every fitter should go through them rather than inlining
 * the trigonometry, which is how the two halves of the codebase drifted apart
 * in the first place.
 *
 * ## The mod-90° quotient
 *
 * A box's yaw is only defined modulo 90°: rotating by 90° and swapping
 * `size.x` with `size.z` describes an identical box. Comparisons, averaging and
 * snapping therefore operate on `4θ` mapped onto the unit circle, where two
 * angles 90° apart coincide (they are the same box) and two 45° apart are
 * antipodal (maximally disagreeing). {@link yawDelta90} and
 * {@link canonicalizeYawObb} implement that quotient.
 */

import * as THREE from 'three';

import type {InternalObb} from './ObbFitting';

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const QUARTER_PI = Math.PI / 4;

/** Wrap an angle into `(-π, π]`. */
export function wrapPi(a: number): number {
  const m = (((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI;
  return m - Math.PI;
}

/**
 * Wrap an angle into `[-π/4, π/4)` — the canonical representative of its
 * mod-90° equivalence class.
 */
export function wrapQuarterPi(a: number): number {
  const m = (((a + QUARTER_PI) % HALF_PI) + HALF_PI) % HALF_PI;
  return m - QUARTER_PI;
}

/**
 * Signed difference between two yaws in the mod-90° quotient, in
 * `[-π/4, π/4)`. Yaws 90° apart return ~0 because they describe the same box.
 */
export function yawDelta90(a: number, b: number): number {
  return wrapQuarterPi(a - b);
}

/**
 * Project a world-space XZ offset into a box's local (u, v) frame.
 * The inverse of {@link localToWorldXZ}.
 *
 * @param dx - World X offset from the box centre.
 * @param dz - World Z offset from the box centre.
 * @param a - Box yaw in radians.
 */
export function worldToLocalXZ(
  dx: number,
  dz: number,
  a: number
): {u: number; v: number} {
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return {u: dx * cs - dz * sn, v: dx * sn + dz * cs};
}

/**
 * Map a box-local (u, v) offset back into world XZ.
 * The inverse of {@link worldToLocalXZ}.
 *
 * @param u - Offset along the box's local u (width) axis.
 * @param v - Offset along the box's local v (depth) axis.
 * @param a - Box yaw in radians.
 */
export function localToWorldXZ(
  u: number,
  v: number,
  a: number
): {x: number; z: number} {
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return {x: u * cs + v * sn, z: -u * sn + v * cs};
}

/**
 * Rewrite an OBB so its yaw is the canonical representative of its mod-90°
 * class, in `[-π/4, π/4)`. When the rewrite rotates by ±90° the u and v
 * extents are swapped, so the box describes exactly the same volume.
 *
 * Do not apply this to boxes whose `angle` encodes a surface *normal*
 * direction rather than a box orientation (the `flat` category), because those
 * need their full ±180° range to stay facing the camera.
 *
 * @param obb - Box to canonicalize. Not mutated.
 * @returns An equivalent box with a canonical yaw.
 */
export function canonicalizeYawObb(obb: InternalObb): InternalObb {
  const angle = wrapQuarterPi(obb.angle);
  // A rotation by an odd multiple of 90° exchanges the u and v axes.
  const quarterTurns = Math.round((obb.angle - angle) / HALF_PI);
  const swapped = Math.abs(quarterTurns % 2) === 1;
  if (!swapped && angle === obb.angle) return obb;
  return {
    ...obb,
    angle,
    size: swapped
      ? new THREE.Vector3(obb.size.z, obb.size.y, obb.size.x)
      : obb.size.clone(),
  };
}

// ---------------------------------------------------------------------------
// Convex hull + minimum-area rectangle
// ---------------------------------------------------------------------------

/** A 2-D point in the world XZ plane. */
export interface PointXZ {
  x: number;
  z: number;
}

/**
 * Convex hull of a set of XZ points, via Andrew's monotone chain.
 * Returns the hull in counter-clockwise order without repeating the first
 * point. Inputs of fewer than three points are returned as-is.
 */
export function convexHullXZ(points: readonly PointXZ[]): PointXZ[] {
  if (points.length < 3) return points.map((p) => ({x: p.x, z: p.z}));
  const sorted = points
    .map((p) => ({x: p.x, z: p.z}))
    .sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x));
  // Cross product of OA x OB; >0 means a counter-clockwise turn.
  const cross = (o: PointXZ, a: PointXZ, b: PointXZ) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

  const build = (src: PointXZ[]): PointXZ[] => {
    const out: PointXZ[] = [];
    for (const p of src) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2], out[out.length - 1], p) <= 0
      ) {
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };

  const lower = build(sorted);
  const upper = build(sorted.slice().reverse());
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : sorted;
}

/** Result of {@link minAreaRectXZ}. */
export interface MinAreaRect {
  /** Canonical yaw in `[-π/4, π/4)`, in the render convention. */
  angle: number;
  /** Extent along the box's local u axis. */
  width: number;
  /** Extent along the box's local v axis. */
  depth: number;
  /** Area of the minimising rectangle, in m². */
  area: number;
  /** Number of hull vertices the fit was computed from. */
  hullCount: number;
  /**
   * How strongly the hull actually supports these axes: the fraction of hull
   * perimeter lying within 10° (mod 90°) of a rectangle edge. Near 1 for a
   * genuinely box-like footprint, low for a rounded or blobby one.
   */
  supportRatio: number;
}

/**
 * Minimum-area enclosing rectangle of the XZ footprint, by rotating calipers
 * over the convex hull edges.
 *
 * Preferred over PCA for yaw because of the common partial-scan geometry: when
 * two faces of a piece of furniture are visible the samples form an L, and
 * PCA's principal axis bisects the two legs — up to 45° wrong — whereas the
 * minimising rectangle locks onto the faces. For a single visible face the
 * samples form a slab and the rectangle hugs it, recovering the face
 * direction.
 *
 * Use the returned `angle` only; `width`/`depth` are driven by extreme points
 * and are less robust than percentile-clipped extents.
 *
 * @param points - World-space samples (at least three distinct XZ positions).
 * @returns The minimising rectangle, or `null` when the footprint is
 *   degenerate (collinear or a single point).
 */
export function minAreaRectXZ(points: readonly PointXZ[]): MinAreaRect | null {
  const hull = convexHullXZ(points);
  if (hull.length < 3) return null;

  let best: MinAreaRect | null = null;
  for (let i = 0; i < hull.length; ++i) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez);
    if (len < 1e-9) continue;
    // Yaw whose local u axis (cos, -sin) lies along this hull edge.
    const angle = Math.atan2(-ez / len, ex / len);
    let uMin = Infinity,
      uMax = -Infinity,
      vMin = Infinity,
      vMax = -Infinity;
    for (const p of hull) {
      const {u, v} = worldToLocalXZ(p.x, p.z, angle);
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    const width = uMax - uMin;
    const depth = vMax - vMin;
    const area = width * depth;
    if (!best || area < best.area) {
      best = {
        angle,
        width,
        depth,
        area,
        hullCount: hull.length,
        supportRatio: 0,
      };
    }
  }
  if (!best) return null;

  // How much of the hull perimeter runs parallel to the chosen axes.
  let aligned = 0;
  let perimeter = 0;
  for (let i = 0; i < hull.length; ++i) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-9) continue;
    perimeter += len;
    const edgeAngle = Math.atan2(-(b.z - a.z) / len, (b.x - a.x) / len);
    if (Math.abs(yawDelta90(edgeAngle, best.angle)) < (10 * Math.PI) / 180) {
      aligned += len;
    }
  }
  const supportRatio = perimeter > 0 ? aligned / perimeter : 0;

  const canonical = wrapQuarterPi(best.angle);
  const swapped =
    Math.abs(Math.round((best.angle - canonical) / HALF_PI) % 2) === 1;
  return {
    ...best,
    angle: canonical,
    width: swapped ? best.depth : best.width,
    depth: swapped ? best.width : best.depth,
    supportRatio,
  };
}

// ---------------------------------------------------------------------------
// PCA + confidence
// ---------------------------------------------------------------------------

/** Second-moment summary of an XZ point set. */
export interface ScatterXZ {
  /** Yaw of the major axis, in the render convention. */
  angle: number;
  /** Larger eigenvalue of the normalised scatter matrix. */
  lambda1: number;
  /** Smaller eigenvalue. */
  lambda2: number;
  /** `(λ1 − λ2) / (λ1 + λ2)`, in `[0, 1]`. Zero for an isotropic blob. */
  anisotropy: number;
  /** Asymptotic standard error of {@link angle}, in radians. */
  sigmaThetaRad: number;
  /** Number of points. */
  count: number;
}

/**
 * Principal-axis yaw of an XZ point set, with an uncertainty estimate.
 *
 * The reported `sigmaThetaRad` is the asymptotic standard error of the
 * principal-axis angle, `sqrt(λ1·λ2 / (N·(λ1−λ2)²))`. This is the right
 * quantity to gate on because it correctly reports high confidence for a thin
 * slab (λ2 → 0) and low confidence for a round blob (λ1 ≈ λ2), matching the
 * physical intuition about which footprints determine an orientation.
 *
 * @param points - World-space samples.
 * @param cx - Centre X to measure offsets from.
 * @param cz - Centre Z to measure offsets from.
 * @returns Scatter summary, or `null` for fewer than three points.
 */
export function pcaYawXZ(
  points: readonly PointXZ[],
  cx: number,
  cz: number
): ScatterXZ | null {
  const n = points.length;
  if (n < 3) return null;
  let Sxx = 0,
    Sxz = 0,
    Szz = 0;
  for (const p of points) {
    const dx = p.x - cx;
    const dz = p.z - cz;
    Sxx += dx * dx;
    Sxz += dx * dz;
    Szz += dz * dz;
  }
  Sxx /= n;
  Sxz /= n;
  Szz /= n;
  const mean = (Sxx + Szz) / 2;
  const disc = Math.hypot((Sxx - Szz) / 2, Sxz);
  const lambda1 = mean + disc;
  const lambda2 = Math.max(0, mean - disc);
  if (lambda1 <= 1e-12) return null;
  // PCA gives the major axis as (cos φ, sin φ); a box's u axis is
  // (cos a, -sin a), so a = -φ.
  const angle = wrapQuarterPi(-0.5 * Math.atan2(2 * Sxz, Sxx - Szz));
  const gap = lambda1 - lambda2;
  const sigmaThetaRad =
    gap > 1e-12 ? Math.sqrt((lambda1 * lambda2) / (n * gap * gap)) : Infinity;
  return {
    angle,
    lambda1,
    lambda2,
    anisotropy: gap / (lambda1 + lambda2),
    sigmaThetaRad,
    count: n,
  };
}

/** Reference angular error at which PCA confidence falls to 1/e. */
const SIGMA_REF_RAD = (6 * Math.PI) / 180;

/**
 * Map a {@link ScatterXZ} to a 0..1 confidence. Returns 0 when the point count
 * or anisotropy is too low for the angle to mean anything at all.
 */
export function pcaYawConfidence(s: ScatterXZ): number {
  if (s.count < 20 || s.anisotropy < 0.15) return 0;
  if (!Number.isFinite(s.sigmaThetaRad)) return 0;
  return Math.exp(-s.sigmaThetaRad / SIGMA_REF_RAD);
}

// ---------------------------------------------------------------------------
// Vertical-plane RANSAC
// ---------------------------------------------------------------------------

/** Result of {@link ransacVerticalPlane}. */
export interface VerticalPlaneFit {
  /** Horizontal unit normal of the fitted plane. */
  normal: THREE.Vector3;
  /** A point on the plane (centroid of the inliers). */
  point: THREE.Vector3;
  /** Fraction of input points within `eps` of the plane. */
  inlierRatio: number;
  /** Number of inliers. */
  inlierCount: number;
}

/**
 * RANSAC fit of a *vertical* plane, sampling two points and taking
 * `normalize(cross(p2 − p1, +Y))` as the normal.
 *
 * Constructing the normal this way guarantees verticality, needs far fewer
 * iterations than filtering general 3-point planes, and has no collinearity
 * degeneracy. Filtering the output of a general plane fit would be much worse
 * here: on a sofa the largest plane is often the horizontal seat, so most
 * iterations would be discarded.
 *
 * @param points - World-space samples.
 * @param options - Iteration count, inlier threshold, and random source.
 * @returns The best vertical plane, or `null` if none had enough support.
 */
export function ransacVerticalPlane(
  points: readonly THREE.Vector3[],
  {
    iters = 60,
    eps = 0.02,
    rng = Math.random,
  }: {iters?: number; eps?: number; rng?: () => number} = {}
): VerticalPlaneFit | null {
  if (points.length < 6) return null;
  let bestNormal: THREE.Vector3 | null = null;
  let bestCount = 0;
  let bestOffset = 0;
  for (let it = 0; it < iters; ++it) {
    const a = points[(rng() * points.length) | 0];
    const b = points[(rng() * points.length) | 0];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    // cross(edge, +Y) for a horizontal edge, normalised.
    const nx = -dz / len;
    const nz = dx / len;
    const offset = nx * a.x + nz * a.z;
    let count = 0;
    for (const p of points) {
      if (Math.abs(nx * p.x + nz * p.z - offset) < eps) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestNormal = new THREE.Vector3(nx, 0, nz);
      bestOffset = offset;
    }
  }
  if (!bestNormal || bestCount < 6) return null;
  const centroid = new THREE.Vector3();
  let n = 0;
  for (const p of points) {
    if (Math.abs(bestNormal.x * p.x + bestNormal.z * p.z - bestOffset) < eps) {
      centroid.add(p);
      n++;
    }
  }
  if (n > 0) centroid.multiplyScalar(1 / n);
  return {
    normal: bestNormal,
    point: centroid,
    inlierRatio: bestCount / points.length,
    inlierCount: bestCount,
  };
}

// ---------------------------------------------------------------------------
// Candidate combination
// ---------------------------------------------------------------------------

/** One estimator's opinion about an object's yaw. */
export interface YawCandidate {
  angle: number;
  /** Relative trust in this candidate; candidates with weight ≤ 0 are ignored. */
  weight: number;
  method: string;
}

/** Combined yaw estimate produced by {@link combineYawCandidates}. */
export interface YawEstimate {
  /** Canonical yaw in `[-π/4, π/4)`. */
  angle: number;
  /** 0..1 overall confidence, folding in how well the candidates agreed. */
  confidence: number;
  /** Method name of the highest-weighted contributing candidate. */
  method: string;
  /** Mean resultant length of the candidates in the 4θ domain, 0..1. */
  agreementR: number;
}

/**
 * Combine yaw candidates by averaging them in the `4θ` domain, so that
 * candidates 90° apart reinforce (they describe the same box) while candidates
 * 45° apart cancel to `agreementR ≈ 0` — the correct signal that the estimators
 * fundamentally disagree.
 *
 * @param candidates - Per-estimator opinions.
 * @returns Combined estimate, or `null` when no candidate carried any weight.
 */
export function combineYawCandidates(
  candidates: readonly YawCandidate[]
): YawEstimate | null {
  let C = 0,
    S = 0,
    W = 0;
  let topWeight = -Infinity;
  let topMethod = 'none';
  for (const c of candidates) {
    if (!(c.weight > 0) || !Number.isFinite(c.angle)) continue;
    C += c.weight * Math.cos(4 * c.angle);
    S += c.weight * Math.sin(4 * c.angle);
    W += c.weight;
    if (c.weight > topWeight) {
      topWeight = c.weight;
      topMethod = c.method;
    }
  }
  if (W <= 0) return null;
  const agreementR = Math.min(1, Math.hypot(C, S) / W);
  return {
    angle: wrapQuarterPi(0.25 * Math.atan2(S, C)),
    // W is a sum of weight x per-estimator confidence, so W / count is the
    // weighted mean confidence; scaling by agreement penalises disagreement.
    confidence: agreementR * Math.min(1, W / Math.max(1, candidates.length)),
    method: topMethod,
    agreementR,
  };
}
