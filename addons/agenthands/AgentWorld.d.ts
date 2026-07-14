import * as THREE from 'three';
/**
 * The subset of a detected object this module reads: a label, an optional 3D
 * position (used as a grounding fallback), and an optional normalized 2D
 * bounding box (0..1) used to raycast a 3D point.
 */
export interface DetectedObject {
    label: string;
    position?: THREE.Vector3;
    detection2DBoundingBox?: THREE.Box2;
}
/** The object detector this module drives (e.g. `xb.core.world.objects`). */
export interface ObjectDetector {
    runDetection(): Promise<DetectedObject[] | null | undefined> | DetectedObject[];
}
/** A detected object grounded to a world position (null if not groundable). */
export interface GroundedObject {
    label: string;
    point: THREE.Vector3 | null;
}
type DepthMesh = THREE.Object3D & {
    __origRaycast?: THREE.Object3D['raycast'];
};
/** Configuration for {@link AgentWorld}. */
export interface AgentWorldOptions {
    /** Returns the object detector, or null if detection is unavailable. */
    getDetector: () => ObjectDetector | null | undefined;
    /** Returns the live camera used to raycast detections. */
    getCamera: () => THREE.PerspectiveCamera | null | undefined;
    /** Returns the depth mesh to raycast against, or null to use fallbacks. */
    getDepthMesh: () => DepthMesh | null | undefined;
    /**
     * Optional aspect ratio (width / height) of the snapshot the detector saw,
     * used to correct the raycast when it differs from the camera aspect.
     */
    getSnapshotAspect?: () => Promise<number | undefined> | number | undefined;
    /** If set, grounded objects are persisted to `localStorage` under this key. */
    storageKey?: string;
    /** Distance (metres) the camera must move to trigger an auto-rescan. */
    moveThreshold?: number;
    /** Angle (radians) the camera must turn to trigger an auto-rescan. */
    turnThreshold?: number;
    /** Minimum time (ms) between auto-rescans. */
    rescanCooldownMs?: number;
}
/**
 * World understanding for the agent: runs object detection, grounds each
 * detection to a 3D point by raycasting its bounding-box centre against the
 * depth mesh, caches the results (optionally persisting them to local storage),
 * and re-scans in the background as the user moves. The agent points at
 * whatever the most recent scan found.
 */
export declare class AgentWorld {
    /** The most recent grounded objects. */
    objects: GroundedObject[];
    /** Whether a scan is currently running. */
    scanning: boolean;
    /**
     * Whether at least one scan has completed this session. Objects loaded from
     * local storage do not set this, so callers can avoid treating a persisted
     * cache as a confirmed, current view of the room.
     */
    scanned: boolean;
    /** The in-flight scan, or null. Await it to serialize against a scan. */
    scanPromise: Promise<void> | null;
    private readonly opts;
    private lastScanAt;
    private readonly scanCamPos;
    private readonly scanCamQuat;
    private readonly camPos;
    private readonly camQuat;
    private readonly ndc;
    private readonly raycaster;
    /** @param options - How to reach the detector, camera, and depth mesh. */
    constructor(options: AgentWorldOptions);
    /**
     * Kicks off a background scan of the room. Idempotent while a scan is
     * running; the returned promise resolves when the scan finishes.
     * @returns The scan promise.
     */
    scan(): Promise<void>;
    /**
     * Re-scans in the background once the camera has moved or turned far enough
     * since the last scan (respecting the cooldown). Call once per frame.
     */
    maybeAutoScan(): void;
    /**
     * Finds the grounded object whose label best matches a target label (exact,
     * then substring either way, ignoring a leading "the ").
     * @param label - The target label, e.g. from a `[point:LABEL]` gesture.
     * @returns The best match, or null.
     */
    findObject(label: string): GroundedObject | null;
    /**
     * Resolves a target label to a world position.
     * @param label - The target label.
     * @returns The grounded point, or null if unknown/ungroundable.
     */
    pointFor(label: string): THREE.Vector3 | null;
    /** Loads any persisted objects from local storage into the cache. */
    loadPersisted(): void;
    private detect_;
    private groundPoint_;
    private persist_;
    private now_;
}
export {};
