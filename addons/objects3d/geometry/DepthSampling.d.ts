/**
 * Depth-mesh sampling and UV→NDC projection helpers.
 *
 * All functions are pure (no `xb.core` dependencies) and are safe to
 * unit-test without a running XR session.
 */
import * as THREE from 'three';
/** Mask returned by both the SAM and MediaPipe segmenter backends. */
export interface MaskLike {
    /** Mask width in pixels. */
    readonly width: number;
    /** Mask height in pixels. */
    readonly height: number;
    /**
     * Raw pixel data where values `< 128` are foreground (selected object) and
     * values `>= 128` are background.
     */
    getAsUint8Array(): Uint8Array;
    /** Release GPU / WASM resources associated with the mask. */
    close(): void;
}
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
export declare function uvToNdc(u: number, v: number, snapAspect: number | null | undefined, camAspect: number, out: THREE.Vector2): THREE.Vector2;
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
export declare function sampleDepthInMask(mask: MaskLike, box2d: THREE.Box2, stride?: number, maxDistance?: number, camera?: THREE.PerspectiveCamera | null, mesh?: THREE.Mesh | null, snapAspect?: number | null): {
    points: THREE.Vector3[];
    foregroundPixels: number;
};
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
export declare function anchorFromBboxCenter(box2d: THREE.Box2 | null, camera: THREE.PerspectiveCamera | null, mesh: THREE.Mesh | null, snapAspect?: number | null): THREE.Vector3 | null;
/**
 * Returns a promise that resolves after one animation frame.
 *
 * @returns A promise resolved by `requestAnimationFrame`.
 */
export declare function nextFrame(): Promise<void>;
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
export declare function sampleDepthInMaskAcrossFrames(mask: MaskLike, box2d: THREE.Box2, stride?: number, frames?: number, cameraOverride?: THREE.PerspectiveCamera | null, meshOverride?: THREE.Mesh | null, snapAspect?: number | null): Promise<{
    points: THREE.Vector3[];
    foregroundPixels: number;
}>;
