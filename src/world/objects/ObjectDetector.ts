import * as THREE from 'three';

import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {getCameraParametersSnapshot} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Script} from '../../core/Script';
import {Depth} from '../../depth/Depth';
import {
  disposeMaterial,
  disposeObjectChildren,
  disposeObjectTree,
} from '../../utils/ThreeDisposal';
import {WorldOptions} from '../WorldOptions';
import {DetectedObject} from './DetectedObject';
import {
  BaseDetectorBackend,
  DetectorBackendContext,
} from './ObjectDetectorBackend';
import {GeminiDetectorBackend} from './backends/GeminiDetectorBackend';
import {MediaPipeDetectorBackend} from './backends/MediaPipeDetectorBackend';

/**
 * Represents a detected object in a normalized format, independent of the specific detector backend used.
 * Coordinates are normalized typically in the range [0, 1].
 *
 * T - The type of additional data associated with the detected object.
 */
export interface NormalizedDetectedObject<T> {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  objectName: string;
  additionalData?: T;
}

/**
 * Represents a snapshot taken from the device camera.
 * Can contain either a base64 encoded image string or raw ImageData.
 */
export interface CameraSnapshot {
  base64?: string;
  imageData?: ImageData;
}

/**
 * Detects objects in the user's environment using a specified backend.
 * It queries an AI model with the device camera feed and returns located
 * objects with 2D and 3D positioning data.
 */
export class ObjectDetector extends Script {
  static dependencies = {
    options: WorldOptions,
    ai: AI,
    aiOptions: AIOptions,
    deviceCamera: XRDeviceCamera,
    depth: Depth,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
  };

  /**
   * A map from the object's UUID to our custom `DetectedObject` instance.
   */
  private _detectedObjects = new Map<string, DetectedObject<unknown>>();
  private _detectorBackends = new Map<
    string,
    Promise<BaseDetectorBackend<unknown>>
  >();
  private activeClients = new Set<object>();
  private currentDetectionPromise: Promise<DetectedObject<unknown>[]> | null =
    null;
  private lastContinuousDetectionStartedAtMs = -Infinity;
  private disposed = false;

  private _debugVisualsGroup?: THREE.Group;

  /**
   * The latest detected objects.
   */
  public detectedObjects: DetectedObject<unknown>[] = [];

  // Injected dependencies
  private options!: WorldOptions;
  private ai!: AI;
  private aiOptions!: AIOptions;
  private deviceCamera!: XRDeviceCamera;
  private depth!: Depth;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  /**
   * Target device profile used to look up RGB camera intrinsics and pose
   * for converting detection bounding boxes into world space. Defaults to
   * `'galaxyxr'`; auto-overridden to `'quest3'` in {@link init} when the
   * Meta Quest browser is detected. Can be overridden manually before init.
   */
  targetDevice = 'galaxyxr';

  /**
   * Initializes the ObjectDetector.
   * @override
   */
  init({
    options,
    ai,
    aiOptions,
    deviceCamera,
    depth,
    camera,
    renderer,
  }: {
    options: WorldOptions;
    ai: AI;
    aiOptions: AIOptions;
    deviceCamera: XRDeviceCamera;
    depth: Depth;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
  }) {
    this.options = options;
    this.ai = ai;
    this.aiOptions = aiOptions;
    this.deviceCamera = deviceCamera;
    this.depth = depth;
    this.camera = camera;
    this.renderer = renderer;
    this.disposed = false;

    if (
      this.targetDevice === 'galaxyxr' &&
      typeof navigator !== 'undefined' &&
      /OculusBrowser|Quest/i.test(navigator.userAgent)
    ) {
      this.targetDevice = 'quest3';
    }

    if (this.options.objects.showDebugVisualizations) {
      this._debugVisualsGroup = new THREE.Group();
      // Disable raycasting for the debug group to prevent interaction errors.
      this._debugVisualsGroup.raycast = () => {};
      this.add(this._debugVisualsGroup);
    }
  }

  /**
   * Starts continuous object detection for the given client.
   * If this is the first client, starts the background detection loop.
   * @param client - The client object requesting object detection.
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
   * Stops continuous object detection for the given client.
   * If this was the last client, stops the background detection loop.
   * @param client - The client object that no longer needs object detection.
   */
  stop(client: object): void {
    this.activeClients.delete(client);
  }

  /**
   * Called per frame by the engine. If there are active clients,
   * ensures the continuous object detection is running.
   */
  override update() {
    if (this.activeClients.size === 0 || this.currentDetectionPromise) {
      return;
    }

    const pollingIntervalMs = this.options.objects.pollingIntervalMs;
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
          this.detectedObjects = results;
        }
        return results;
      })
      .finally(() => {
        this.currentDetectionPromise = null;
      });
  }

  /**
   * Runs object detection or returns the ongoing detection promise.
   *
   * - If continuous detection is started (has active clients), returns the
   *   promise for the next detection result.
   * - If continuous detection is not started, performs a one-off detection and
   *   returns the result. If a one-off detection is already in progress, returns
   *   the promise for that ongoing detection.
   *
   * @returns A promise that resolves with an
   * array of detected `DetectedObject` instances.
   */
  runDetection<T = null>(): Promise<DetectedObject<T>[]> {
    if (this.currentDetectionPromise) {
      return this.currentDetectionPromise as Promise<DetectedObject<T>[]>;
    }
    if (this.activeClients.size > 0) {
      this.runContinuousDetection();
      return this.currentDetectionPromise! as Promise<DetectedObject<T>[]>;
    }
    this.currentDetectionPromise = this.runDetectionInternal().finally(() => {
      this.currentDetectionPromise = null;
    });
    return this.currentDetectionPromise as Promise<DetectedObject<T>[]>;
  }

  private async runDetectionInternal<T = null>(): Promise<DetectedObject<T>[]> {
    this.clearDetectedObjects(); // Clear previous scene results before starting a new detection.

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

    const context = this.getDetectorContext();
    const activeBackend = this.options.objects.backendConfig.activeBackend;
    const detectorBackendPromise = this.getOrCreateDetectorBackend<T>(
      activeBackend,
      context
    );

    let detectorBackend: BaseDetectorBackend<T>;
    try {
      detectorBackend = await detectorBackendPromise;
    } catch (error) {
      console.warn(
        `Failed to load or initialize ObjectDetector backend '${activeBackend}':`,
        error
      );
      return [];
    }
    if (this.disposed) {
      return [];
    }
    const depthMeshSnapshot = this.getDepthMeshSnapshot();
    try {
      const detectedObjects = await detectorBackend.run(
        depthMeshSnapshot,
        cameraParametersSnapshot
      );
      if (this.disposed) {
        return [];
      }
      for (const obj of detectedObjects) {
        this._detectedObjects.set(obj.uuid, obj);
        this.add(obj);
      }
      return detectedObjects;
    } finally {
      this.disposeDepthMeshSnapshot(depthMeshSnapshot);
    }
  }

  private getDetectorContext(): DetectorBackendContext {
    return {
      options: this.options,
      ai: this.ai,
      aiOptions: this.aiOptions,
      deviceCamera: this.deviceCamera,
      debugVisualsGroup: this._debugVisualsGroup,
    };
  }

  private getOrCreateDetectorBackend<T>(
    activeBackend: string,
    context: DetectorBackendContext
  ): Promise<BaseDetectorBackend<T>> {
    let detectorBackendPromise = this._detectorBackends.get(activeBackend) as
      | Promise<BaseDetectorBackend<T>>
      | undefined;

    if (!detectorBackendPromise) {
      detectorBackendPromise = (async () => {
        switch (activeBackend) {
          case 'gemini':
            return new GeminiDetectorBackend(
              context
            ) as unknown as BaseDetectorBackend<T>;
          case 'mediapipe':
            return new MediaPipeDetectorBackend(
              context
            ) as unknown as BaseDetectorBackend<T>;
          default:
            throw new Error(
              `ObjectDetector backend '${activeBackend}' is not supported.`
            );
        }
      })();
      this._detectorBackends.set(
        activeBackend,
        detectorBackendPromise as Promise<BaseDetectorBackend<unknown>>
      );
    }
    return detectorBackendPromise;
  }

  private getDepthMeshSnapshot() {
    const depthMesh = this.depth.depthMesh!;
    const geometry = this.depth.options.depthMesh.updateFullResolutionGeometry
      ? depthMesh.geometry
      : depthMesh.downsampledGeometry || depthMesh.geometry;
    const clonedGeometry = geometry.clone();
    clonedGeometry.computeBoundingSphere();
    clonedGeometry.computeBoundingBox();
    const depthMeshSnapshot = new THREE.Mesh(
      clonedGeometry,
      new THREE.MeshBasicMaterial()
    );
    depthMesh.getWorldPosition(depthMeshSnapshot.position);
    depthMesh.getWorldQuaternion(depthMeshSnapshot.quaternion);
    depthMesh.getWorldScale(depthMeshSnapshot.scale);
    depthMeshSnapshot.updateMatrixWorld(true);
    return depthMeshSnapshot;
  }

  /**
   * Retrieves a list of currently detected objects.
   *
   * @param label - The semantic label to filter by (e.g., 'chair'). If null,
   * all objects are returned.
   * @returns An array of `Object` instances.
   */
  get<T = null>(label = null): DetectedObject<T>[] {
    const allObjects = Array.from(this._detectedObjects.values());
    if (!label) {
      return allObjects as DetectedObject<T>[];
    }
    return allObjects.filter(
      (obj) => obj.label === label
    ) as DetectedObject<T>[];
  }

  /**
   * Removes all currently detected objects from the scene and internal
   * tracking.
   */
  clear() {
    this.clearDetectedObjects();
    this.detectedObjects = [];
    return this;
  }

  private clearDetectedObjects() {
    for (const obj of this._detectedObjects.values()) {
      disposeObjectTree(obj);
      this.remove(obj);
    }
    this._detectedObjects.clear();
    if (this._debugVisualsGroup) {
      disposeObjectChildren(this._debugVisualsGroup);
    }
  }

  private disposeDepthMeshSnapshot(depthMeshSnapshot: THREE.Mesh) {
    depthMeshSnapshot.geometry.dispose();
    disposeMaterial(depthMeshSnapshot.material);
  }

  /**
   * Toggles the visibility of all debug visualizations for detected objects.
   * @param visible - Whether the visualizations should be visible.
   */
  showDebugVisualizations(visible = true) {
    if (this._debugVisualsGroup) {
      this._debugVisualsGroup.visible = visible;
    }
  }

  override dispose() {
    this.disposed = true;
    this.activeClients.clear();
    disposeObjectChildren(this);
    this.clear(); // Unlinks children so needs to come last

    for (const backendPromise of this._detectorBackends.values()) {
      void backendPromise
        .then((backend) => backend.dispose?.())
        .catch(() => {});
    }
    this._detectorBackends.clear();
  }
}
