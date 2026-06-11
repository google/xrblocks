import * as THREE from 'three';
import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {CameraParametersSnapshot} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {WorldOptions} from '../WorldOptions';
import {DetectedBodyPose} from './DetectedBodyPose';

export interface HumanBackendContext {
  readonly options: WorldOptions;
  readonly ai?: AI;
  readonly aiOptions?: AIOptions;
  readonly deviceCamera: XRDeviceCamera;
}

export abstract class BaseHumanBackend {
  constructor(protected context: HumanBackendContext) {}

  /**
   * The orchestration pipeline (Template Method) for running human detection.
   * Checks backend availability and obtains a camera snapshot before running the concrete detection model.
   */
  async run(
    depthMeshSnapshot: THREE.Mesh,
    cameraParametersSnapshot: CameraParametersSnapshot
  ): Promise<DetectedBodyPose[]> {
    if (!(await this.isAvailable())) {
      return [];
    }

    const snapshot = await this.getSnapshot();
    if (!snapshot) {
      return [];
    }

    return this.detect(snapshot, depthMeshSnapshot, cameraParametersSnapshot);
  }

  protected abstract isAvailable(): Promise<boolean>;
  protected abstract getSnapshot(): Promise<{imageData: ImageData} | null>;

  /**
   * Abstract hook implemented by subclasses to perform the actual model inference and landmark extraction.
   */
  protected abstract detect(
    snapshot: {imageData: ImageData},
    depthMeshSnapshot: THREE.Mesh,
    cameraParametersSnapshot: CameraParametersSnapshot
  ): Promise<DetectedBodyPose[]>;
}
