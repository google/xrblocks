import * as THREE from 'three';

// Public representation of a single detected and fitted 3-D object.
/**
 * A single detected object in the XR scene with an oriented 3-D bounding box.
 * Extends `THREE.Object3D` so it can be added directly to the scene graph.
 * `this.position` is always kept in sync with `obb.center`.
 */
class Detected3DObject extends THREE.Object3D {
    /**
     * @param label - Semantic label of the detected object.
     * @param category - Category bucket (`'flat' | 'light' | 'small' | 'furniture'`).
     * @param obb - Initial internal OBB from the fitter.
     */
    constructor(label, category, obb) {
        super();
        this.label = label;
        this.category = category;
        this._fusionAngle = obb.angle;
        this._fusionCenter = obb.center.clone();
        this._fusionSize = obb.size.clone();
        this._fusionSamples = 1;
        // Build public OBB from internal representation.
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), obb.angle);
        this.obb = {
            center: obb.center.clone(),
            halfExtents: new THREE.Vector3(obb.size.x / 2, obb.size.y / 2, obb.size.z / 2),
            quaternion: q,
        };
        this.position.copy(obb.center);
    }
    /**
     * Update the public `obb` fields from the current fusion state. Called after
     * {@link fuseIntoBoxes} mutates `_fusionCenter` / `_fusionSize`.
     *
     * @param internal - The internal OBB to synchronise from.
     */
    syncFromInternalObb(internal) {
        this.obb.center.copy(internal.center);
        this.obb.halfExtents.set(internal.size.x / 2, internal.size.y / 2, internal.size.z / 2);
        this.obb.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), internal.angle);
        this.position.copy(internal.center);
    }
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
    nearestSurfacePointTo(point, out) {
        const result = out ?? new THREE.Vector3();
        const invQ = this.obb.quaternion.clone().invert();
        // Transform point to OBB local space.
        const localPt = point.clone().sub(this.obb.center).applyQuaternion(invQ);
        const he = this.obb.halfExtents;
        const inside = Math.abs(localPt.x) <= he.x &&
            Math.abs(localPt.y) <= he.y &&
            Math.abs(localPt.z) <= he.z;
        if (!inside) {
            // Standard closest-point-on-box: clamp each axis.
            result.set(Math.max(-he.x, Math.min(he.x, localPt.x)), Math.max(-he.y, Math.min(he.y, localPt.y)), Math.max(-he.z, Math.min(he.z, localPt.z)));
        }
        else {
            // Inside: project onto the nearest face.
            const dx = he.x - Math.abs(localPt.x);
            const dy = he.y - Math.abs(localPt.y);
            const dz = he.z - Math.abs(localPt.z);
            result.copy(localPt);
            if (dx <= dy && dx <= dz) {
                result.x = (localPt.x >= 0 ? 1 : -1) * he.x;
            }
            else if (dy <= dz) {
                result.y = (localPt.y >= 0 ? 1 : -1) * he.y;
            }
            else {
                result.z = (localPt.z >= 0 ? 1 : -1) * he.z;
            }
        }
        // Transform back to world space.
        result.applyQuaternion(this.obb.quaternion).add(this.obb.center);
        return result;
    }
}

export { Detected3DObject };
