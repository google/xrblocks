import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial} from '../../utils/Types';

/**
 * Configuration options for the ObjectDetector.
 */
export class ObjectsOptions {
  debugging = false;
  enabled = false;
  showDebugVisualizations = false;

  /**
   * Margin to add when cropping the object image, as a percentage of image
   * size.
   */
  objectImageMargin = 0.05;

  /**
   * Configuration for the detection backends.
   */
  backendConfig = {
    /** The active backend to use for detection. */
    activeBackend: 'gemini' as 'gemini' | 'mediapipe',
    gemini: {
      systemInstruction:
          `Please provide me with the bounding box coordinates for the primary objects in the given image, prioritizing objects that are nearby. For each bounding box, include ymin, xmin, ymax, and xmax. These coordinates should be absolute values ranging from 0 to 1000, corresponding to the image as if it were resized to 1000x1000 pixels. The origin (xmin:0; ymin:0) is the top-left corner of the image, and (xmax:1000; ymax:1000) is the bottom-right corner. List a maximum of 5 objects. Ignore hands and other human body parts, as well as any UI elements attached to them (e.g., a blue circle attached to a finger).`,
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          required: ['objectName', 'ymin', 'xmin', 'ymax', 'xmax'],
          properties: {
            objectName: {type: 'STRING'},
            ymin: {type: 'NUMBER'},
            xmin: {type: 'NUMBER'},
            ymax: {type: 'NUMBER'},
            xmax: {type: 'NUMBER'},
          },
        },
      },
    },
    /** Placeholder for a future MediaPipe backend configuration. */
    mediapipe: {},
  };


  constructor(options?: DeepPartial<ObjectsOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  /**
   * Enables the object detector.
   */
  enable() {
    this.enabled = true;
    return this;
  }
}
