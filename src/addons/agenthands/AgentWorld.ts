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
  runDetection():
    | Promise<DetectedObject[] | null | undefined>
    | DetectedObject[];
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

interface PersistedObject {
  label: string;
  point: number[] | null;
}

// Auto-rescan defaults: how far the camera must move or turn since the last
// scan to trigger a background re-scan, and the minimum time between them.
const DEFAULT_MOVE_THRESHOLD_M = 0.5;
const DEFAULT_TURN_THRESHOLD_RAD = 0.6;
const DEFAULT_RESCAN_COOLDOWN_MS = 5000;

/**
 * World understanding for the agent: runs object detection, grounds each
 * detection to a 3D point by raycasting its bounding-box centre against the
 * depth mesh, caches the results (optionally persisting them to local storage),
 * and re-scans in the background as the user moves. The agent points at
 * whatever the most recent scan found.
 */
export class AgentWorld {
  /** The most recent grounded objects. */
  objects: GroundedObject[] = [];
  /** Whether a scan is currently running. */
  scanning = false;
  /**
   * Whether at least one scan has completed this session. Objects loaded from
   * local storage do not set this, so callers can avoid treating a persisted
   * cache as a confirmed, current view of the room.
   */
  scanned = false;
  /** The in-flight scan, or null. Await it to serialize against a scan. */
  scanPromise: Promise<void> | null = null;

  private readonly opts: Required<
    Omit<AgentWorldOptions, 'getSnapshotAspect' | 'storageKey'>
  > &
    Pick<AgentWorldOptions, 'getSnapshotAspect' | 'storageKey'>;
  private lastScanAt = 0;
  private readonly scanCamPos = new THREE.Vector3();
  private readonly scanCamQuat = new THREE.Quaternion();
  private readonly camPos = new THREE.Vector3();
  private readonly camQuat = new THREE.Quaternion();
  private readonly ndc = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();

  /** @param options - How to reach the detector, camera, and depth mesh. */
  constructor(options: AgentWorldOptions) {
    this.opts = {
      moveThreshold: DEFAULT_MOVE_THRESHOLD_M,
      turnThreshold: DEFAULT_TURN_THRESHOLD_RAD,
      rescanCooldownMs: DEFAULT_RESCAN_COOLDOWN_MS,
      ...options,
    };
    this.loadPersisted();
  }

  /**
   * Kicks off a background scan of the room. Idempotent while a scan is
   * running; the returned promise resolves when the scan finishes.
   * @returns The scan promise.
   */
  scan(): Promise<void> {
    if (this.scanning) return this.scanPromise ?? Promise.resolve();
    const detector = this.opts.getDetector();
    if (!detector?.runDetection) return Promise.resolve();
    this.scanning = true;
    this.scanPromise = this.detect_(detector).finally(() => {
      this.scanning = false;
      this.scanPromise = null;
    });
    return this.scanPromise;
  }

  /**
   * Re-scans in the background once the camera has moved or turned far enough
   * since the last scan (respecting the cooldown). Call once per frame.
   */
  maybeAutoScan() {
    if (this.scanning) return;
    if (this.now_() - this.lastScanAt < this.opts.rescanCooldownMs) return;
    const cam = this.opts.getCamera();
    if (!cam) return;
    cam.getWorldPosition(this.camPos);
    cam.getWorldQuaternion(this.camQuat);
    const moved = this.camPos.distanceTo(this.scanCamPos);
    const turned = this.camQuat.angleTo(this.scanCamQuat);
    if (moved > this.opts.moveThreshold || turned > this.opts.turnThreshold) {
      this.scan();
    }
  }

  /**
   * Finds the grounded object whose label best matches a target label (exact,
   * then substring either way, ignoring a leading "the ").
   * @param label - The target label, e.g. from a `[point:LABEL]` gesture.
   * @returns The best match, or null.
   */
  findObject(label: string): GroundedObject | null {
    if (!label) return null;
    const needle = label.toLowerCase().replace(/^the\s+/, '');
    let best: GroundedObject | null = null;
    for (const obj of this.objects) {
      const hay = obj.label.toLowerCase();
      if (hay === needle) return obj;
      if (!best && (hay.includes(needle) || needle.includes(hay))) best = obj;
    }
    return best;
  }

  /**
   * Resolves a target label to a world position.
   * @param label - The target label.
   * @returns The grounded point, or null if unknown/ungroundable.
   */
  pointFor(label: string): THREE.Vector3 | null {
    return this.findObject(label)?.point ?? null;
  }

  /** Loads any persisted objects from local storage into the cache. */
  loadPersisted() {
    const key = this.opts.storageKey;
    if (!key || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw) as PersistedObject[];
      if (!Array.isArray(data)) return;
      this.objects = data
        .filter((d) => d && typeof d.label === 'string')
        .map((d) => ({
          label: d.label,
          point: Array.isArray(d.point)
            ? new THREE.Vector3().fromArray(d.point)
            : null,
        }));
    } catch {
      // Ignore malformed storage.
    }
  }

  // Runs one detection pass with the camera frozen at scan time, grounds each
  // object, and replaces the cache (even when empty, so the agent never points
  // at objects from an old view).
  private async detect_(detector: ObjectDetector) {
    this.lastScanAt = this.now_();
    const live = this.opts.getCamera();
    if (!live) return;
    live.getWorldPosition(this.scanCamPos);
    live.getWorldQuaternion(this.scanCamQuat);

    // Freeze the camera so re-grounding lines up with the pixels the detector
    // saw, even if the user moves during the (slow) call.
    const cam = live.clone();
    cam.matrixAutoUpdate = false;
    live.updateMatrixWorld();
    cam.matrixWorld.copy(live.matrixWorld);
    cam.matrixWorldInverse.copy(live.matrixWorld).invert();
    cam.projectionMatrix.copy(live.projectionMatrix);
    cam.projectionMatrixInverse.copy(live.projectionMatrixInverse);
    let snapAspect = live.aspect;
    try {
      const aspect = await this.opts.getSnapshotAspect?.();
      if (aspect) snapAspect = aspect;
    } catch {
      // Fall back to the camera aspect.
    }

    try {
      const detected = (await detector.runDetection()) ?? [];
      const mesh = this.opts.getDepthMesh();
      this.objects = detected.map((obj) => ({
        label: obj.label,
        point: this.groundPoint_(obj, cam, snapAspect, mesh),
      }));
      this.scanned = true;
      this.persist_();
    } catch (error) {
      console.warn('[AgentWorld] object detection failed', error);
    }
  }

  // Raycasts an object's 2D bbox centre against the depth mesh to get a world
  // point, applying the snapshot-vs-camera aspect correction so the ray is not
  // pulled wide on the mismatched axis. Falls back to the object's own position.
  private groundPoint_(
    obj: DetectedObject,
    cam: THREE.PerspectiveCamera,
    snapAspect: number,
    mesh: DepthMesh | null | undefined
  ): THREE.Vector3 | null {
    const fallback = obj.position ? obj.position.clone() : null;
    const box = obj.detection2DBoundingBox;
    if (!mesh || !box) return fallback;
    const u = (box.min.x + box.max.x) * 0.5;
    const v = (box.min.y + box.max.y) * 0.5;
    let sx = 1;
    let sy = 1;
    if (snapAspect < cam.aspect) sx = snapAspect / cam.aspect;
    else if (snapAspect > cam.aspect) sy = cam.aspect / snapAspect;
    this.ndc.set((u * 2 - 1) * sx, (1 - v) * 2 * sy - sy);
    this.raycaster.setFromCamera(this.ndc, cam);
    // The app may no-op the depth mesh's raycast (so a wall doesn't steal hover
    // from a UI panel); restore the original just for this grounding query.
    const nooped = mesh.raycast;
    if (mesh.__origRaycast) mesh.raycast = mesh.__origRaycast;
    let hits: THREE.Intersection[];
    try {
      hits = this.raycaster.intersectObject(mesh, true);
    } finally {
      mesh.raycast = nooped;
    }
    return hits.length ? hits[0].point.clone() : fallback;
  }

  private persist_() {
    const key = this.opts.storageKey;
    if (!key || typeof localStorage === 'undefined') return;
    try {
      const data: PersistedObject[] = this.objects.map((o) => ({
        label: o.label,
        point: o.point ? o.point.toArray() : null,
      }));
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // Ignore storage failures (quota, private mode, etc.).
    }
  }

  private now_(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
