import * as THREE from 'three';

/**
 * OBB fusion, IoU dedupe, and floor-snapping helpers.
 *
 * All functions are pure (no `xb.core` dependencies) and are safe to
 * unit-test without a running XR session.
 */
/**
 * Compute the 2-D intersection-over-union between two axis-aligned bounding
 * boxes in normalised `[0, 1]` screen coordinates.
 *
 * @param a - First bounding box.
 * @param b - Second bounding box.
 * @returns IoU in `[0, 1]`, or `0` if either argument is `null`.
 */
function box2dIoU(a, b) {
    if (!a || !b)
        return 0;
    const ix1 = Math.max(a.min.x, b.min.x);
    const iy1 = Math.max(a.min.y, b.min.y);
    const ix2 = Math.min(a.max.x, b.max.x);
    const iy2 = Math.min(a.max.y, b.max.y);
    const iw = Math.max(0, ix2 - ix1);
    const ih = Math.max(0, iy2 - iy1);
    const inter = iw * ih;
    const aw = a.max.x - a.min.x;
    const ah = a.max.y - a.min.y;
    const bw = b.max.x - b.min.x;
    const bh = b.max.y - b.min.y;
    const u = aw * ah + bw * bh - inter;
    return u > 0 ? inter / u : 0;
}
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
function unionDetections(a, b, iouThresh = 0.5) {
    const out = a.slice();
    for (const it of b) {
        let dup = false;
        for (const k of out) {
            if (box2dIoU(it.detection2DBoundingBox, k.detection2DBoundingBox) >
                iouThresh) {
                dup = true;
                break;
            }
        }
        if (!dup)
            out.push(it);
    }
    return out;
}
/**
 * If the OBB bottom dips below `floorY` by more than `slack`, pin the bottom
 * edge to the floor and keep the top fixed. Mutates `obb` in place.
 *
 * @param obb - OBB to snap (mutated in place).
 * @param floorY - Estimated floor Y in world space, or `null` to skip.
 * @param slack - Tolerance below the floor before snapping is applied.
 * @returns The (possibly mutated) `obb` for chaining.
 */
function snapBoxToFloor(obb, floorY, slack = 0.05) {
    if (floorY == null)
        return obb;
    const top = obb.center.y + obb.size.y / 2;
    const bot = obb.center.y - obb.size.y / 2;
    if (bot < floorY - slack) {
        const newSizeY = Math.max(0.02, top - floorY);
        const newCenterY = floorY + newSizeY / 2;
        obb.size = new THREE.Vector3(obb.size.x, newSizeY, obb.size.z);
        obb.center = new THREE.Vector3(obb.center.x, newCenterY, obb.center.z);
    }
    return obb;
}
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
function fuseIntoBoxes(records, newObb, category, label) {
    const half = (s) => (s.x + s.y + s.z) / 6;
    const normalizedLabel = label.trim().toLowerCase();
    const containsCenter = (center, size, angle, point) => {
        const dx = point.x - center.x;
        const dz = point.z - center.z;
        const cs = Math.cos(angle);
        const sn = Math.sin(angle);
        const localX = dx * cs - dz * sn;
        const localZ = dx * sn + dz * cs;
        return (Math.abs(localX) <= size.x / 2 &&
            Math.abs(point.y - center.y) <= size.y / 2 &&
            Math.abs(localZ) <= size.z / 2);
    };
    for (const rec of records) {
        if (rec.category !== category)
            continue;
        const sameLabel = rec.label.trim().toLowerCase() === normalizedLabel;
        if (!sameLabel &&
            (!containsCenter(rec._fusionCenter, rec._fusionSize, rec._fusionAngle, newObb.center) ||
                !containsCenter(newObb.center, newObb.size, newObb.angle, rec._fusionCenter))) {
            continue;
        }
        const dx = rec._fusionCenter.x - newObb.center.x;
        const dy = rec._fusionCenter.y - newObb.center.y;
        const dz = rec._fusionCenter.z - newObb.center.z;
        const dist = Math.hypot(dx, dy, dz);
        const radius = half(rec._fusionSize) + half(newObb.size);
        if (dist > radius)
            continue;
        const n = rec._fusionSamples + 1;
        const blendedCenter = new THREE.Vector3((rec._fusionCenter.x * (n - 1) + newObb.center.x) / n, (rec._fusionCenter.y * (n - 1) + newObb.center.y) / n, (rec._fusionCenter.z * (n - 1) + newObb.center.z) / n);
        // Union extents in a local frame centred at blendedCenter and aligned to
        // the existing OBB's yaw. Both OBBs' 8 corners are projected in; seeding
        // with ±existingSize/2 would mis-place the old corners since the existing
        // box is centred at rec._fusionCenter, not blendedCenter.
        const cs = Math.cos(rec._fusionAngle);
        const sn = Math.sin(rec._fusionAngle);
        let umin = Infinity, umax = -Infinity;
        let vmin = Infinity, vmax = -Infinity;
        let ymin = Infinity, ymax = -Infinity;
        function expandFromOBB(centerX, centerY, centerZ, sx, sy, sz, ang) {
            const ca = Math.cos(ang), sa = Math.sin(ang);
            for (const ix of [-1, 1]) {
                for (const iy of [-1, 1]) {
                    for (const iz of [-1, 1]) {
                        const lx = (ix * sx) / 2;
                        const lz = (iz * sz) / 2;
                        const wx = centerX + lx * ca + lz * sa;
                        const wz = centerZ - lx * sa + lz * ca;
                        const wy = centerY + (iy * sy) / 2;
                        const du = (wx - blendedCenter.x) * cs - (wz - blendedCenter.z) * sn;
                        const dv = (wx - blendedCenter.x) * sn + (wz - blendedCenter.z) * cs;
                        if (du < umin)
                            umin = du;
                        if (du > umax)
                            umax = du;
                        if (dv < vmin)
                            vmin = dv;
                        if (dv > vmax)
                            vmax = dv;
                        if (wy < ymin)
                            ymin = wy;
                        if (wy > ymax)
                            ymax = wy;
                    }
                }
            }
        }
        expandFromOBB(rec._fusionCenter.x, rec._fusionCenter.y, rec._fusionCenter.z, rec._fusionSize.x, rec._fusionSize.y, rec._fusionSize.z, rec._fusionAngle);
        expandFromOBB(newObb.center.x, newObb.center.y, newObb.center.z, newObb.size.x, newObb.size.y, newObb.size.z, newObb.angle);
        const sizeU = Math.max(0.02, umax - umin);
        const sizeV = Math.max(0.02, vmax - vmin);
        const sizeY = Math.max(0.02, ymax - ymin);
        const uc = (umin + umax) / 2;
        const vc = (vmin + vmax) / 2;
        const fusedCenter = new THREE.Vector3(blendedCenter.x + uc * cs + vc * sn, (ymin + ymax) / 2, blendedCenter.z - uc * sn + vc * cs);
        rec._fusionCenter.copy(fusedCenter);
        rec._fusionSize.set(sizeU, sizeY, sizeV);
        rec._fusionSamples = n;
        return rec;
    }
    return null;
}

export { box2dIoU, fuseIntoBoxes, snapBoxToFloor, unionDetections };
