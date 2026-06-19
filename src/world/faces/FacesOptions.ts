import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial} from '../../utils/Types';

/**
 * Configuration options for the Face Landmark Detection system.
 */
export class FacesOptions {
  enabled = false;

  /**
   * Configuration options for the active face detection backend.
   */
  backendConfig = {
    activeBackend: 'mediapipe',
    mediapipe: {
      wasmFilesUrl:
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
      /**
       * The maximum number of simultaneous faces to track.
       */
      numFaces: 1,
      /**
       * The minimum confidence score [0.0, 1.0] required for a face to be
       * detected.
       */
      minFaceDetectionConfidence: 0.5,
      /**
       * The minimum confidence score [0.0, 1.0] required to confirm a face is
       * still present.
       */
      minFacePresenceConfidence: 0.5,
      /**
       * The minimum confidence score [0.0, 1.0] required for tracking
       * landmarks between frames.
       */
      minTrackingConfidence: 0.5,
      /**
       * Whether to compute and emit per-face blendshape weights (52
       * ARKit-compatible categories). Required for facial expression
       * mirroring, lipsync feeds, and avatar animation.
       */
      outputFaceBlendshapes: true,
      /**
       * Whether to compute and emit the 4x4 facial transformation matrix
       * for each face. Provides a stable rigid head pose for parenting
       * objects to the head (glasses, masks, hats).
       */
      outputFacialTransformationMatrixes: true,
    },
  };

  constructor(options?: DeepPartial<FacesOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  enable() {
    this.enabled = true;
    return this;
  }
}
