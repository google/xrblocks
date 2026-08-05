import * as THREE from 'three';
import type { FusionRecord } from './geometry/Fusion';
import type { InternalObb } from './geometry/ObbFitting';
/**
 * A single detected object in the XR scene with an oriented 3-D bounding box.
 * Extends `THREE.Object3D` so it can be added directly to the scene graph.
 * `this.position` is always kept in sync with `obb.center`.
 */
export declare class Detected3DObject extends THREE.Object3D implements FusionRecord {
    /** Semantic label returned by the detector (e.g. `"sofa"`, `"lamp"`). */
    label: string;
    /**
     * Category bucket that drove the OBB fitting strategy.
     * One of `"flat"` | `"light"` | `"small"` | `"furniture"`.
     */
    category: string;
    /**
     * Oriented bounding box in world space. `center` is mirrored to
     * `this.position`. `halfExtents` are the box's half-dimensions along each
     * local axis. `quaternion` encodes the yaw rotation around world Y.
     */
    obb: {
        /** World-space centroid (identical to `this.position`). */
        center: THREE.Vector3;
        /** Half-dimensions along each local axis in metres. */
        halfExtents: THREE.Vector3;
        /** Orientation of the box (yaw around world Y). */
        quaternion: THREE.Quaternion;
    };
    /**
     * Optional debug box group added to the scene when `showDebugBoxes` is
     * enabled on {@link Object3DDetector}. `undefined` when debugging is off.
     */
    boxGroup?: THREE.Object3D;
    /** @internal Running-average centroid in world space. */
    _fusionCenter: THREE.Vector3;
    /** @internal Full extents (2× half-extents) of the fused OBB. */
    _fusionSize: THREE.Vector3;
    /** @internal Yaw angle of the fused OBB in radians. */
    _fusionAngle: number;
    /** @internal Number of observations accumulated so far. */
    _fusionSamples: number;
    /**
     * @param label - Semantic label of the detected object.
     * @param category - Category bucket (`'flat' | 'light' | 'small' | 'furniture'`).
     * @param obb - Initial internal OBB from the fitter.
     */
    constructor(label: string, category: string, obb: InternalObb);
    /**
     * Update the public `obb` fields from the current fusion state. Called after
     * {@link fuseIntoBoxes} mutates `_fusionCenter` / `_fusionSize`.
     *
     * @param internal - The internal OBB to synchronise from.
     */
    syncFromInternalObb(internal: InternalObb): void;
    /**
     * Returns the closest point on the OBB **surface** to an external world
     * point. Useful for pointing / reaching interactions: a hand or controller
     * can call this to find the exact surface contact point nearest to its
     * position.
     *
     * Algorithm:
     * 1. Transform `point` into OBB local space (inverse quaternion).
     * 2. If outside the box, clamp each component to `±halfExtents` — this gives
     *    the nearest surface / edge / corner point.
     * 3. If inside the box, project onto the nearest face (minimum penetration
     *    depth axis).
     * 4. Transform back to world space.
     *
     * @param point - World-space query point.
     * @param out - Optional output vector to write into (avoids allocation).
     * @returns The nearest surface point in world space.
     */
    nearestSurfacePointTo(point: THREE.Vector3, out?: THREE.Vector3): THREE.Vector3;
}
