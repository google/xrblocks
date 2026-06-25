/**
 * OBB fusion, IoU dedupe, and floor-snapping helpers.
 *
 * All functions are pure (no `xb.core` dependencies) and are safe to
 * unit-test without a running XR session.
 */

import * as THREE from 'three';

import type {InternalObb} from './ObbFitting';

/**
 * Minimal interface implemented by {@link Detected3DObject} that lets
 * {@link fuseIntoBoxes} perform fusion without importing the concrete class
 * (avoids circular dependencies).
 */
export interface FusionRecord {
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
export function box2dIoU(
  a: THREE.Box2 | null | undefined,
  b: THREE.Box2 | null | undefined
): number {
  if (!a || !b) return 0;
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
export function unionDetections<T extends {detection2DBoundingBox: THREE.Box2}>(
  a: T[],
  b: T[],
  iouThresh = 0.5
): T[] {
  const out = a.slice();
  for (const it of b) {
    let dup = false;
    for (const k of out) {
      if (
        box2dIoU(it.detection2DBoundingBox, k.detection2DBoundingBox) >
        iouThresh
      ) {
        dup = true;
        break;
      }
    }
    if (!dup) out.push(it);
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
export function snapBoxToFloor(
  obb: InternalObb,
  floorY: number | null,
  slack = 0.05
): InternalObb {
  if (floorY == null) return obb;
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
 * extent radius. On a match the record's fusion fields are updated in place
 * (running-average centroid, unioned extents, incremented sample count).
 *
 * @param records - Existing fusion records (implemented by
 *   {@link Detected3DObject}).
 * @param newObb - Candidate OBB to merge.
 * @param cat - Category of the candidate.
 * @returns The matched record (already mutated) when fusion happened, or
 *   `null` when no match was found.
 */
export function fuseIntoBoxes(
  records: FusionRecord[],
  newObb: InternalObb,
  cat: string
): FusionRecord | null {
  const half = (s: THREE.Vector3) => (s.x + s.y + s.z) / 6;
  for (const rec of records) {
    if (rec.category !== cat) continue;
    const dx = rec._fusionCenter.x - newObb.center.x;
    const dy = rec._fusionCenter.y - newObb.center.y;
    const dz = rec._fusionCenter.z - newObb.center.z;
    const dist = Math.hypot(dx, dy, dz);
    const radius = half(rec._fusionSize) + half(newObb.size);
    if (dist > radius) continue;

    const n = rec._fusionSamples + 1;
    const blendedCenter = new THREE.Vector3(
      (rec._fusionCenter.x * (n - 1) + newObb.center.x) / n,
      (rec._fusionCenter.y * (n - 1) + newObb.center.y) / n,
      (rec._fusionCenter.z * (n - 1) + newObb.center.z) / n
    );

    // Union extents in a local frame centred at blendedCenter and aligned to
    // the existing OBB's yaw. Both OBBs' 8 corners are projected in; seeding
    // with ±existingSize/2 would mis-place the old corners since the existing
    // box is centred at rec._fusionCenter, not blendedCenter.
    const cs = Math.cos(rec._fusionAngle);
    const sn = Math.sin(rec._fusionAngle);
    let umin = Infinity,
      umax = -Infinity;
    let vmin = Infinity,
      vmax = -Infinity;
    let ymin = Infinity,
      ymax = -Infinity;

    function expandFromOBB(
      centerX: number,
      centerY: number,
      centerZ: number,
      sx: number,
      sy: number,
      sz: number,
      ang: number
    ) {
      const ca = Math.cos(ang),
        sa = Math.sin(ang);
      for (const ix of [-1, 1]) {
        for (const iy of [-1, 1]) {
          for (const iz of [-1, 1]) {
            const lx = (ix * sx) / 2;
            const lz = (iz * sz) / 2;
            const wx = centerX + lx * ca + lz * sa;
            const wz = centerZ - lx * sa + lz * ca;
            const wy = centerY + (iy * sy) / 2;
            const du =
              (wx - blendedCenter.x) * cs - (wz - blendedCenter.z) * sn;
            const dv =
              (wx - blendedCenter.x) * sn + (wz - blendedCenter.z) * cs;
            if (du < umin) umin = du;
            if (du > umax) umax = du;
            if (dv < vmin) vmin = dv;
            if (dv > vmax) vmax = dv;
            if (wy < ymin) ymin = wy;
            if (wy > ymax) ymax = wy;
          }
        }
      }
    }

    expandFromOBB(
      rec._fusionCenter.x,
      rec._fusionCenter.y,
      rec._fusionCenter.z,
      rec._fusionSize.x,
      rec._fusionSize.y,
      rec._fusionSize.z,
      rec._fusionAngle
    );
    expandFromOBB(
      newObb.center.x,
      newObb.center.y,
      newObb.center.z,
      newObb.size.x,
      newObb.size.y,
      newObb.size.z,
      newObb.angle
    );

    const sizeU = Math.max(0.02, umax - umin);
    const sizeV = Math.max(0.02, vmax - vmin);
    const sizeY = Math.max(0.02, ymax - ymin);
    const uc = (umin + umax) / 2;
    const vc = (vmin + vmax) / 2;
    const fusedCenter = new THREE.Vector3(
      blendedCenter.x + uc * cs + vc * sn,
      (ymin + ymax) / 2,
      blendedCenter.z - uc * sn + vc * cs
    );

    rec._fusionCenter.copy(fusedCenter);
    rec._fusionSize.set(sizeU, sizeY, sizeV);
    rec._fusionSamples = n;
    return rec;
  }
  return null;
}
