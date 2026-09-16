/**
 * Reusable 3-D object-detection Script addon.
 *
 * `Object3DDetector` wraps the full pipeline in a reusable {@link Script}:
 * snap camera + depth mesh, run 2-D detection, obtain
 * per-object segmentation masks, raycast depth samples into world space, fit an
 * oriented bounding box (OBB), fuse across views, and optionally show debug
 * wireframe boxes.
 */
import { Script } from 'xrblocks';
import { Detected3DObject } from './Detected3DObject';
import { RoomFrameAccumulator } from './geometry/RoomFrame';
import type { OrientationMode, OrientationOptions } from './geometry/ObbFitting';
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
    /**
     * Maximum ray-hit distance in metres when sampling the depth mesh.
     * @defaultValue `12`
     */
    maxRayDistance?: number;
    /**
     * World-space sanity bounds; fitted boxes whose centre falls outside are
     * rejected. Tuned for a room-scale scene around the session origin.
     * @defaultValue `{maxXZ: 6, minY: -1, maxY: 5}`
     */
    sceneBounds?: {
        maxXZ?: number;
        minY?: number;
        maxY?: number;
    };
    /**
     * Assumed distance in metres from the session origin to the cardinal
     * walls, used by the tiny-flat fitter (switches, outlets) to snap onto a
     * wall plane. The default matches the simulator's wood-cabin scene; tune
     * it (or avoid tiny-flat labels) for real rooms.
     * @defaultValue `3`
     */
    roomHalf?: number;
    /**
     * Extra rotation applied to the device-camera pose at capture time, in
     * radians (YXZ order, i.e. yaw about +Y first). Use this to null out a
     * constant per-unit calibration error between the SDK's estimated
     * passthrough-camera extrinsics and the actual hardware: if detections
     * land rotated clockwise (viewed from above) by θ, pass `{yaw: θ}`.
     * @defaultValue `{yaw: 0, pitch: 0, roll: 0}`
     */
    cameraRotationOffset?: {
        yaw?: number;
        pitch?: number;
        roll?: number;
    };
    /**
     * How fitted yaws are reconciled with the room. Defaults to
     * `{mode: 'roomFrame'}`, which estimates the room's own wall direction from
     * the depth mesh and falls back to it only when an object's own orientation
     * is ill-determined. Pass `{mode: 'cardinal'}` for the legacy behaviour of
     * snapping every box to the session origin's axes.
     */
    orientation?: OrientationOptions;
}
/**
 * Machine-readable record of what one {@link Object3DDetector.detect} call
 * observed about its inputs. Chiefly useful for diagnosing on-device
 * misalignment, where the interesting quantities (how stale the captured
 * video frame was, whether the depth mesh is rotated relative to the render
 * view) are invisible from the fitted boxes alone.
 */
export interface Object3DDetectorDiagnostics {
    /** `performance.now()` when the detect call started. */
    startedAtMs: number;
    /** Age of the captured video frame at snapshot time, or `null` when the
     * browser exposes no `captureTime` for the stream. Large values mean the
     * pixels predate the pose, which rotates every box by the head motion in
     * between. */
    frameLatencyMs: number | null;
    /** Gap between the frame's capture time and the timestamp of the recorded
     * pose used for it. `null` when no historical pose was applied. */
    poseMatchErrorMs: number | null;
    /** Poses currently held in the history ring. */
    poseRingSize: number;
    /** Whether the frozen camera came from the SDK's device-camera model
     * (`true`) or fell back to a clone of the XR render camera (`false`). */
    usedDeviceCameraModel: boolean;
    /** Vertical FOV and aspect of the frozen camera actually raycast through. */
    cameraFovDeg: number;
    cameraAspect: number;
    /** Extra rotation applied on top of the SDK extrinsics, in degrees. */
    cameraRotationOffsetDeg: {
        yaw: number;
        pitch: number;
        roll: number;
    };
    snapshotWidth: number;
    snapshotHeight: number;
    /** Whether the platform's view→depth-buffer UV remap is the identity. */
    depthRemapIsIdentity: boolean | null;
    /** Angle between the depth camera's reported orientation and the left eye's,
     * in degrees. A large value with `matchDepthView: false` means the depth
     * mesh every ray lands on is itself rotated. */
    depthVsEyeRotationDeg: number | null;
    /** Vertices in the frozen depth mesh snapshot. */
    depthMeshVertices: number | null;
    /** 2-D detections returned by the detector backend. */
    detections2d: number;
    /** Detections that survived fitting and the sanity gates. */
    fitted3d: number;
    /** Count of each rejection reason across all detections. */
    rejections: Record<string, number>;
    /** Wall-clock milliseconds per stage. */
    timings: {
        freshFrameWait: number;
        snapshot: number;
        depthMeshSnapshot: number;
        detect2d: number;
        masksAndFit: number;
        total: number;
    };
    /** Populated when the call bailed out early. */
    error: string | null;
    /** Orientation policy in force for this call. */
    orientationMode: OrientationMode;
    /** Estimated room yaw in degrees, or `null` when no frame was available. */
    roomYawDeg: number | null;
    /** Confidence of the room frame, in `[0, 1]`. */
    roomYawConfidence: number | null;
    /** Vertical surface area that voted for the room frame, in m². */
    roomFrameSupportM2: number | null;
    /**
     * Per-object yaw outcome. `roomRelativeYawDeg` is the useful one on device:
     * if wall-aligned furniture reads ≈0 here but the boxes still look wrong,
     * the fault is upstream in the camera model rather than in fitting.
     */
    yawStats: Array<{
        label: string;
        category: string;
        yawDeg: number;
        roomRelativeYawDeg: number;
        confidence: number;
        method: string;
    }>;
}
/**
 * The 3-D object-detection pipeline as a reusable {@link Script}. See the
 * `objects_3d` demo for a worked integration. Attach it to the scene before
 * `xb.init()`, then
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
    private readonly _poseRing;
    private readonly _roomFrame;
    private _diagnostics;
    /**
     * @param options - Configuration options.
     */
    constructor(options?: Object3DDetectorOptions);
    /**
     * Record the device-camera pose every frame so {@link detect} can pair a
     * captured video frame with the pose at the frame's `captureTime` — the
     * passthrough video lags head tracking, so the pose at snapshot time is
     * newer than the snapshot's pixels.
     */
    update(): void;
    /** Currently fitted {@link Detected3DObject} instances from the last
     * (or accumulated) detect run. */
    get results(): Detected3DObject[];
    /**
     * Diagnostics from the most recent {@link detect} call, or `null` before
     * the first one. See {@link Object3DDetectorDiagnostics}.
     */
    get diagnostics(): Object3DDetectorDiagnostics | null;
    /** Poses currently held in the capture-time pose history ring. */
    get poseRingSize(): number;
    /** Extra rotation applied to the device-camera pose, in radians. */
    get cameraRotationOffset(): {
        yaw: number;
        pitch: number;
        roll: number;
    };
    /**
     * Adjust the camera rotation offset between detections, so a calibration
     * error can be nulled out interactively instead of by reloading. Omitted
     * components are left unchanged.
     */
    setCameraRotationOffset(offset: {
        yaw?: number;
        pitch?: number;
        roll?: number;
    }): void;
    /** The orientation policy currently in force. */
    get orientationMode(): OrientationMode;
    /**
     * Switch orientation policy between detections, so the modes can be
     * A/B compared on device without reloading.
     */
    setOrientationMode(mode: OrientationMode): void;
    /** The room frame accumulated so far, or `null` before any usable estimate. */
    get roomFrame(): ReturnType<RoomFrameAccumulator['push']>;
    /**
     * Discard the accumulated room frame. Call this after the user recenters or
     * moves to a different space; {@link clearDetections} does it too.
     */
    resetRoomFrame(): void;
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
    /**
     * Build the frozen camera from the SDK's device-camera model (physical
     * passthrough intrinsics + pose on device; render-camera-derived square
     * crop in the simulator). Returns `null` when no camera parameters are
     * available yet (e.g. before init or outside an XR session).
     */
    private _buildDeviceFrozenCamera;
    private _targetDevice;
    /**
     * Records how the depth system is configured on this device — whether the
     * platform reports a depth-camera pose rotated away from the render view,
     * and whether the view→depth-buffer UV remap is non-trivial. A large
     * rotation with `matchDepthView: false` means the depth mesh itself — the
     * surface every detection ray lands on — is the thing to scrutinise when
     * boxes come back coherently rotated.
     */
    private _collectDepthDiagnostics;
    /**
     * Legacy fallback: freeze a clone of the render camera. Only correct when
     * the snapshot was rendered from that camera (simulator / non-XR); kept as
     * a fallback for callers without device-camera parameters.
     */
    private _buildRenderFrozenCamera;
    /** Clone the live depth mesh into a static snapshot. */
    private _snapshotDepthMesh;
    /** Estimate the floor Y from the live depth mesh (5th-percentile of vertex Y). */
    private _estimateFloorY;
}
