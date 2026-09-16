/**
 * Oriented bounding-box fitters and outlier rejection helpers.
 *
 * All functions are pure (no `xb.core` dependencies) and are safe to
 * unit-test without a running XR session.
 */
import * as THREE from 'three';
import type { YawEstimate } from './YawEstimation';
/**
 * Internal OBB representation used by fitters and fusion.
 * `angle` is yaw rotation around world Y.
 * `size` is full extents (two times the half-extents on each axis).
 */
export interface InternalObb {
    /** World-space centroid of the box. */
    center: THREE.Vector3;
    /** Full extents (width, height, depth) of the box in metres. */
    size: THREE.Vector3;
    /** Yaw angle around world Y, in radians. */
    angle: number;
    /**
     * How well determined {@link angle} was, in `[0, 1]`. Populated by the
     * fitters; consumed by diagnostics and (in future) by cross-view fusion to
     * weight one observation's yaw against another's.
     */
    yawConfidence?: number;
    /** Name of the estimator that produced {@link angle}. Diagnostics only. */
    yawMethod?: string;
}
/**
 * How a fitted yaw should be reconciled with the surrounding room.
 *
 * - `'cardinal'` — legacy: snap unconditionally to the nearest multiple of 90°
 *   about the **session origin**. Kept as an escape hatch and A/B baseline.
 * - `'roomFrame'` — snap to the estimated room axes, but only when the object's
 *   own yaw is poorly determined or already close to them.
 * - `'free'` — always use the measured yaw.
 */
export type OrientationMode = 'cardinal' | 'roomFrame' | 'free';
/** Orientation policy plus the room frame to resolve against. */
export interface OrientationOptions {
    /** @defaultValue `'roomFrame'` */
    mode?: OrientationMode;
    /** Estimated room yaw in radians, or `null` when unknown. */
    roomYaw?: number | null;
    /** Confidence of {@link roomYaw}, in `[0, 1]`. */
    roomYawConfidence?: number;
    /**
     * Objects within this angle of the room frame are snapped to it, which
     * removes jitter on genuinely wall-aligned furniture.
     * @defaultValue 12°
     */
    snapToleranceRad?: number;
    /**
     * Below this yaw confidence the object's own estimate is discarded in favour
     * of the room frame.
     * @defaultValue 0.35
     */
    minYawConfidence?: number;
}
/** Options forwarded from the detector to the per-category fitters. */
export interface ObbFitOptions {
    /** Detector category from {@link categorize}. */
    category?: string;
    /** Frozen camera from snapshot time. */
    camera?: THREE.PerspectiveCamera | null;
    /** World-space anchor from the bbox-centre raycast. */
    anchor?: THREE.Vector3 | null;
    /** Normalised 2-D bounding box from the detector. */
    box2d?: THREE.Box2 | null;
    /** Whether the label is a tiny flat item (switch, outlet, etc.). */
    tinyFlat?: boolean;
    /**
     * Assumed distance in metres from the session origin to the cardinal walls
     * (`x = ±roomHalf`, `z = ±roomHalf`), used by {@link fitTinyFlatOBB}.
     * Defaults to 3, matching the simulator's wood-cabin scene.
     */
    roomHalf?: number;
    /** Orientation policy and room frame. */
    orientation?: OrientationOptions;
}
/**
 * Reconcile a measured yaw with the orientation policy and the room frame.
 * This is the single decision point for every fitter, so the modes behave
 * consistently across categories.
 *
 * @param est - Measured yaw, or `null` when estimation failed outright.
 * @param opts - Orientation policy and room frame.
 * @returns The yaw to use, its confidence, and which path produced it.
 */
export declare function resolveYaw(est: YawEstimate | null, opts?: OrientationOptions): {
    angle: number;
    confidence: number;
    method: string;
};
/**
 * Estimate an object's yaw from its footprint by combining a minimum-area
 * rectangle fit, a vertical-plane fit, and PCA.
 *
 * @param points - World-space samples.
 * @param cx - Centre X used for the PCA scatter.
 * @param cz - Centre Z used for the PCA scatter.
 * @param rng - Random source for the RANSAC vote.
 */
export declare function estimateObjectYaw(points: THREE.Vector3[], cx: number, cz: number, rng?: () => number): YawEstimate | null;
/**
 * Drop points more than `radius` metres from `anchor` in 3D. Falls back to
 * the original set when fewer than six points survive the filter.
 *
 * @param points - Input world-space point cloud.
 * @param anchor - World-space anchor (bbox-centre raycast hit).
 * @param radius - Rejection radius in metres.
 * @returns Filtered (or original) point set.
 */
export declare function rejectByAnchor(points: THREE.Vector3[], anchor: THREE.Vector3 | null | undefined, radius: number): THREE.Vector3[];
/**
 * Estimate a sensible 3D rejection radius from the 2D detection extent.
 * Back-projects the bbox diagonal onto the plane through `anchor`
 * perpendicular to the view direction to get the physical size, then scales by
 * `pad` and clamps to `[minR, maxR]`.
 *
 * @param box2d - Normalised 2-D bounding box.
 * @param camera - Frozen camera.
 * @param anchor - World-space anchor.
 * @param opts - Padding, clamp limits, and fallback radius.
 * @returns Estimated rejection radius in metres.
 */
export declare function radiusFromBbox(box2d: THREE.Box2 | null | undefined, camera: THREE.PerspectiveCamera | null | undefined, anchor: THREE.Vector3 | null | undefined, { pad, minR, maxR, fallback, }?: {
    pad?: number;
    minR?: number;
    maxR?: number;
    fallback?: number;
}): number;
/**
 * Drop points whose camera-distance differs by more than `tol` metres from
 * the median. Falls back to the original set when fewer than six survive.
 *
 * @param points - Input point cloud.
 * @param camera - Camera whose position provides the reference.
 * @param tol - Depth tolerance in metres.
 * @returns Filtered (or original) point set.
 */
export declare function rejectByDepth(points: THREE.Vector3[], camera: THREE.PerspectiveCamera | null, tol: number): THREE.Vector3[];
/**
 * Like {@link rejectByDepth} but anchors the depth filter against the
 * bbox-centre raycast hit rather than the median sample depth. Critical when
 * the SAM mask leaks onto the floor or wall and the median depth becomes that
 * surface rather than the object.
 *
 * @param points - Input point cloud.
 * @param camera - Camera whose position provides the reference distance.
 * @param anchor - World-space anchor used as the depth reference.
 * @param tol - Depth tolerance in metres.
 * @returns Filtered point set.
 */
export declare function rejectByAnchorDepth(points: THREE.Vector3[], camera: THREE.PerspectiveCamera | null | undefined, anchor: THREE.Vector3 | null | undefined, tol: number): THREE.Vector3[];
/**
 * Keep only points within `±dy` metres of the median Y. Useful for hanging
 * fixtures where cord / ceiling stragglers extend vertically while the
 * lampshade itself is compact in Y.
 *
 * @param points - Input point cloud.
 * @param dy - Half-range around the median Y in metres.
 * @returns Filtered (or original) point set.
 */
export declare function rejectByY(points: THREE.Vector3[], dy: number): THREE.Vector3[];
/**
 * RANSAC plane fitter. Picks three random points, builds a plane, counts
 * inliers within `eps`, repeats `iters` times, then returns the best plane
 * with inliers refined to its centroid. Robust to ≈50% outliers.
 *
 * @param points - Input point cloud (needs at least 3).
 * @param iters - Number of RANSAC iterations.
 * @param eps - Inlier distance threshold in metres.
 * @param rng - Random source; inject a seeded generator to make the result
 *   reproducible (tests would otherwise be flaky).
 * @returns Best plane `{ normal, point, inliers }`, or `null` if fewer than
 *   six inliers were found.
 */
export declare function ransacPlane(points: THREE.Vector3[], iters?: number, eps?: number, rng?: () => number): {
    normal: THREE.Vector3;
    point: THREE.Vector3;
    inliers: THREE.Vector3[];
} | null;
/**
 * Shoot a ray through normalised image coordinates `(u, v) ∈ [0, 1]`
 * (top-left origin) and intersect with `planePoint` / `planeNormal`.
 *
 * @param u - Horizontal normalised coordinate.
 * @param v - Vertical normalised coordinate (top-down).
 * @param camera - Camera used to un-project the pixel.
 * @param planePoint - A point on the target plane.
 * @param planeNormal - Normal of the target plane.
 * @returns World-space hit point, or `null` if the ray is parallel to the
 *   plane or hits behind the camera.
 */
export declare function rayToPlane(u: number, v: number, camera: THREE.PerspectiveCamera, planePoint: THREE.Vector3, planeNormal: THREE.Vector3): THREE.Vector3 | null;
/**
 * Project the four corners of `box2d` onto a plane and return them as
 * `{ TL, TR, BR, BL }`. Returns `null` if any corner ray misses the plane.
 *
 * @param box2d - Normalised 2-D bounding box.
 * @param camera - Camera used to un-project corners.
 * @param planePoint - A point on the target plane.
 * @param planeNormal - Normal of the target plane.
 * @returns Corner world positions, or `null` on any miss.
 */
export declare function projectBboxToPlane(box2d: THREE.Box2, camera: THREE.PerspectiveCamera, planePoint: THREE.Vector3, planeNormal: THREE.Vector3): {
    TL: THREE.Vector3;
    TR: THREE.Vector3;
    BR: THREE.Vector3;
    BL: THREE.Vector3;
} | null;
/**
 * Dispatcher: picks the appropriate per-category fitter and returns an
 * `InternalObb` (or `null` if fitting fails with the given point set).
 *
 * @param points - World-space depth samples inside the mask.
 * @param opts - Camera, anchor, 2D bbox, category, and tinyFlat flag.
 * @returns Fitted {@link InternalObb}, or `null` on failure.
 */
export declare function fitYawOBB(points: THREE.Vector3[], opts?: ObbFitOptions): InternalObb | null;
/**
 * Tiny wall-mounted flats (switches, outlets, thermostats). Their depth
 * back-projection is unreliable — tiny pixel footprint at frame edges, depth
 * artefacts. Instead: cast a ray through the bbox centre, snap to the nearest
 * cardinal wall plane (±X / ±Z), and project the bbox corners onto that wall
 * to size the box.
 *
 * @param opts - Requires `box2d` and `camera`; uses `anchor` when plausible.
 * @returns Fitted {@link InternalObb}, or `null` on failure.
 */
export declare function fitTinyFlatOBB(opts: ObbFitOptions): InternalObb | null;
/**
 * Flat objects (paintings, TVs, windows, mirrors): fit a plane via RANSAC,
 * then reproject the 2D bbox onto that plane to get tight extents immune to
 * mask spillover.
 *
 * @param points - World-space depth samples inside the mask.
 * @param opts - Camera and anchor used for normal orientation.
 * @returns Fitted {@link InternalObb}, or `null` when fewer than 6 points
 *   or RANSAC fails.
 */
export declare function fitFlatOBB(points: THREE.Vector3[], opts: ObbFitOptions): InternalObb | null;
/**
 * Small objects (cups, books, controllers): depth-mesh resolution is coarser
 * than the object. Project the 2D bbox through the median depth to size the
 * box reliably.
 *
 * @param points - World-space depth samples (at least 3 required).
 * @param opts - Camera and 2D bbox required.
 * @returns Fitted {@link InternalObb}, or `null` on failure.
 */
export declare function fitSmallOBB(points: THREE.Vector3[], opts: ObbFitOptions): InternalObb | null;
/**
 * Hanging lights / lamps: the mask often picks up the cord and ceiling.
 * Cluster on the densest depth bin (the lampshade) via a tight depth filter,
 * then apply furniture-style fitting.
 *
 * @param points - World-space depth samples.
 * @param opts - Camera used by the depth filter.
 * @returns Fitted {@link InternalObb}, or `null` on failure.
 */
export declare function fitLightOBB(points: THREE.Vector3[], opts: ObbFitOptions): InternalObb | null;
/**
 * General furniture: yaw-constrained PCA in XZ + percentile-clipped extents.
 * Snaps to the nearest cardinal direction (0 / ±90 / 180°) to compensate for
 * PCA instability on partial depth scans.
 *
 * @param points - World-space depth samples (at least 6 required).
 * @returns Fitted {@link InternalObb}, or `null` when fewer than 6 points.
 */
export declare function fitFurnitureOBB(points: THREE.Vector3[], opts?: ObbFitOptions): InternalObb | null;
/**
 * Build a yaw-aligned box around `(cx, cz)` at a fixed `angle`, with
 * percentile-clipped extents so stray mask pixels do not inflate it.
 *
 * Projection goes through {@link worldToLocalXZ} / {@link localToWorldXZ} so
 * the extents are measured along exactly the axes the renderer will draw
 * along. Measuring along one axis pair and drawing along its mirror is a bug
 * that stays invisible while yaws are snapped to multiples of 90° and appears
 * the moment they are not.
 *
 * @param points - World-space samples.
 * @param cx - Seed centre X (median).
 * @param cz - Seed centre Z (median).
 * @param angle - Box yaw in radians.
 */
export declare function buildYawAlignedObb(points: THREE.Vector3[], cx: number, cz: number, angle: number): InternalObb;
