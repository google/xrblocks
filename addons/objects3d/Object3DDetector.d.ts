/**
 * Reusable 3-D object-detection Script addon.
 *
 * `Object3DDetector` wraps the full pipeline from the `objects_3d` demo into a
 * reusable {@link Script}: snap camera + depth mesh, run 2-D detection, obtain
 * per-object segmentation masks, raycast depth samples into world space, fit an
 * oriented bounding box (OBB), fuse across views, and optionally show debug
 * wireframe boxes.
 */
import { Script } from 'xrblocks';
import { Detected3DObject } from './Detected3DObject';
/** Options for {@link Object3DDetector}. */
export interface Object3DDetectorOptions {
    /**
     * Which 2-D detector backend to use.
     * - `'gemini'` — Gemini open-vocabulary (best variety, requires API key).
     * - `'mediapipe'` — On-device COCO (no key needed, fixed class set).
     * - `'both'` — Union of both with IoU dedup.
     * @defaultValue `'gemini'`
     */
    detectBackend?: 'gemini' | 'mediapipe' | 'both';
    /**
     * Which segmentation mask backend to use for depth sampling.
     * - `'slimsam'` — SlimSAM-77-uniform via `@huggingface/transformers` (tighter masks).
     * - `'mediapipe'` — MediaPipe `InteractiveSegmenter` (faster, no download).
     * @defaultValue `'slimsam'`
     */
    maskBackend?: 'slimsam' | 'mediapipe';
    /**
     * When `true`, accumulate OBBs across multiple `detect()` calls from
     * different angles. Each new call refines matching existing boxes via
     * running-average fusion instead of adding a duplicate.
     * @defaultValue `true`
     */
    fuseAcrossViews?: boolean;
    /**
     * When `true`, add wireframe box + label sprite groups to the scene as
     * children of this Script object.
     * @defaultValue `false`
     */
    showDebugBoxes?: boolean;
}
/**
 * Extracts the 3-D object-detection pipeline from the `objects_3d` demo into a
 * reusable {@link Script}. Attach it to the scene before `xb.init()`, then
 * call `await detector.detect()` to populate `detector.results`.
 *
 * ```ts
 * import {Object3DDetector} from 'xrblocks/addons/objects3d';
 * const detector = new Object3DDetector({showDebugBoxes: true});
 * xb.add(detector);
 * xb.init(options);
 * // …later…
 * const objects = await detector.detect();
 * ```
 */
export declare class Object3DDetector extends Script {
    private readonly _opts;
    private _results;
    private _detectInFlight;
    /**
     * @param options - Configuration options.
     */
    constructor(options?: Object3DDetectorOptions);
    /** Currently fitted {@link Detected3DObject} instances from the last
     * (or accumulated) detect run. */
    get results(): Detected3DObject[];
    /**
     * Remove all existing results and their debug visuals from the scene.
     * Call this to reset the detector before a new area scan.
     */
    clearDetections(): void;
    /**
     * Run the full detection + OBB-fitting pipeline and return the list of
     * fitted {@link Detected3DObject} instances.
     *
     * The call:
     * 1. Captures a camera snapshot and freezes both the camera matrix and the
     *    depth mesh at that instant.
     * 2. Runs 2-D object detection (Gemini / MediaPipe / both).
     * 3. For each detection, obtains a per-object segmentation mask (SAM /
     *    MediaPipe segmenter).
     * 4. Raycasts depth samples through the frozen mask into world space.
     * 5. Fits an oriented bounding box using a per-category strategy.
     * 6. Fuses the result into any matching existing box from a prior call.
     *
     * @returns Resolved list of fitted {@link Detected3DObject} instances,
     *   or the unchanged current results on re-entry / missing subsystems.
     */
    detect(): Promise<Detected3DObject[]>;
    /** Clone the live depth mesh into a static snapshot. */
    private _snapshotDepthMesh;
    /** Estimate the floor Y from the live depth mesh (5th-percentile of vertex Y). */
    private _estimateFloorY;
}
