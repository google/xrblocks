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
import type { InternalObb } from './ObbFitting';
/** Wrap an angle into `(-π, π]`. */
export declare function wrapPi(a: number): number;
/**
 * Wrap an angle into `[-π/4, π/4)` — the canonical representative of its
 * mod-90° equivalence class.
 */
export declare function wrapQuarterPi(a: number): number;
/**
 * Signed difference between two yaws in the mod-90° quotient, in
 * `[-π/4, π/4)`. Yaws 90° apart return ~0 because they describe the same box.
 */
export declare function yawDelta90(a: number, b: number): number;
/**
 * Project a world-space XZ offset into a box's local (u, v) frame.
 * The inverse of {@link localToWorldXZ}.
 *
 * @param dx - World X offset from the box centre.
 * @param dz - World Z offset from the box centre.
 * @param a - Box yaw in radians.
 */
export declare function worldToLocalXZ(dx: number, dz: number, a: number): {
    u: number;
    v: number;
};
/**
 * Map a box-local (u, v) offset back into world XZ.
 * The inverse of {@link worldToLocalXZ}.
 *
 * @param u - Offset along the box's local u (width) axis.
 * @param v - Offset along the box's local v (depth) axis.
 * @param a - Box yaw in radians.
 */
export declare function localToWorldXZ(u: number, v: number, a: number): {
    x: number;
    z: number;
};
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
export declare function canonicalizeYawObb(obb: InternalObb): InternalObb;
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
export declare function convexHullXZ(points: readonly PointXZ[]): PointXZ[];
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
export declare function minAreaRectXZ(points: readonly PointXZ[]): MinAreaRect | null;
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
export declare function pcaYawXZ(points: readonly PointXZ[], cx: number, cz: number): ScatterXZ | null;
/**
 * Map a {@link ScatterXZ} to a 0..1 confidence. Returns 0 when the point count
 * or anisotropy is too low for the angle to mean anything at all.
 */
export declare function pcaYawConfidence(s: ScatterXZ): number;
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
export declare function ransacVerticalPlane(points: readonly THREE.Vector3[], { iters, eps, rng, }?: {
    iters?: number;
    eps?: number;
    rng?: () => number;
}): VerticalPlaneFit | null;
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
export declare function combineYawCandidates(candidates: readonly YawCandidate[]): YawEstimate | null;
