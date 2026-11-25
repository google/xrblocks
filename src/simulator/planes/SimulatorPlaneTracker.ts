import * as THREE from 'three';

import type {SimulatorPlane} from '../../world/planes/SimulatorPlane';
import type {SimulatorPlaneTrackingOptions} from '../SimulatorOptions';
import type {SimulatorDepthFrame} from '../scene/SimulatorDepth';

import type {
  DepthPlaneTrackerConfig,
  PlaneTrackingWorkerRequest,
  PlaneTrackingWorkerResponse,
  TrackedPlaneSnapshot,
} from './SimulatorPlaneTrackingTypes';

const DEFAULT_POSITION_DELTA_METERS = 0.02;
const DEFAULT_ROTATION_DELTA_RADIANS = 0.02;
const DEFAULT_IDLE_REFRESH_MIN_MS = 1000;

export interface PlaneTrackingWorkerLike {
  onmessage:
    | ((event: MessageEvent<PlaneTrackingWorkerResponse>) => void)
    | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(
    message: PlaneTrackingWorkerRequest,
    transfer?: Transferable[]
  ): void;
  terminate(): void;
}

export type PlaneTrackingWorkerFactory = (
  workerUrl: URL
) => PlaneTrackingWorkerLike;

export interface SimulatorPlaneTrackerOptions {
  /** Minimum interval in ms between worker frame dispatches. */
  updateIntervalMs?: number;
  /** Minimum camera translation in meters to trigger a new frame. */
  positionDeltaMeters?: number;
  /** Minimum camera rotation in radians to trigger a new frame. */
  rotationDeltaRadians?: number;
  /** Tracker algorithm configuration forwarded to the worker. */
  trackerConfig?: DepthPlaneTrackerConfig;
  /** Optional worker factory override for testing. */
  workerFactory?: PlaneTrackingWorkerFactory;
  /** Callback invoked on the main thread when tracked planes update. */
  onPlanesUpdated?: (planes: SimulatorPlane[], sceneGeneration: number) => void;
}

function isSecurityError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as {name?: unknown}).name === 'SecurityError'
  );
}

/**
 * Converts a worker {@link TrackedPlaneSnapshot} into a Three.js
 * {@link SimulatorPlane} consumable by {@link PlaneDetector}.
 */
export function snapshotToSimulatorPlane(
  snapshot: TrackedPlaneSnapshot
): SimulatorPlane {
  const polygon: THREE.Vector2[] = [];
  for (let i = 0; i + 1 < snapshot.polygon.length; i += 2) {
    polygon.push(
      new THREE.Vector2(snapshot.polygon[i], snapshot.polygon[i + 1])
    );
  }
  return {
    id: snapshot.id,
    type: snapshot.type,
    label: snapshot.label,
    area: snapshot.area,
    position: new THREE.Vector3(
      snapshot.position[0],
      snapshot.position[1],
      snapshot.position[2]
    ),
    quaternion: new THREE.Quaternion(
      snapshot.quaternion[0],
      snapshot.quaternion[1],
      snapshot.quaternion[2],
      snapshot.quaternion[3]
    ),
    polygon,
    lastChangedTime: snapshot.lastChangedTime,
  };
}

/**
 * Main-thread controller that feeds simulated depth frames to the dedicated
 * plane-tracking WebWorker without blocking the render loop.
 *
 * The worker is created lazily on the first submitted frame so rooms using
 * hardcoded planes incur zero worker startup or depth readback overhead.
 */
export class SimulatorPlaneTracker {
  private updateIntervalMs: number;
  private positionDeltaSq: number;
  private rotationDeltaRadians: number;
  private trackerConfig: DepthPlaneTrackerConfig;
  private readonly workerFactory?: PlaneTrackingWorkerFactory;
  private onPlanesUpdated?: (
    planes: SimulatorPlane[],
    sceneGeneration: number
  ) => void;

  private worker: PlaneTrackingWorkerLike | null = null;
  private blobWorkerUrl: string | null = null;
  private workerFailed = false;
  private active = false;
  private paused = false;
  private disposed = false;

  private sceneGeneration = 0;
  private nextRequestId = 1;
  private inFlight = false;
  private inFlightRequestId?: number;
  private hasSubmittedInGeneration = false;

  private lastSubmitTimestampMs = -Infinity;
  private readonly lastSubmittedPosition = new THREE.Vector3(NaN, NaN, NaN);
  private readonly lastSubmittedQuaternion = new THREE.Quaternion(
    NaN,
    NaN,
    NaN,
    NaN
  );
  private readonly scratchPosition = new THREE.Vector3();
  private readonly scratchQuaternion = new THREE.Quaternion();

  private latestPlanes: SimulatorPlane[] = [];

  constructor(options: SimulatorPlaneTrackerOptions = {}) {
    this.updateIntervalMs = Math.max(0, options.updateIntervalMs ?? 200);
    const posDelta =
      options.positionDeltaMeters ?? DEFAULT_POSITION_DELTA_METERS;
    this.positionDeltaSq = posDelta * posDelta;
    this.rotationDeltaRadians =
      options.rotationDeltaRadians ?? DEFAULT_ROTATION_DELTA_RADIANS;
    this.trackerConfig = {...options.trackerConfig};
    this.workerFactory = options.workerFactory;
    this.onPlanesUpdated = options.onPlanesUpdated;
  }

  static fromSimulatorOptions(
    planeTrackingOptions: SimulatorPlaneTrackingOptions,
    callbacks?: Pick<
      SimulatorPlaneTrackerOptions,
      'onPlanesUpdated' | 'workerFactory'
    >
  ): SimulatorPlaneTracker {
    return new SimulatorPlaneTracker({
      updateIntervalMs: planeTrackingOptions.updateIntervalMs,
      trackerConfig: {
        maxDepthMeters: planeTrackingOptions.maxDepthMeters,
        maxTrackedPlanes: planeTrackingOptions.maxTrackedPlanes,
      },
      onPlanesUpdated: callbacks?.onPlanesUpdated,
      workerFactory: callbacks?.workerFactory,
    });
  }

  get isActive(): boolean {
    return this.active && !this.disposed;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isInFlight(): boolean {
    return this.inFlight;
  }

  get currentSceneGeneration(): number {
    return this.sceneGeneration;
  }

  get hasWorker(): boolean {
    return this.worker !== null;
  }

  get trackedPlanes(): readonly SimulatorPlane[] {
    return this.latestPlanes;
  }

  isSupported(): boolean {
    if (this.workerFailed) return false;
    return Boolean(this.workerFactory) || typeof Worker !== 'undefined';
  }

  setOnPlanesUpdated(
    callback?: (planes: SimulatorPlane[], sceneGeneration: number) => void
  ) {
    this.onPlanesUpdated = callback;
  }

  configure(
    config: DepthPlaneTrackerConfig,
    options?: {updateIntervalMs?: number}
  ) {
    this.trackerConfig = {...this.trackerConfig, ...config};
    if (options?.updateIntervalMs !== undefined) {
      this.updateIntervalMs = Math.max(0, options.updateIntervalMs);
    }
    if (this.worker && !this.disposed) {
      this.worker.postMessage({
        type: 'configure',
        config: this.trackerConfig,
      });
    }
  }

  /**
   * Activates or deactivates realistic depth-based plane tracking.
   * Does not spawn the worker until the first depth frame is submitted.
   */
  setActive(active: boolean) {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (active) {
      this.hasSubmittedInGeneration = false;
      this.lastSubmitTimestampMs = -Infinity;
    } else {
      this.inFlight = false;
      this.inFlightRequestId = undefined;
    }
  }

  /** Pauses frame submission and suppresses worker updates (e.g. during XR sessions). */
  pause() {
    this.paused = true;
  }

  /** Resumes frame submission after {@link pause}. */
  resume() {
    if (this.disposed) return;
    this.paused = false;
  }

  /**
   * Advances the scene generation, clears tracked planes, and resets worker
   * state so stale in-flight replies from a previous scene are discarded.
   */
  reset(): number {
    this.sceneGeneration++;
    this.inFlight = false;
    this.inFlightRequestId = undefined;
    this.hasSubmittedInGeneration = false;
    this.lastSubmitTimestampMs = -Infinity;
    this.lastSubmittedPosition.set(NaN, NaN, NaN);
    this.lastSubmittedQuaternion.set(NaN, NaN, NaN, NaN);
    this.latestPlanes = [];

    if (this.worker && !this.disposed) {
      this.worker.postMessage({
        type: 'reset',
        sceneGeneration: this.sceneGeneration,
      });
    }
    return this.sceneGeneration;
  }

  /**
   * Returns true when the tracker is ready for a new depth capture from the
   * simulator camera. Used to avoid unnecessary GPU depth readbacks when the
   * worker is busy, throttled, or the camera has not moved.
   */
  wantsDepthFrame(camera: THREE.Camera, nowMs = performance.now()): boolean {
    if (
      this.disposed ||
      !this.active ||
      this.paused ||
      this.inFlight ||
      !this.isSupported()
    ) {
      return false;
    }
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.scratchPosition);
    camera.getWorldQuaternion(this.scratchQuaternion);
    return this.shouldProcessPose(
      this.scratchPosition,
      this.scratchQuaternion,
      nowMs
    );
  }

  /**
   * Submits a captured depth frame to the WebWorker when active and not
   * throttled or waiting on an in-flight pass.
   *
   * @returns True if the frame was posted to the worker, false if dropped.
   */
  submitDepthFrame(frame: SimulatorDepthFrame): boolean {
    if (
      this.disposed ||
      !this.active ||
      this.paused ||
      this.inFlight ||
      !this.isSupported()
    ) {
      return false;
    }
    if (
      frame.width <= 0 ||
      frame.height <= 0 ||
      frame.depthBuffer.length < frame.width * frame.height ||
      frame.projectionMatrix.length < 16
    ) {
      return false;
    }
    if (
      !this.shouldProcessPose(
        frame.cameraPosition,
        frame.cameraQuaternion,
        frame.timestampMs
      )
    ) {
      return false;
    }

    const worker = this.ensureWorker();
    if (!worker) {
      return false;
    }

    const requestId = this.nextRequestId++;
    const pixelCount = frame.width * frame.height;
    const depthCopy = new Float32Array(pixelCount);
    depthCopy.set(frame.depthBuffer.subarray(0, pixelCount));
    const projectionCopy = new Float32Array(16);
    projectionCopy.set(frame.projectionMatrix.subarray(0, 16));

    const request: PlaneTrackingWorkerRequest = {
      type: 'processDepth',
      requestId,
      sceneGeneration: this.sceneGeneration,
      timestampMs: frame.timestampMs,
      width: frame.width,
      height: frame.height,
      depthBuffer: depthCopy,
      projectionMatrix: projectionCopy,
      cameraPosition: [
        frame.cameraPosition.x,
        frame.cameraPosition.y,
        frame.cameraPosition.z,
      ],
      cameraQuaternion: [
        frame.cameraQuaternion.x,
        frame.cameraQuaternion.y,
        frame.cameraQuaternion.z,
        frame.cameraQuaternion.w,
      ],
    };

    this.inFlight = true;
    this.inFlightRequestId = requestId;
    this.hasSubmittedInGeneration = true;
    this.lastSubmitTimestampMs = frame.timestampMs;
    this.lastSubmittedPosition.copy(frame.cameraPosition);
    this.lastSubmittedQuaternion.copy(frame.cameraQuaternion);

    try {
      worker.postMessage(request, [depthCopy.buffer, projectionCopy.buffer]);
    } catch (error) {
      this.inFlight = false;
      this.inFlightRequestId = undefined;
      console.warn(
        'SimulatorPlaneTracker failed to post depth frame to worker:',
        error
      );
      return false;
    }

    return true;
  }

  /**
   * Terminates the worker, revokes any Blob shim URL, and releases state.
   * Safe to call multiple times.
   */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.paused = false;
    this.inFlight = false;
    this.inFlightRequestId = undefined;
    this.latestPlanes = [];
    this.onPlanesUpdated = undefined;
    this.teardownWorker();
  }

  private shouldProcessPose(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    timestampMs: number
  ): boolean {
    if (!this.hasSubmittedInGeneration) {
      return true;
    }
    const elapsedMs = timestampMs - this.lastSubmitTimestampMs;
    if (elapsedMs < this.updateIntervalMs) {
      return false;
    }
    if (
      position.distanceToSquared(this.lastSubmittedPosition) >=
      this.positionDeltaSq
    ) {
      return true;
    }
    const dot = Math.min(
      1,
      Math.abs(quaternion.dot(this.lastSubmittedQuaternion))
    );
    const angle = 2 * Math.acos(dot);
    if (angle >= this.rotationDeltaRadians) {
      return true;
    }
    const idleRefreshMs = Math.max(
      this.updateIntervalMs * 5,
      DEFAULT_IDLE_REFRESH_MIN_MS
    );
    return elapsedMs >= idleRefreshMs;
  }

  private ensureWorker(): PlaneTrackingWorkerLike | null {
    if (this.worker) return this.worker;
    if (this.disposed || this.workerFailed) return null;

    let worker: PlaneTrackingWorkerLike | null = null;
    try {
      worker = this.createWorker();
    } catch (error) {
      this.workerFailed = true;
      console.warn('SimulatorPlaneTracker could not start WebWorker:', error);
      return null;
    }
    if (!worker) {
      return null;
    }

    worker.onmessage = (event: MessageEvent<PlaneTrackingWorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      this.inFlight = false;
      this.inFlightRequestId = undefined;
      this.workerFailed = true;
      const detail = event.message || 'unknown error';
      console.warn(`SimulatorPlaneTracker WebWorker error: ${detail}`);
      this.teardownWorker();
    };

    this.worker = worker;
    worker.postMessage({
      type: 'configure',
      config: this.trackerConfig,
    });
    if (this.sceneGeneration > 0) {
      worker.postMessage({
        type: 'reset',
        sceneGeneration: this.sceneGeneration,
      });
    }
    return worker;
  }

  private createWorker(): PlaneTrackingWorkerLike | null {
    const workerUrl = new URL(
      './SimulatorPlaneTrackingWorker.js',
      import.meta.url
    );
    if (this.workerFactory) {
      return this.workerFactory(workerUrl);
    }
    if (typeof Worker === 'undefined') {
      return null;
    }

    const currentOrigin = globalThis.location?.origin;
    const isCrossOrigin =
      Boolean(currentOrigin) &&
      currentOrigin !== 'null' &&
      workerUrl.origin !== currentOrigin;

    if (!isCrossOrigin) {
      try {
        return new Worker(workerUrl, {type: 'module'});
      } catch (error) {
        if (!isSecurityError(error)) {
          throw error;
        }
      }
    }

    if (
      typeof Blob === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return null;
    }
    const blob = new Blob([`import ${JSON.stringify(workerUrl.href)};`], {
      type: 'text/javascript',
    });
    this.blobWorkerUrl = URL.createObjectURL(blob);
    return new Worker(this.blobWorkerUrl, {type: 'module'});
  }

  private handleWorkerMessage(message: PlaneTrackingWorkerResponse) {
    if (this.disposed) return;

    if (message.type === 'error') {
      if (
        message.requestId === undefined ||
        message.requestId === this.inFlightRequestId
      ) {
        this.inFlight = false;
        this.inFlightRequestId = undefined;
      }
      console.warn(
        `SimulatorPlaneTracker worker reported error: ${message.message}`
      );
      return;
    }

    if (message.requestId === this.inFlightRequestId) {
      this.inFlight = false;
      this.inFlightRequestId = undefined;
    }

    if (message.sceneGeneration !== this.sceneGeneration) {
      return;
    }
    if (!this.active || this.paused) {
      return;
    }

    const planes = message.planes.map(snapshotToSimulatorPlane);
    this.latestPlanes = planes;
    this.onPlanesUpdated?.(planes, message.sceneGeneration);
  }

  private teardownWorker() {
    if (this.worker) {
      try {
        this.worker.postMessage({type: 'dispose'});
      } catch {
        // Ignore postMessage failures during shutdown.
      }
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    if (this.blobWorkerUrl) {
      URL.revokeObjectURL(this.blobWorkerUrl);
      this.blobWorkerUrl = null;
    }
  }
}
