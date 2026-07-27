import * as THREE from 'three';
import {CameraParametersSnapshot} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {WorldOptions} from '../WorldOptions';
import {DetectedBodyPose} from './DetectedBodyPose';

/**
 * Context provided to the human pose detection backend.
 * Contains shared dependencies and configuration options necessary for the backend
 * to run pose detection, acquire camera snapshots, and map coordinates.
 */
export interface HumanBackendContext {
  /**
   * The global world configuration options, containing settings for backends, thresholds, etc.
   */
  readonly options: WorldOptions;
  /**
   * Access to the XR device's camera for capturing snapshots of the physical environment.
   */
  readonly deviceCamera: XRDeviceCamera;
}

/**
 * Abstract base class for all human pose detection backends (e.g., MediaPipe).
 *
 * Implements a Template Method pattern via `run()`, which orchestrates the
 * detection pipeline by checking availability, acquiring a camera snapshot,
 * and calling the abstract `detect()` hook implemented by specific backends.
 */
export abstract class BaseHumanBackend {
  /**
   * Creates an instance of BaseHumanBackend.
   * @param context - The shared dependency and configuration context.
   */
  constructor(protected context: HumanBackendContext) {}

  /**
   * The orchestration pipeline (Template Method) for running human detection.
   * Checks backend availability and obtains a camera snapshot before running the concrete detection model.
   *
   * @param depthMeshSnapshot - The current 3D depth mesh snapshot of the physical environment.
   * @param cameraParametersSnapshot - The current camera parameters and matrix transforms.
   * @returns A promise that resolves to an array of detected body poses.
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

  /**
   * Checks whether this pose detection backend is fully loaded, initialized,
   * and available to perform inference.
   *
   * @returns A promise resolving to `true` if available, otherwise `false`.
   */
  protected abstract isAvailable(): Promise<boolean>;

  /**
   * Acquires a snapshot image from the device camera to use for pose detection.
   *
   * @returns A promise resolving to the camera image data snapshot, or `null` if unavailable.
   */
  protected abstract getSnapshot(): Promise<{imageData: ImageData} | null>;

  /**
   * Abstract hook implemented by subclasses to perform the actual model inference and landmark extraction.
   *
   * @param snapshot - The camera image data snapshot.
   * @param depthMeshSnapshot - The current 3D depth mesh snapshot of the physical environment.
   * @param cameraParametersSnapshot - The current camera parameters and matrix transforms.
   * @returns A promise resolving to the list of detected body poses.
   */
  protected abstract detect(
    snapshot: {imageData: ImageData},
    depthMeshSnapshot: THREE.Mesh,
    cameraParametersSnapshot: CameraParametersSnapshot
  ): Promise<DetectedBodyPose[]>;

  dispose() {}
}
