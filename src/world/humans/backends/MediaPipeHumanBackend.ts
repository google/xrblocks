import * as THREE from 'three';
import type * as MEDIAPIPE from '@mediapipe/tasks-vision';
import {
  CameraParametersSnapshot,
  transformRgbUvToWorld,
} from '../../../camera/CameraUtils';
import {DetectedBodyPose, PoseLandmark} from '../DetectedBodyPose';
import {BaseHumanBackend, HumanBackendContext} from '../HumanDetectorBackend';
import {
  MEDIAPIPE_MODULE_URL,
  MediaPipeVisionWorkerClient,
} from '../../shared/MediaPipeVisionWorker';

let FilesetResolver: typeof MEDIAPIPE.FilesetResolver | undefined;
let PoseLandmarker: typeof MEDIAPIPE.PoseLandmarker | undefined;

// --- Attempt Dynamic Import ---
async function loadMediaPipeModule() {
  if (FilesetResolver && PoseLandmarker) {
    return;
  }
  try {
    const mediapipeModule = await import('@mediapipe/tasks-vision');
    FilesetResolver = mediapipeModule.FilesetResolver;
    PoseLandmarker = mediapipeModule.PoseLandmarker;
    console.log(
      "'@mediapipe/tasks-vision' MediaPipe Pose Module loaded successfully."
    );
  } catch (error) {
    console.error('Failed to load MediaPipe Tasks Vision module:', error);
    throw error;
  }
}

/**
 * Convert a raw MediaPipe `PoseLandmarkerResult` into `DetectedBodyPose`
 * objects with world-space joint positions.
 *
 * Extracted as a free function so unit tests can drive it directly without
 * standing up the full backend lifecycle, and because this work has to stay on
 * the render thread: it reads the live depth mesh and camera matrices.
 *
 * For each landmark a depth-mesh raycast (`transformRgbUvToWorld`) is tried
 * first; when the ray misses, the point is back-projected through the camera
 * frustum and placed ~1.5 m out, modulated by the landmark's relative z.
 *
 * Pass `useDepthProjection: false` when the detected person is not part of the
 * depth scene, such as a webcam feed on the desktop simulator. Every ray would
 * otherwise hit the surrounding geometry and stretch the skeleton across it.
 *
 * @param result - Raw result from the MediaPipe pose task.
 * @param depthMeshSnapshot - Depth mesh to raycast against.
 * @param cameraParametersSnapshot - Camera matrices for back-projection.
 * @param options - Projection behaviour.
 * @returns One `DetectedBodyPose` per person in the result.
 */
export function processPoseLandmarkerResult(
  result: MEDIAPIPE.PoseLandmarkerResult,
  depthMeshSnapshot: THREE.Mesh,
  cameraParametersSnapshot: CameraParametersSnapshot,
  {useDepthProjection = true}: {useDepthProjection?: boolean} = {}
): DetectedBodyPose[] {
  const detectedPoses: DetectedBodyPose[] = [];

  // Process each detected person
  for (let i = 0; i < result.landmarks.length; i++) {
    const mpLandmarks = result.landmarks[i];
    const mpWorldLandmarks = result.worldLandmarks?.[i] || [];

    const landmarks: PoseLandmark[] = [];
    let xmin = 1;
    let ymin = 1;
    let xmax = 0;
    let ymax = 0;

    // Map landmarks and calculate bounding box in normalized screen space
    for (let j = 0; j < mpLandmarks.length; j++) {
      const lm = mpLandmarks[j];
      const wLm = mpWorldLandmarks[j];

      xmin = Math.min(xmin, lm.x);
      ymin = Math.min(ymin, lm.y);
      xmax = Math.max(xmax, lm.x);
      ymax = Math.max(ymax, lm.y);

      // Transform screen UV to WebXR World Position
      const uv = new THREE.Vector2(lm.x, lm.y);
      const worldCoords = useDepthProjection
        ? transformRgbUvToWorld(uv, depthMeshSnapshot, cameraParametersSnapshot)
        : null;

      let wp: THREE.Vector3 | undefined;
      if (worldCoords) {
        wp = worldCoords.worldPosition;
      } else {
        // Robust fallback estimation when physical depth mesh raycast misses
        const origin = new THREE.Vector3().applyMatrix4(
          cameraParametersSnapshot.worldFromView
        );
        const clipVec = new THREE.Vector3(
          2 * lm.x - 1,
          2 * (1.0 - lm.y) - 1,
          -1
        );
        const direction = clipVec
          .applyMatrix4(cameraParametersSnapshot.worldFromClip)
          .sub(origin)
          .normalize();
        wp = origin.addScaledVector(direction, 1.5 + (lm.z || 0));
      }

      landmarks.push({
        x: lm.x,
        y: lm.y,
        z: wLm ? wLm.z : lm.z,
        visibility: lm.visibility,
        worldPosition: wp,
      });
    }

    const boundingBox = new THREE.Box2(
      new THREE.Vector2(xmin, ymin),
      new THREE.Vector2(xmax, ymax)
    );

    const bodyPose = new DetectedBodyPose(i, landmarks, boundingBox);

    detectedPoses.push(bodyPose);
  }

  return detectedPoses;
}

/**
 * Human Pose detector backend implementation using MediaPipe's Pose Landmark
 * Detector. Runs locally on the device.
 *
 * Inference is offloaded to a web worker by default so a detection pass does
 * not stall the render loop. The worker has to use the CPU delegate, because
 * MediaPipe's wasm pipeline only creates a GPU surface when it finds a real
 * DOM canvas. Apps that would rather have GPU inference and can absorb the
 * main-thread stall can set `useWorker: false`; that is also the automatic
 * fallback when the environment has no `Worker` or the worker fails to start.
 */
export class MediaPipeHumanBackend extends BaseHumanBackend {
  private client: MediaPipeVisionWorkerClient | null = null;
  private poseLandmarker: MEDIAPIPE.PoseLandmarker | null = null;
  private initializationPromise: Promise<void>;

  constructor(context: HumanBackendContext) {
    super(context);
    this.initializationPromise = this.tryInitializePoseLandmarker();
  }

  protected override async isAvailable(): Promise<boolean> {
    try {
      await this.initializationPromise;
      return true;
    } catch (e) {
      console.error('MediaPipe Pose Landmarker is not available:', e);
      return false;
    }
  }

  protected override async getSnapshot(): Promise<{
    imageData: ImageData;
  } | null> {
    const imageData = await this.context.deviceCamera.getSnapshot({
      outputFormat: 'imageData',
    });
    if (!imageData) return null;
    return {imageData};
  }

  protected override async detect(
    snapshot: {imageData: ImageData},
    depthMeshSnapshot: THREE.Mesh,
    cameraParametersSnapshot: CameraParametersSnapshot
  ): Promise<DetectedBodyPose[]> {
    await this.initializationPromise;

    const result = this.client
      ? ((await this.client.detect(
          snapshot.imageData
        )) as MEDIAPIPE.PoseLandmarkerResult | null)
      : this.detectOnMainThread(snapshot.imageData);

    if (!result || !result.landmarks || result.landmarks.length === 0) {
      return [];
    }

    return processPoseLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot,
      {
        useDepthProjection:
          this.context.options.humans.useDepthProjection !== false,
      }
    );
  }

  private detectOnMainThread(
    imageData: ImageData
  ): MEDIAPIPE.PoseLandmarkerResult | null {
    if (!this.poseLandmarker) {
      return null;
    }
    try {
      return this.poseLandmarker.detect(imageData);
    } catch (error: unknown) {
      console.error('MediaPipe Pose detection run failed:', error);
      return null;
    }
  }

  private async tryInitializePoseLandmarker(): Promise<void> {
    const humansOptions = this.context.options.humans.backendConfig.mediapipe;

    if (
      humansOptions.useWorker &&
      MediaPipeVisionWorkerClient.isSupported() &&
      (await this.tryInitializeWorker())
    ) {
      return;
    }

    await this.initializeOnMainThread();
  }

  /**
   * @returns True when the worker is up and ready to serve detections.
   */
  private async tryInitializeWorker(): Promise<boolean> {
    const humansOptions = this.context.options.humans.backendConfig.mediapipe;
    const client = new MediaPipeVisionWorkerClient('MediaPipeHumanBackend');
    try {
      await client.init({
        mediapipeModuleUrl: MEDIAPIPE_MODULE_URL,
        wasmFilesUrl: humansOptions.wasmFilesUrl,
        taskName: 'PoseLandmarker',
        taskOptions: {
          baseOptions: {
            modelAssetPath: humansOptions.modelAssetPath,
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          numPoses: humansOptions.numPoses,
          minPoseDetectionConfidence: humansOptions.minPoseDetectionConfidence,
          minPosePresenceConfidence: humansOptions.minPosePresenceConfidence,
          minTrackingConfidence: humansOptions.minTrackingConfidence,
        },
      });
      this.client = client;
      return true;
    } catch (error: unknown) {
      // A worker failure must not take pose detection down with it, so fall
      // back to the main thread rather than reporting the backend unavailable.
      console.warn(
        'MediaPipe pose worker failed to start, falling back to main-thread inference:',
        error
      );
      client.dispose();
      return false;
    }
  }

  private async initializeOnMainThread(): Promise<void> {
    if (this.poseLandmarker) return;

    await loadMediaPipeModule();

    const humansOptions = this.context.options.humans.backendConfig.mediapipe;
    const vision = await FilesetResolver!.forVisionTasks(
      humansOptions.wasmFilesUrl
    );
    this.poseLandmarker = await PoseLandmarker!.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: humansOptions.modelAssetPath,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numPoses: humansOptions.numPoses,
      minPoseDetectionConfidence: humansOptions.minPoseDetectionConfidence,
      minPosePresenceConfidence: humansOptions.minPosePresenceConfidence,
      minTrackingConfidence: humansOptions.minTrackingConfidence,
    });
  }

  override dispose() {
    this.client?.dispose();
    this.client = null;
    this.poseLandmarker?.close();
    this.poseLandmarker = null;
  }
}
