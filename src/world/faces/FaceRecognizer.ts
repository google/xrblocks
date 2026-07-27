import * as THREE from 'three';
import {getCameraParametersSnapshot} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Script} from '../../core/Script';
import {Depth} from '../../depth/Depth';
import {enableAcceleratedRaycast, isBVHReady} from '../../utils/BVHRaycast';
import {disposeMaterial} from '../../utils/ThreeDisposal';
import {WorldOptions} from '../WorldOptions';
import {DetectedFace} from './DetectedFace';
import {BaseFaceBackend, FaceBackendContext} from './FaceDetectorBackend';
import {MediaPipeFaceBackend} from './backends/MediaPipeFaceBackend';

// Kick off the BVH-accelerated raycast prototype patches at module
// load so the per-landmark raycasts inside processFaceLandmarkerResult
// go through the accelerated path. Fire-and-forget: the helper loads
// three-mesh-bvh dynamically and the SDK keeps working even if the
// module isn't installed or in the importmap (raycasts fall back to
// the stock walker). idempotent across modules so multiple subsystems
// can ping it safely.
//
// FaceLandmarker emits 478 landmarks per face and we raycast each one
// against the depth-mesh snapshot. Stock three.js is O(triangles) per
// ray; the depth mesh runs in the thousands of triangles so without
// BVH the per-detection raycast loop alone dominates the frame budget.
enableAcceleratedRaycast();

/**
 * A detector script that orchestrates face landmark estimation. Manages
 * the backend face detector lifecycle (e.g. MediaPipe) and exposes the
 * detected faces, including 3D landmark positions, blendshape weights,
 * and rigid head transforms, in the world coordinate space.
 */
export class FaceRecognizer extends Script {
  static dependencies = {
    options: WorldOptions,
    deviceCamera: XRDeviceCamera,
    depth: Depth,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
  };

  private _detectorBackends = new Map<string, Promise<BaseFaceBackend>>();
  private activeClients = new Set<object>();
  private currentDetectionPromise: Promise<DetectedFace[]> | null = null;
  private lastContinuousDetectionStartedAtMs = -Infinity;
  private disposed = false;

  /**
   * The latest detected faces from continuous detection.
   */
  public detectedFaces: DetectedFace[] = [];

  // Injected dependencies
  private options!: WorldOptions;
  private deviceCamera!: XRDeviceCamera;
  public depth!: Depth;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  targetDevice = 'galaxyxr';

  init({
    options,
    deviceCamera,
    depth,
    camera,
    renderer,
  }: {
    options: WorldOptions;
    deviceCamera: XRDeviceCamera;
    depth: Depth;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
  }) {
    this.options = options;
    this.deviceCamera = deviceCamera;
    this.depth = depth;
    this.camera = camera;
    this.renderer = renderer;
    this.disposed = false;
  }

  /**
   * Starts continuous face detection for the given client.
   * If this is the first client, starts the background detection loop.
   * @param client - The client object requesting face detection.
   */
  start(client: object): void {
    if (this.activeClients.has(client)) {
      return;
    }
    this.activeClients.add(client);
    if (this.activeClients.size === 1) {
      this.runContinuousDetection();
    }
  }

  /**
   * Stops continuous face detection for the given client.
   * If this was the last client, stops the background detection loop.
   * @param client - The client object that no longer needs face detection.
   */
  stop(client: object): void {
    this.activeClients.delete(client);
  }

  /**
   * Called per frame by the engine. If there are active clients,
   * ensures the continuous face detection is running.
   */
  override update() {
    if (this.activeClients.size === 0 || this.currentDetectionPromise) {
      return;
    }

    const pollingIntervalMs = this.options.faces.pollingIntervalMs;
    if (
      pollingIntervalMs > 0 &&
      performance.now() - this.lastContinuousDetectionStartedAtMs <
        pollingIntervalMs
    ) {
      return;
    }

    this.runContinuousDetection();
  }

  private runContinuousDetection() {
    if (this.currentDetectionPromise) {
      return;
    }
    this.lastContinuousDetectionStartedAtMs = performance.now();
    this.currentDetectionPromise = this.runDetectionInternal()
      .then((results) => {
        if (!this.disposed) {
          this.detectedFaces = results;
        }
        return results;
      })
      .finally(() => {
        this.currentDetectionPromise = null;
      });
  }

  /**
   * Runs face landmark detection or returns the ongoing detection promise.
   *
   * - If continuous detection is started (has active clients), returns the
   *   promise for the next detection result.
   * - If continuous detection is not started, performs a one-off detection and
   *   returns the result. If a one-off detection is already in progress, returns
   *   the promise for that ongoing detection.
   */
  runDetection(): Promise<DetectedFace[]> {
    if (this.currentDetectionPromise) {
      return this.currentDetectionPromise;
    }
    if (this.activeClients.size > 0) {
      this.runContinuousDetection();
      return this.currentDetectionPromise!;
    }
    this.currentDetectionPromise = this.runDetectionInternal().finally(() => {
      this.currentDetectionPromise = null;
    });
    return this.currentDetectionPromise;
  }

  private async runDetectionInternal(): Promise<DetectedFace[]> {
    this.clear();

    if (!this.depth || !this.depth.depthMesh) {
      console.warn(
        'Cannot run Face Detection: Depth module / depthMesh is not enabled or initialized.'
      );
      return [];
    }

    const cameraParametersSnapshot = getCameraParametersSnapshot(
      this.camera,
      this.renderer.xr.getCamera(),
      this.deviceCamera,
      this.targetDevice
    );
    if (!cameraParametersSnapshot) {
      // Device camera not ready yet (warming up); skip until it is available.
      return [];
    }

    const context = this.getBackendContext();
    const activeBackend = this.options.faces.backendConfig.activeBackend;
    const backendPromise = this.getOrCreateBackend(activeBackend, context);

    let backend: BaseFaceBackend;
    try {
      backend = await backendPromise;
    } catch (error: unknown) {
      console.warn(
        `Failed to load or initialize FaceRecognizer backend '${activeBackend}':`,
        error
      );
      return [];
    }

    if (this.disposed) {
      return [];
    }

    const depthMeshSnapshot = this.getDepthMeshSnapshot();
    const faces = await backend.run(
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    return this.disposed ? [] : faces;
  }

  private getBackendContext(): FaceBackendContext {
    return {
      options: this.options,
      deviceCamera: this.deviceCamera,
    };
  }

  private getOrCreateBackend(
    activeBackend: string,
    context: FaceBackendContext
  ): Promise<BaseFaceBackend> {
    let backendPromise = this._detectorBackends.get(activeBackend);

    if (!backendPromise) {
      backendPromise = (async () => {
        switch (activeBackend) {
          case 'mediapipe':
            return new MediaPipeFaceBackend(context);
          default:
            throw new Error(
              `FaceRecognizer backend '${activeBackend}' is not supported.`
            );
        }
      })();
      this._detectorBackends.set(activeBackend, backendPromise);
    }
    return backendPromise;
  }

  // Cached depth-mesh snapshot (cloned geometry + BVH). We rebuild it
  // only when the source depth geometry's position attribute bumps its
  // version (three.js does this automatically whenever the depth mesh
  // refreshes via needsUpdate = true). For a static desktop sim the
  // BVH build therefore amortizes across all detections instead of
  // running every detection.
  private cachedDepthMeshSnapshot: THREE.Mesh | null = null;
  private cachedDepthMeshSource: THREE.BufferGeometry | null = null;
  private cachedDepthMeshVersion = -1;

  private getDepthMeshSnapshot() {
    const depthMesh = this.depth.depthMesh!;
    const geometry = this.depth.options.depthMesh.updateFullResolutionGeometry
      ? depthMesh.geometry
      : depthMesh.downsampledGeometry || depthMesh.geometry;
    // Both BufferAttribute and InterleavedBufferAttribute carry a
    // `version` field that three.js bumps on `needsUpdate = true`, but
    // the type for the union doesn't expose it. Cast to read.
    const positionAttr = geometry.attributes.position as unknown as {
      version: number;
    };
    const version = positionAttr.version;
    if (
      this.cachedDepthMeshSnapshot &&
      this.cachedDepthMeshSource === geometry &&
      this.cachedDepthMeshVersion === version
    ) {
      // Source geometry hasn't been updated since last snapshot. Refresh
      // the cached snapshot's world transform (cheap) and return it as
      // is. The BVH built over the cloned positions is still valid
      // because the source positions haven't changed.
      depthMesh.getWorldPosition(this.cachedDepthMeshSnapshot.position);
      depthMesh.getWorldQuaternion(this.cachedDepthMeshSnapshot.quaternion);
      depthMesh.getWorldScale(this.cachedDepthMeshSnapshot.scale);
      this.cachedDepthMeshSnapshot.updateMatrixWorld(true);
      return this.cachedDepthMeshSnapshot;
    }
    // Source changed (or first call). Dispose the previous BVH so its
    // backing buffers free, then clone + rebuild.
    if (this.cachedDepthMeshSnapshot) {
      this.disposeCachedDepthMeshSnapshot();
    }
    const clonedGeometry = geometry.clone();
    clonedGeometry.computeBoundingSphere();
    clonedGeometry.computeBoundingBox();
    // Build a BVH over the cloned depth-mesh geometry when three-mesh-bvh
    // is available so the per-landmark raycasts inside
    // processFaceLandmarkerResult go through the BVH-accelerated path
    // instead of walking every triangle 478 times. If BVH isn't ready
    // yet (dynamic import in flight or three-mesh-bvh not installed),
    // we skip computeBoundsTree and the stock raycaster takes over.
    if (isBVHReady()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (clonedGeometry as any).computeBoundsTree();
    }
    const depthMeshSnapshot = new THREE.Mesh(
      clonedGeometry,
      new THREE.MeshBasicMaterial()
    );
    depthMesh.getWorldPosition(depthMeshSnapshot.position);
    depthMesh.getWorldQuaternion(depthMeshSnapshot.quaternion);
    depthMesh.getWorldScale(depthMeshSnapshot.scale);
    depthMeshSnapshot.updateMatrixWorld(true);
    this.cachedDepthMeshSnapshot = depthMeshSnapshot;
    this.cachedDepthMeshSource = geometry;
    this.cachedDepthMeshVersion = version;
    return depthMeshSnapshot;
  }

  private disposeCachedDepthMeshSnapshot() {
    if (!this.cachedDepthMeshSnapshot) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.cachedDepthMeshSnapshot.geometry as any).disposeBoundsTree?.();
    this.cachedDepthMeshSnapshot.geometry.dispose();
    disposeMaterial(this.cachedDepthMeshSnapshot.material);
    this.cachedDepthMeshSnapshot = null;
    this.cachedDepthMeshSource = null;
    this.cachedDepthMeshVersion = -1;
  }

  override dispose() {
    this.disposed = true;
    this.activeClients.clear();
    this.clear();
    this.detectedFaces = [];
    const pendingDetection = this.currentDetectionPromise;
    if (pendingDetection) {
      void pendingDetection
        .finally(() => {
          this.disposeCachedDepthMeshSnapshot();
        })
        .catch(() => {});
    } else {
      this.disposeCachedDepthMeshSnapshot();
    }
    for (const backendPromise of this._detectorBackends.values()) {
      void backendPromise
        .then((backend) => backend.dispose?.())
        .catch(() => {});
    }
    this._detectorBackends.clear();
  }
}
