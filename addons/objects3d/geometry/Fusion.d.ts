/**
 * OBB fusion, IoU dedupe, and floor-snapping helpers.
 *
 * All functions are pure (no `xb.core` dependencies) and are safe to
 * unit-test without a running XR session.
 */
import * as THREE from 'three';
import type { InternalObb } from './ObbFitting';
/**
 * Minimal interface implemented by {@link Detected3DObject} that lets
 * {@link fuseIntoBoxes} perform fusion without importing the concrete class
 * (avoids circular dependencies).
 */
export interface FusionRecord {
    /** Semantic label returned by the detector. */
    readonly label: string;
    /** Category bucket matched during detection. */
    readonly category: string;
    /** Mutable centroid used for running-average blending. */
    _fusionCenter: THREE.Vector3;
    /** Full extents (2× half-extents) of the fused OBB. */
    _fusionSize: THREE.Vector3;
    /** Yaw angle of the fused OBB in radians. */
    _fusionAngle: number;
    /** Number of observations accumulated so far. */
    _fusionSamples: number;
}
/**
 * Compute the 2-D intersection-over-union between two axis-aligned bounding
 * boxes in normalised `[0, 1]` screen coordinates.
 *
 * @param a - First bounding box.
 * @param b - Second bounding box.
 * @returns IoU in `[0, 1]`, or `0` if either argument is `null`.
 */
export declare function box2dIoU(a: THREE.Box2 | null | undefined, b: THREE.Box2 | null | undefined): number;
/**
 * Union two detection lists with IoU-based deduplication. Keeps every item in
 * `a`, then appends items from `b` whose 2D bbox does not overlap any kept
 * item by more than `iouThresh`. This lets the MediaPipe COCO list anchor the
 * dedupe while Gemini's open-vocab finds are added on top.
 *
 * @param a - Primary detection list (kept in full).
 * @param b - Secondary list; duplicates are dropped.
 * @param iouThresh - IoU threshold above which an item is considered a
 *   duplicate. Default `0.5`.
 * @returns Merged detection list.
 */
export declare function unionDetections<T extends {
    detection2DBoundingBox: THREE.Box2;
}>(a: T[], b: T[], iouThresh?: number): T[];
/**
 * If the OBB bottom dips below `floorY` by more than `slack`, pin the bottom
 * edge to the floor and keep the top fixed. Mutates `obb` in place.
 *
 * @param obb - OBB to snap (mutated in place).
 * @param floorY - Estimated floor Y in world space, or `null` to skip.
 * @param slack - Tolerance below the floor before snapping is applied.
 * @returns The (possibly mutated) `obb` for chaining.
 */
export declare function snapBoxToFloor(obb: InternalObb, floorY: number | null, slack?: number): InternalObb;
/**
 * Attempt to fuse `newObb` into an existing record in `records` that belongs
 * to the same category and whose centroid is within the combined average-half-
 * extent radius. When labels differ, both OBB centers must additionally lie
 * inside the other OBB, allowing relabeled observations of one object to merge
 * without merging merely adjacent objects. On a match the record's fusion
 * fields are updated in place.
 *
 * @param records - Existing fusion records (implemented by
 *   {@link Detected3DObject}).
 * @param newObb - Candidate OBB to merge.
 * @param category - Category of the candidate.
 * @param label - Semantic label of the candidate.
 * @returns The matched record (already mutated) when fusion happened, or
 *   `null` when no match was found.
 */
export declare function fuseIntoBoxes(records: FusionRecord[], newObb: InternalObb, category: string, label: string): FusionRecord | null;
