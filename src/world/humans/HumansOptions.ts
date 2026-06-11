import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial} from '../../utils/Types';

/**
 * Configuration options for the Human Pose Detection system.
 */
export class HumansOptions {
  enabled = false;

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
