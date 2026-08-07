import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial} from '../../utils/Types';

/**
 * Configuration options for the Human Pose Detection system.
 */
export class HumansOptions {
  enabled = false;

  /**
   * Minimum delay in milliseconds between continuous pose detection runs.
   * A value of 0 runs again as soon as the previous detection finishes.
   */
  pollingIntervalMs = 0;

  /**
   * Project each landmark onto the depth mesh to find its world position.
   *
   * This is what you want when the people being detected are physically in
   * front of you, since the ray lands on their actual body. Turn it off when
   * the camera is showing someone who is not part of the depth scene, such as a
   * webcam feed on the desktop simulator: every ray would then hit the
   * surrounding geometry instead and the skeleton would be smeared across it.
   * With projection off, landmarks are placed along the view ray at a fixed
   * distance, which keeps the body correctly proportioned.
   */
  useDepthProjection = true;

  /**
   * Configuration options for the active pose detection backend.
   */
  backendConfig = {
    activeBackend: 'mediapipe',
    mediapipe: {
      wasmFilesUrl:
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
      /**
       * Run inference in a web worker so a detection pass does not stall the
       * render loop. The worker is limited to the CPU delegate because
       * MediaPipe only creates a GPU surface for a real DOM canvas, so set
       * this to false to trade a blocked main thread for GPU inference.
       * Falls back to the main thread automatically when workers are
       * unavailable.
       */
      useWorker: true,
      /**
       * The maximum number of simultaneous human poses/bodies to track.
       */
      numPoses: 1,
      /**
       * The minimum confidence score [0.0, 1.0] required for a pose to be detected.
       */
      minPoseDetectionConfidence: 0.5,
      /**
       * The minimum confidence score [0.0, 1.0] required to confirm a pose is still present.
       */
      minPosePresenceConfidence: 0.5,
      /**
       * The minimum confidence score [0.0, 1.0] required for tracking landmarks between frames.
       */
      minTrackingConfidence: 0.5,
    },
  };

  constructor(options?: DeepPartial<HumansOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  enable() {
    this.enabled = true;
    return this;
  }
}
