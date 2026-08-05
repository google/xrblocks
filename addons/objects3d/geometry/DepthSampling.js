import * as THREE from 'three';

/**
 * Depth-mesh sampling and UV→NDC projection helpers.
 *
 * All functions are pure (no `xb.core` dependencies) and are safe to
 * unit-test without a running XR session.
 */
// Module-level scratch objects reused across calls to avoid per-call GC.
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
/**
 * Convert a snapshot UV coordinate (`[0, 1]` left-right, top-bottom origin)
 * to camera NDC, correcting for any aspect-ratio mismatch between the
 * snapshot and the camera frustum.
 *
 * When the snapshot is narrower than the camera (e.g. a 512×512 simulator
 * frame vs a 16:9 camera), the snapshot covers the full vertical FOV but only
 * a fraction of the horizontal FOV. `uvToNdc` applies the corresponding scale
 * factor so every bbox-derived ray lands on the correct world point.
 *
 * @param u - Horizontal coordinate in `[0, 1]` (left-right).
 * @param v - Vertical coordinate in `[0, 1]` (top-down).
 * @param snapAspect - Aspect ratio of the snapshot (`width / height`), or
 *   `null` / `undefined` to assume it matches `camAspect`.
 * @param camAspect - Aspect ratio of the camera frustum.
 * @param out - Output `Vector2` that receives the NDC result.
 * @returns The same `out` vector, mutated in place.
 */
function uvToNdc(u, v, snapAspect, camAspect, out) {
    const sa = snapAspect ?? camAspect;
    let sx = 1;
    let sy = 1;
    if (sa < camAspect) {
        sx = sa / camAspect;
    }
    else if (sa > camAspect) {
        sy = camAspect / sa;
    }
    out.set((u * 2 - 1) * sx, ((1 - v) * 2 - 1) * sy);
    return out;
}
/**
 * Raycast foreground mask pixels against a depth mesh and collect world-space
 * hit points. Only pixels inside `box2d` are tested, iterated with `stride`
 * to keep the raycast count reasonable. Foreground pixels have value `< 128`.
 *
 * @param mask - The segmentation mask.
 * @param box2d - Normalised 2-D bounding box (`[0, 1]` range).
 * @param stride - Pixel stepping stride; higher values are faster but sparser.
 * @param maxDistance - Maximum ray-hit distance in metres; hits beyond this
 *   are discarded.
 * @param camera - Camera used to un-project mask pixels. Pass `null` to get an
 *   empty result.
 * @param mesh - Depth mesh to raycast against. Pass `null` for empty result.
 * @param snapAspect - Snapshot aspect ratio override; reads from
 *   `camera.userData.snapAspect` if omitted.
 * @returns `{ points, foregroundPixels }` — world-space hit points and the
 *   count of foreground pixels visited.
 */
function sampleDepthInMask(mask, box2d, stride = 6, maxDistance = 12, camera = null, mesh = null, snapAspect = null) {
    const points = [];
    if (!camera || !mesh)
        return { points, foregroundPixels: 0 };
    const ud = camera.userData;
    const sa = snapAspect ?? ud.snapAspect ?? camera.aspect;
    const mw = mask.width;
    const mh = mask.height;
    const arr = mask.getAsUint8Array();
    const xMin = Math.max(0, Math.floor(box2d.min.x * mw));
    const xMax = Math.min(mw, Math.ceil(box2d.max.x * mw));
    const yMin = Math.max(0, Math.floor(box2d.min.y * mh));
    const yMax = Math.min(mh, Math.ceil(box2d.max.y * mh));
    let fg = 0;
    for (let py = yMin; py < yMax; py += stride) {
        for (let px = xMin; px < xMax; px += stride) {
            if (arr[py * mw + px] >= 128)
                continue;
            fg++;
            const u = (px + 0.5) / mw;
            const v = (py + 0.5) / mh;
            uvToNdc(u, v, sa, camera.aspect, _ndc);
            _raycaster.setFromCamera(_ndc, camera);
            const hits = _raycaster.intersectObject(mesh, false);
            if (hits.length > 0 && hits[0].distance <= maxDistance) {
                points.push(hits[0].point.clone());
            }
        }
    }
    return { points, foregroundPixels: fg };
}
/**
 * Cast a single ray through the 2D bbox centre using the frozen camera and
 * depth mesh, and return the world-space anchor point. Falls back to `null`
 * when the ray misses the mesh (e.g. the centre falls on a gap).
 *
 * @param box2d - Normalised 2-D bounding box, or `null`.
 * @param camera - Frozen camera from snapshot time, or `null`.
 * @param mesh - Frozen depth-mesh snapshot, or `null`.
 * @param snapAspect - Snapshot aspect ratio override.
 * @returns World-space anchor, or `null` on miss.
 */
function anchorFromBboxCenter(box2d, camera, mesh, snapAspect = null) {
    if (!box2d || !camera || !mesh)
        return null;
    const ud = camera.userData;
    const sa = snapAspect ?? ud.snapAspect ?? camera.aspect;
    const cx = (box2d.min.x + box2d.max.x) * 0.5;
    const cy = (box2d.min.y + box2d.max.y) * 0.5;
    uvToNdc(cx, cy, sa, camera.aspect, _ndc);
    _raycaster.setFromCamera(_ndc, camera);
    const hits = _raycaster.intersectObject(mesh, false);
    return hits.length > 0 ? hits[0].point.clone() : null;
}
/**
 * Returns a promise that resolves after one animation frame.
 *
 * @returns A promise resolved by `requestAnimationFrame`.
 */
function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
}
/**
 * Multi-frame depth sampling. When frozen camera / mesh overrides are
 * provided, takes a single sample (the frozen state is already stable).
 * Otherwise accumulates across `frames` live animation frames to average out
 * per-frame depth noise in the simulator.
 *
 * @param mask - Segmentation mask.
 * @param box2d - Normalised 2-D bounding box.
 * @param stride - Pixel stride for raycasting.
 * @param frames - Number of live frames to accumulate (ignored when overrides
 *   are given).
 * @param cameraOverride - Frozen camera, or `null` for live.
 * @param meshOverride - Frozen depth mesh, or `null` for live.
 * @param snapAspect - Snapshot aspect ratio override.
 * @returns Accumulated world-space hit points and foreground pixel count.
 */
async function sampleDepthInMaskAcrossFrames(mask, box2d, stride = 6, frames = 3, cameraOverride = null, meshOverride = null, snapAspect = null) {
    if (cameraOverride || meshOverride) {
        return sampleDepthInMask(mask, box2d, stride, 12, cameraOverride, meshOverride, snapAspect);
    }
    const all = [];
    let totalFg = 0;
    for (let i = 0; i < frames; i++) {
        if (i > 0)
            await nextFrame();
        const { points, foregroundPixels } = sampleDepthInMask(mask, box2d, stride);
        for (const p of points)
            all.push(p);
        totalFg = Math.max(totalFg, foregroundPixels);
    }
    return { points: all, foregroundPixels: totalFg };
}

export { anchorFromBboxCenter, nextFrame, sampleDepthInMask, sampleDepthInMaskAcrossFrames, uvToNdc };
