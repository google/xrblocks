import * as THREE from 'three';
import {getCameraParametersSnapshot} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Script} from '../../core/Script';
import {Depth} from '../../depth/Depth';
import {WorldOptions} from '../WorldOptions';
import {DetectedBodyPose} from './DetectedBodyPose';
import {BaseHumanBackend, HumanBackendContext} from './HumanDetectorBackend';
import {MediaPipeHumanBackend} from './backends/MediaPipeHumanBackend';

/**
 * A detector script that orchestrates human body pose estimation.
 * Manages the backend pose detector lifecycle (e.g., MediaPipe) and exposes the detected
 * poses, including 3D joint landmarks, in the world coordinate space.
 */
export class HumanRecognizer extends Script {
  static dependencies = {
    options: WorldOptions,
    deviceCamera: XRDeviceCamera,
    depth: Depth,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
  };

  private detectorBackends = new Map<string, Promise<BaseHumanBackend>>();
  private activeClients = new Set<object>();
  private currentDetectionPromise: Promise<DetectedBodyPose[]> | null = null;

  /**
   * The latest detected body poses.
   */
  public poses: DetectedBodyPose[] = [];

  // Injected dependencies
  private options!: WorldOptions;
  private deviceCamera!: XRDeviceCamera;
  private depth!: Depth;
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
  }

  /**
   * Starts continuous pose detection for the given client.
   * If this is the first client, starts the background detection loop.
   * @param client - The client object requesting pose detection.
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
   * Stops continuous pose detection for the given client.
   * If this was the last client, stops the background detection loop.
   * @param client - The client object that no longer needs pose detection.
   */
  stop(client: object): void {
    this.activeClients.delete(client);
  }

  /**
   * Called per frame by the engine. If there are active clients,
   * ensures the continuous pose detection is running.
   */
  override update() {
    if (this.activeClients.size > 0 && !this.currentDetectionPromise) {
      this.runContinuousDetection();
    }
  }

  private runContinuousDetection() {
    this.currentDetectionPromise = this.runDetectionInternal()
      .then((results) => {
        this.poses = results;
        return results;
      })
      .finally(() => {
        this.currentDetectionPromise = null;
      });
  }

  /**
   * Runs a pose detection or returns the ongoing detection promise.
   *
   * - If continuous detection is started (has active clients), returns the promise
   *   for the next detection result.
   * - If continuous detection is not started, performs a one-off detection and
   *   returns the result. If a one-off detection is already in progress, returns
   *   the promise for that ongoing detection.
   *
   * @returns A promise resolving to the next body pose detection result.
   */
  runDetection(): Promise<DetectedBodyPose[]> {
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

  private async runDetectionInternal(): Promise<DetectedBodyPose[]> {
    this.clear();

    if (!this.depth || !this.depth.depthMesh) {
      console.warn(
        'Cannot run Human Detection: Depth module / depthMesh is not enabled or initialized.'
      );
      return [];
    }

    const depthMeshSnapshot = this.getDepthMeshSnapshot();
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
    const activeBackend = this.options.humans.backendConfig.activeBackend;
    const backendPromise = this.getOrCreateBackend(activeBackend, context);

    let backend: BaseHumanBackend;
    try {
      backend = await backendPromise;
    } catch (error: unknown) {
      console.warn(
        `Failed to load or initialize HumanRecognizer backend '${activeBackend}':`,
        error
      );
      return [];
    }

    const bodyPoses = await backend.run(
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    return bodyPoses;
  }

  private getBackendContext(): HumanBackendContext {
    return {
      options: this.options,
      deviceCamera: this.deviceCamera,
    };
  }

  private getOrCreateBackend(
    activeBackend: string,
    context: HumanBackendContext
  ): Promise<BaseHumanBackend> {
    let backendPromise = this.detectorBackends.get(activeBackend);

    if (!backendPromise) {
      backendPromise = (async () => {
        switch (activeBackend) {
          case 'mediapipe':
            return new MediaPipeHumanBackend(context);
          default:
            throw new Error(
              `HumanRecognizer backend '${activeBackend}' is not supported.`
            );
        }
      })();
      this.detectorBackends.set(activeBackend, backendPromise);
    }
    return backendPromise;
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
}
