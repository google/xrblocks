import * as THREE from 'three';
import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {getCameraParametersSnapshot} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Script} from '../../core/Script';
import {Depth} from '../../depth/Depth';
import {WorldOptions} from '../WorldOptions';
import {DetectedBodyPose} from './DetectedBodyPose';
import {
  BaseHumanBackend,
  HumanBackendContext,
  MediaPipeHumanBackend,
} from './HumanDetectorBackend';

export class HumanRecognizer extends Script {
  static dependencies = {
    options: WorldOptions,
    deviceCamera: XRDeviceCamera,
    depth: Depth,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
  };

  public body_poses: DetectedBodyPose[] = [];
  public lastDebugString = 'Initializing...';
  private _detectorBackends = new Map<string, Promise<BaseHumanBackend>>();

  // Injected dependencies
  private options!: WorldOptions;
  private ai?: AI;
  private aiOptions?: AIOptions;
  private deviceCamera!: XRDeviceCamera;
  public depth!: Depth;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  targetDevice = 'galaxyxr';

  /**
   * Initializes the HumanRecognizer.
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
    ai?: AI;
    aiOptions?: AIOptions;
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
  }

  /**
   * Runs the human body pose detection process based on the configured backend.
   * Exposes the results on this.body_poses.
   */
  async runDetection(): Promise<DetectedBodyPose[]> {
    this.clear();

    if (!this.depth || !this.depth.depthMesh) {
      this.lastDebugString =
        '[Recognizer]: Depth module or depthMesh uninitialized.';
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

    const context = this.getBackendContext();
    const activeBackend = this.options.humans.backendConfig.activeBackend;
    const backendPromise = this.getOrCreateBackend(activeBackend, context);

    let backend: BaseHumanBackend;
    try {
      backend = await backendPromise;
    } catch (error: unknown) {
      this.lastDebugString = `[Recognizer]: Backend load failed: ${error instanceof Error ? error.message : String(error)}`;
      console.warn(
        `Failed to load or initialize HumanRecognizer backend '${activeBackend}':`,
        error
      );
      return [];
    }

    const poses = await backend.run(
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    this.lastDebugString = backend.lastDebugStatus;

    for (const pose of poses) {
      this.body_poses.push(pose);
      this.add(pose);
    }

    return this.body_poses;
  }

  private getBackendContext(): HumanBackendContext {
    return {
      options: this.options,
      ai: this.ai,
      aiOptions: this.aiOptions,
      deviceCamera: this.deviceCamera,
    };
  }

  private getOrCreateBackend(
    activeBackend: string,
    context: HumanBackendContext
  ): Promise<BaseHumanBackend> {
    let backendPromise = this._detectorBackends.get(activeBackend);

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
      this._detectorBackends.set(activeBackend, backendPromise);
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

  clear() {
    for (const pose of this.body_poses) {
      this.remove(pose);
    }
    this.body_poses = [];
    return this;
  }
}
