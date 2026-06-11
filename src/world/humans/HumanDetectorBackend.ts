import * as THREE from 'three';
import type * as MEDIAPIPE from '@mediapipe/tasks-vision';
import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {
  CameraParametersSnapshot,
  transformRgbUvToWorld,
} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {WorldOptions} from '../WorldOptions';
import {DetectedBodyPose, PoseLandmark} from './DetectedBodyPose';

export interface HumanBackendContext {
  readonly options: WorldOptions;
  readonly ai?: AI;
  readonly aiOptions?: AIOptions;
  readonly deviceCamera: XRDeviceCamera;
}

export abstract class BaseHumanBackend {
  public lastDebugStatus = 'Initialized';
  constructor(protected context: HumanBackendContext) {}

  abstract run(
    depthMeshSnapshot: THREE.Mesh,
    cameraParametersSnapshot: CameraParametersSnapshot
  ): Promise<DetectedBodyPose[]>;

  protected abstract isAvailable(): Promise<boolean>;
}

let FilesetResolver: typeof MEDIAPIPE.FilesetResolver | undefined;
let PoseLandmarker: typeof MEDIAPIPE.PoseLandmarker | undefined;

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

export class MediaPipeHumanBackend extends BaseHumanBackend {
  private poseLandmarker: MEDIAPIPE.PoseLandmarker | null = null;
  private initializationPromise: Promise<void>;

  constructor(context: HumanBackendContext) {
    super(context);
    this.initializationPromise = this.tryInitializePoseLandmarker();
  }

  protected async isAvailable(): Promise<boolean> {
    try {
      await this.initializationPromise;
      return true;
    } catch (e) {
      console.error('MediaPipe Pose Landmarker is not available:', e);
      return false;
    }
  }

  protected async getSnapshot(): Promise<{imageData: ImageData} | null> {
    const imageData = await this.context.deviceCamera.getSnapshot({
      outputFormat: 'imageData',
    });
    if (!imageData) return null;
    return {imageData};
  }

  async run(
    depthMeshSnapshot: THREE.Mesh,
    cameraParametersSnapshot: CameraParametersSnapshot
  ): Promise<DetectedBodyPose[]> {
    if (!(await this.isAvailable())) {
      this.lastDebugStatus =
        '[Backend]: PoseLandmarker failed to load (Check WASM/Model URL)';
      return [];
    }

    const snapshot = await this.getSnapshot();
    if (!snapshot) {
      this.lastDebugStatus =
        '[Backend]: DeviceCamera snapshot capture returned null';
      return [];
    }

    await this.initializationPromise;
    if (!this.poseLandmarker) {
      this.lastDebugStatus = '[Backend]: PoseLandmarker instance is null';
      return [];
    }

    let result: MEDIAPIPE.PoseLandmarkerResult;
    try {
      result = this.poseLandmarker.detect(snapshot.imageData);
    } catch (error: unknown) {
      this.lastDebugStatus = `[Backend]: detect() error: ${error instanceof Error ? error.message : String(error)}`;
      console.error('MediaPipe Pose detection run failed:', error);
      return [];
    }

    if (!result || !result.landmarks || result.landmarks.length === 0) {
      this.lastDebugStatus =
        '[Backend]: Snapshot analyzed successfully (0 persons detected)';
      return [];
    }

    this.lastDebugStatus = `[Backend]: Success: Detected ${result.landmarks.length} person(s)`;

    const detectedPoses: DetectedBodyPose[] = [];

    // Process each detected person
    for (let i = 0; i < result.landmarks.length; i++) {
      const mpLandmarks = result.landmarks[i];
      const mpWorldLandmarks = result.worldLandmarks?.[i] || [];
      const score = result.segmentationMasks ? 1.0 : 0.8; // default confidence indicator

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
        const worldCoords = transformRgbUvToWorld(
          uv,
          depthMeshSnapshot,
          cameraParametersSnapshot
        );

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

      const bodyPose = new DetectedBodyPose(i, landmarks, boundingBox, score);

      detectedPoses.push(bodyPose);
    }

    return detectedPoses;
  }

  private async tryInitializePoseLandmarker(): Promise<void> {
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
      numPoses: 4, // track up to 4 people
    });
  }
}
