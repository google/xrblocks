import * as THREE from 'three';
import { uvToNdc } from './DepthSampling.js';

/**
 * Oriented bounding-box fitters and outlier rejection helpers.
 *
 * All functions are pure (no `xb.core` dependencies) and are safe to
 * unit-test without a running XR session.
 */
// Module-level scratch objects reused across calls to reduce GC pressure.
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _n = new THREE.Vector3();
const _bboxRay = new THREE.Raycaster();
const _bboxNdc = new THREE.Vector2();
const _diff = new THREE.Vector3();
const _tfRay = new THREE.Raycaster();
const _tfNdc = new THREE.Vector2();
/** Return the `q`-th percentile of a numeric array. */
function pctile(arr, q) {
    const sorted = arr.slice().sort((a, b) => a - b);
    return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(q * sorted.length)))];
}
// ---------------------------------------------------------------------------
// Outlier rejection helpers
// ---------------------------------------------------------------------------
/**
 * Drop points more than `radius` metres from `anchor` in 3D. Falls back to
 * the original set when fewer than six points survive the filter.
 *
 * @param points - Input world-space point cloud.
 * @param anchor - World-space anchor (bbox-centre raycast hit).
 * @param radius - Rejection radius in metres.
 * @returns Filtered (or original) point set.
 */
function rejectByAnchor(points, anchor, radius) {
    if (!anchor || points.length < 4)
        return points;
    const kept = points.filter((p) => p.distanceTo(anchor) < radius);
    return kept.length >= 6 ? kept : points;
}
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
function radiusFromBbox(box2d, camera, anchor, { pad = 1.3, minR = 0.2, maxR = 2.0, fallback = 0.8, } = {}) {
    if (!box2d || !camera || !anchor)
        return fallback;
    const dist = camera.position.distanceTo(anchor);
    if (!isFinite(dist) || dist <= 0)
        return fallback;
    const bw = Math.max(0, box2d.max.x - box2d.min.x);
    const bh = Math.max(0, box2d.max.y - box2d.min.y);
    if (bw <= 0 || bh <= 0)
        return fallback;
    const fovRad = (camera.fov * Math.PI) / 180;
    const frameH = 2 * dist * Math.tan(fovRad / 2);
    const frameW = frameH * camera.aspect;
    const ud = camera.userData;
    const snapAspect = ud.snapAspect ?? camera.aspect;
    let sx = 1;
    let sy = 1;
    if (snapAspect < camera.aspect) {
        sx = snapAspect / camera.aspect;
    }
    else if (snapAspect > camera.aspect) {
        sy = camera.aspect / snapAspect;
    }
    const worldW = bw * frameW * sx;
    const worldH = bh * frameH * sy;
    const halfDiag = 0.5 * Math.hypot(worldW, worldH);
    return Math.min(maxR, Math.max(minR, pad * halfDiag));
}
/**
 * Drop points whose camera-distance differs by more than `tol` metres from
 * the median. Falls back to the original set when fewer than six survive.
 *
 * @param points - Input point cloud.
 * @param camera - Camera whose position provides the reference.
 * @param tol - Depth tolerance in metres.
 * @returns Filtered (or original) point set.
 */
function rejectByDepth(points, camera, tol) {
    if (!camera || points.length < 4)
        return points;
    const ds = points.map((p) => p.distanceTo(camera.position));
    const sorted = ds.slice().sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const kept = points.filter((_, i) => Math.abs(ds[i] - med) < tol);
    return kept.length >= 6 ? kept : points;
}
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
function rejectByAnchorDepth(points, camera, anchor, tol) {
    if (!camera || !anchor || points.length < 4)
        return points;
    const anchorDist = camera.position.distanceTo(anchor);
    return points.filter((p) => Math.abs(p.distanceTo(camera.position) - anchorDist) < tol);
}
/**
 * Keep only points within `±dy` metres of the median Y. Useful for hanging
 * fixtures where cord / ceiling stragglers extend vertically while the
 * lampshade itself is compact in Y.
 *
 * @param points - Input point cloud.
 * @param dy - Half-range around the median Y in metres.
 * @returns Filtered (or original) point set.
 */
function rejectByY(points, dy) {
    if (points.length < 4)
        return points;
    const ys = points.map((p) => p.y).sort((a, b) => a - b);
    const med = ys[Math.floor(ys.length / 2)];
    const kept = points.filter((p) => Math.abs(p.y - med) < dy);
    return kept.length >= 6 ? kept : points;
}
// ---------------------------------------------------------------------------
// Plane fitting
// ---------------------------------------------------------------------------
/**
 * RANSAC plane fitter. Picks three random points, builds a plane, counts
 * inliers within `eps`, repeats `iters` times, then returns the best plane
 * with inliers refined to its centroid. Robust to ≈50% outliers.
 *
 * @param points - Input point cloud (needs at least 3).
 * @param iters - Number of RANSAC iterations.
 * @param eps - Inlier distance threshold in metres.
 * @returns Best plane `{ normal, point, inliers }`, or `null` if fewer than
 *   six inliers were found.
 */
function ransacPlane(points, iters = 80, eps = 0.02) {
    if (points.length < 3)
        return null;
    let best = {
        inliers: [],
        normal: null,
        point: null,
    };
    for (let it = 0; it < iters; it++) {
        const ia = (Math.random() * points.length) | 0;
        const ib = (Math.random() * points.length) | 0;
        const ic = (Math.random() * points.length) | 0;
        if (ia === ib || ib === ic || ia === ic)
            continue;
        const a = points[ia], b = points[ib], c = points[ic];
        _ab.subVectors(b, a);
        _ac.subVectors(c, a);
        _n.crossVectors(_ab, _ac);
        if (_n.lengthSq() < 1e-8)
            continue;
        _n.normalize();
        const d = -_n.dot(a);
        let count = 0;
        for (const p of points) {
            if (Math.abs(_n.dot(p) + d) < eps)
                count++;
        }
        if (count > best.inliers.length) {
            const inliers = points.filter((p) => Math.abs(_n.dot(p) + d) < eps);
            best = { inliers, normal: _n.clone(), point: a };
        }
    }
    if (!best.normal || !best.point || best.inliers.length < 6)
        return null;
    const centroid = new THREE.Vector3();
    for (const p of best.inliers)
        centroid.add(p);
    centroid.multiplyScalar(1 / best.inliers.length);
    return { normal: best.normal, point: centroid, inliers: best.inliers };
}
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
function rayToPlane(u, v, camera, planePoint, planeNormal) {
    const ud = camera.userData;
    uvToNdc(u, v, ud.snapAspect, camera.aspect, _bboxNdc);
    _bboxRay.setFromCamera(_bboxNdc, camera);
    const denom = _bboxRay.ray.direction.dot(planeNormal);
    if (Math.abs(denom) < 1e-6)
        return null;
    _diff.subVectors(planePoint, _bboxRay.ray.origin);
    const t = _diff.dot(planeNormal) / denom;
    if (t <= 0)
        return null;
    return _bboxRay.ray.origin.clone().addScaledVector(_bboxRay.ray.direction, t);
}
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
function projectBboxToPlane(box2d, camera, planePoint, planeNormal) {
    const TL = rayToPlane(box2d.min.x, box2d.min.y, camera, planePoint, planeNormal);
    const TR = rayToPlane(box2d.max.x, box2d.min.y, camera, planePoint, planeNormal);
    const BR = rayToPlane(box2d.max.x, box2d.max.y, camera, planePoint, planeNormal);
    const BL = rayToPlane(box2d.min.x, box2d.max.y, camera, planePoint, planeNormal);
    if (!TL || !TR || !BR || !BL)
        return null;
    return { TL, TR, BR, BL };
}
// ---------------------------------------------------------------------------
// OBB fitters
// ---------------------------------------------------------------------------
/**
 * Dispatcher: picks the appropriate per-category fitter and returns an
 * `InternalObb` (or `null` if fitting fails with the given point set).
 *
 * @param points - World-space depth samples inside the mask.
 * @param opts - Camera, anchor, 2D bbox, category, and tinyFlat flag.
 * @returns Fitted {@link InternalObb}, or `null` on failure.
 */
function fitYawOBB(points, opts = {}) {
    const cat = opts.category ?? 'furniture';
    if (cat === 'flat') {
        if (opts.tinyFlat) {
            const r = fitTinyFlatOBB(opts);
            if (r)
                return r;
        }
        const r = fitFlatOBB(points, opts);
        if (r)
            return r;
    }
    if (cat === 'small') {
        const r = fitSmallOBB(points, opts);
        if (r)
            return r;
    }
    if (cat === 'light') {
        const r = fitLightOBB(points, opts);
        if (r)
            return r;
    }
    return fitFurnitureOBB(points);
}
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
function fitTinyFlatOBB(opts) {
    if (!opts.box2d || !opts.camera)
        return null;
    const cam = opts.camera;
    const cx = (opts.box2d.min.x + opts.box2d.max.x) * 0.5;
    const cy = (opts.box2d.min.y + opts.box2d.max.y) * 0.5;
    const ud = cam.userData;
    uvToNdc(cx, cy, ud.snapAspect, cam.aspect, _tfNdc);
    _tfRay.setFromCamera(_tfNdc, cam);
    const o = _tfRay.ray.origin, d = _tfRay.ray.direction;
    let anchorOk = false;
    if (opts.anchor) {
        const a = opts.anchor;
        if (Math.abs(a.x) <= 4 && Math.abs(a.z) <= 4 && a.y >= -0.5 && a.y <= 4) {
            anchorOk = true;
        }
    }
    const roomHalf = 3.0;
    const candidates = [
        { n: new THREE.Vector3(1, 0, 0), d: -roomHalf },
        { n: new THREE.Vector3(-1, 0, 0), d: -roomHalf },
        { n: new THREE.Vector3(0, 0, 1), d: -roomHalf },
        { n: new THREE.Vector3(0, 0, -1), d: -roomHalf },
    ];
    let best = null;
    for (const c of candidates) {
        const denom = d.dot(c.n);
        if (Math.abs(denom) < 1e-4)
            continue;
        const num = -(o.dot(c.n) + c.d);
        const t = num / denom;
        if (t <= 0.05)
            continue;
        const hit = o.clone().addScaledVector(d, t);
        if (Math.abs(hit.x) > roomHalf + 0.5 || Math.abs(hit.z) > roomHalf + 0.5)
            continue;
        if (!best || t < best.t)
            best = { t, hit, n: c.n.clone() };
    }
    if (!best)
        return null;
    let center;
    let normal = best.n;
    if (anchorOk && opts.anchor) {
        const a = opts.anchor;
        const camToAnchor = a.distanceTo(cam.position);
        if (camToAnchor < best.t * 0.8) {
            const dx = roomHalf - Math.abs(a.x);
            const dz = roomHalf - Math.abs(a.z);
            if (dx < dz) {
                center = new THREE.Vector3(Math.sign(a.x) * roomHalf, a.y, a.z);
                normal = new THREE.Vector3(-Math.sign(a.x), 0, 0);
            }
            else {
                center = new THREE.Vector3(a.x, a.y, Math.sign(a.z) * roomHalf);
                normal = new THREE.Vector3(0, 0, -Math.sign(a.z));
            }
        }
        else {
            center = best.hit;
        }
    }
    else {
        center = best.hit;
    }
    const toCam = cam.position.clone().sub(center);
    if (normal.dot(toCam) < 0)
        normal.multiplyScalar(-1);
    const corners = projectBboxToPlane(opts.box2d, cam, center, normal);
    if (!corners)
        return null;
    const angle = Math.atan2(normal.x, normal.z);
    const cs = Math.cos(angle), sn = Math.sin(angle);
    let umin = Infinity, umax = -Infinity;
    let ymin = Infinity, ymax = -Infinity;
    let cxw = 0, czw = 0;
    for (const c of [corners.TL, corners.TR, corners.BR, corners.BL]) {
        const u = (c.x - center.x) * cs - (c.z - center.z) * sn;
        if (u < umin)
            umin = u;
        if (u > umax)
            umax = u;
        if (c.y < ymin)
            ymin = c.y;
        if (c.y > ymax)
            ymax = c.y;
        cxw += c.x;
        czw += c.z;
    }
    cxw /= 4;
    czw /= 4;
    const sizeU = Math.max(0.04, Math.min(0.4, umax - umin));
    const sizeY = Math.max(0.04, Math.min(0.4, ymax - ymin));
    return {
        center: new THREE.Vector3(cxw, (ymin + ymax) / 2, czw),
        size: new THREE.Vector3(sizeU, sizeY, 0.04),
        angle,
    };
}
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
function fitFlatOBB(points, opts) {
    if (points.length < 6)
        return null;
    let workingPoints = points;
    if (opts.anchor) {
        const filtered = rejectByAnchor(points, opts.anchor, 0.6);
        if (filtered.length >= 6)
            workingPoints = filtered;
    }
    const plane = ransacPlane(workingPoints, 200, 0.02);
    if (!plane)
        return null;
    const n = new THREE.Vector3(plane.normal.x, 0, plane.normal.z);
    if (n.lengthSq() < 1e-6)
        return null;
    n.normalize();
    if (Math.abs(n.x) > Math.abs(n.z)) {
        n.set(Math.sign(n.x), 0, 0);
    }
    else {
        n.set(0, 0, Math.sign(n.z));
    }
    if (opts.camera) {
        _diff.subVectors(opts.camera.position, plane.point);
        if (n.dot(_diff) < 0)
            n.multiplyScalar(-1);
    }
    const angle = Math.atan2(n.x, n.z);
    const inliers = plane.inliers.length ? plane.inliers : workingPoints;
    const offsets = inliers.map((p) => p.x * n.x + p.z * n.z);
    offsets.sort((a, b) => a - b);
    const offset = offsets[Math.floor(offsets.length / 2)];
    const planePoint = new THREE.Vector3(n.x * offset, 0, n.z * offset);
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const us = [];
    const ys = [];
    for (const p of inliers) {
        us.push((p.x - planePoint.x) * cs - (p.z - planePoint.z) * sn);
        ys.push(p.y);
    }
    const umin = pctile(us, 0.05);
    const umax = pctile(us, 0.95);
    const ymin = pctile(ys, 0.05);
    const ymax = pctile(ys, 0.95);
    const uc = (umin + umax) / 2;
    const sizeU = Math.max(0.05, umax - umin);
    const sizeY = Math.max(0.05, ymax - ymin);
    const center = new THREE.Vector3(planePoint.x + uc * cs, (ymin + ymax) / 2, planePoint.z - uc * sn);
    return { center, size: new THREE.Vector3(sizeU, sizeY, 0.05), angle };
}
/**
 * Small objects (cups, books, controllers): depth-mesh resolution is coarser
 * than the object. Project the 2D bbox through the median depth to size the
 * box reliably.
 *
 * @param points - World-space depth samples (at least 3 required).
 * @param opts - Camera and 2D bbox required.
 * @returns Fitted {@link InternalObb}, or `null` on failure.
 */
function fitSmallOBB(points, opts) {
    if (!opts.box2d || !opts.camera || points.length < 3)
        return null;
    const camPos = opts.camera.position;
    const ds = points.map((p) => p.distanceTo(camPos));
    const sorted = ds.slice().sort((a, b) => a - b);
    const depth = sorted[Math.floor(sorted.length / 2)];
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(opts.camera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6)
        return null;
    fwd.normalize();
    const planePoint = camPos.clone().addScaledVector(fwd, depth);
    const planeNormal = fwd.clone().multiplyScalar(-1);
    const corners = projectBboxToPlane(opts.box2d, opts.camera, planePoint, planeNormal);
    if (!corners)
        return null;
    const angle = Math.atan2(planeNormal.x, planeNormal.z);
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const all = [corners.TL, corners.TR, corners.BR, corners.BL];
    let umin = Infinity, umax = -Infinity;
    let ymin = Infinity, ymax = -Infinity;
    let cx = 0, cz = 0;
    for (const c of all) {
        const u = (c.x - planePoint.x) * cs - (c.z - planePoint.z) * sn;
        if (u < umin)
            umin = u;
        if (u > umax)
            umax = u;
        if (c.y < ymin)
            ymin = c.y;
        if (c.y > ymax)
            ymax = c.y;
        cx += c.x;
        cz += c.z;
    }
    cx /= 4;
    cz /= 4;
    const sizeU = Math.max(0.02, umax - umin);
    const sizeY = Math.max(0.02, ymax - ymin);
    const dmin = sorted[0], dmax = sorted[sorted.length - 1];
    const sizeV = Math.max(0.05, Math.min(0.4, dmax - dmin));
    return {
        center: new THREE.Vector3(cx, (ymin + ymax) / 2, cz),
        size: new THREE.Vector3(sizeU, sizeY, sizeV),
        angle,
    };
}
/**
 * Hanging lights / lamps: the mask often picks up the cord and ceiling.
 * Cluster on the densest depth bin (the lampshade) via a tight depth filter,
 * then apply furniture-style fitting.
 *
 * @param points - World-space depth samples.
 * @param opts - Camera used by the depth filter.
 * @returns Fitted {@link InternalObb}, or `null` on failure.
 */
function fitLightOBB(points, opts) {
    if (points.length < 6)
        return null;
    const tight = rejectByDepth(points, opts.camera ?? null, 0.1);
    return fitFurnitureOBB(tight);
}
/**
 * General furniture: yaw-constrained PCA in XZ + percentile-clipped extents.
 * Snaps to the nearest cardinal direction (0 / ±90 / 180°) to compensate for
 * PCA instability on partial depth scans.
 *
 * @param points - World-space depth samples (at least 6 required).
 * @returns Fitted {@link InternalObb}, or `null` when fewer than 6 points.
 */
function fitFurnitureOBB(points) {
    if (points.length < 6)
        return null;
    const xs = points.map((p) => p.x).sort((a, b) => a - b);
    const ys = points.map((p) => p.y).sort((a, b) => a - b);
    const zs = points.map((p) => p.z).sort((a, b) => a - b);
    const med = (arr) => arr[Math.floor(arr.length / 2)];
    const cx = med(xs); med(ys); const cz = med(zs);
    let Sxx = 0, Sxz = 0, Szz = 0;
    for (const p of points) {
        const dx = p.x - cx, dz = p.z - cz;
        Sxx += dx * dx;
        Sxz += dx * dz;
        Szz += dz * dz;
    }
    let angle = 0.5 * Math.atan2(2 * Sxz, Sxx - Szz);
    const snapCandidates = [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI];
    let bestSnap = angle, bestErr = Infinity;
    for (const c of snapCandidates) {
        const err = Math.abs(((angle - c + Math.PI) % (2 * Math.PI)) - Math.PI);
        if (err < bestErr) {
            bestErr = err;
            bestSnap = c;
        }
    }
    angle = bestSnap;
    const cs = Math.cos(angle), sn = Math.sin(angle);
    const us = [], vs = [], ysProj = [];
    for (const p of points) {
        const dx = p.x - cx, dz = p.z - cz;
        us.push(dx * cs + dz * sn);
        vs.push(-dx * sn + dz * cs);
        ysProj.push(p.y);
    }
    const umin = pctile(us, 0.05), umax = pctile(us, 0.95);
    const vmin = pctile(vs, 0.05), vmax = pctile(vs, 0.95);
    const ymin = pctile(ysProj, 0.02), ymax = pctile(ysProj, 0.98);
    const uc = (umin + umax) / 2, vc = (vmin + vmax) / 2;
    const offX = uc * cs - vc * sn;
    const offZ = uc * sn + vc * cs;
    return {
        center: new THREE.Vector3(cx + offX, (ymin + ymax) / 2, cz + offZ),
        size: new THREE.Vector3(Math.max(0.02, umax - umin), Math.max(0.02, ymax - ymin), Math.max(0.02, vmax - vmin)),
        angle,
    };
}

export { fitFlatOBB, fitFurnitureOBB, fitLightOBB, fitSmallOBB, fitTinyFlatOBB, fitYawOBB, projectBboxToPlane, radiusFromBbox, ransacPlane, rayToPlane, rejectByAnchor, rejectByAnchorDepth, rejectByDepth, rejectByY };
