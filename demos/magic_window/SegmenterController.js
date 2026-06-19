import {FilesetResolver, ImageSegmenter} from '@mediapipe/tasks-vision';

const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';

// Multiclass selfie segmentation: 0=background, 1=hair, 2=body-skin,
// 3=face-skin, 4=clothes, 5=others/accessories. Anything non-zero is a
// person, which is what we keep when compositing onto a backdrop.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/' +
  'selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

export const SegmentCategory = {
  Background: 0,
  Hair: 1,
  BodySkin: 2,
  FaceSkin: 3,
  Clothes: 4,
  Others: 5,
};

/**
 * Thin wrapper around the MediaPipe ImageSegmenter. Lazy-loads the WASM
 * fileset + model on first use and runs a single-image segmentation, handing
 * back the raw per-pixel category indices. Kept demo-local for now; this is
 * the seed of a future `world/segmentation` add-on.
 */
export class SegmenterController {
  constructor() {
    this.segmenter_ = null;
    this.loading_ = null;
  }

  /** True once the model is ready to segment. */
  get isReady() {
    return this.segmenter_ != null;
  }

  /**
   * Loads the WASM runtime + model. Safe to call repeatedly; concurrent calls
   * share one in-flight promise.
   * @returns {Promise<boolean>} resolves true on success, false on failure.
   */
  async load() {
    if (this.segmenter_) {
      return true;
    }
    if (!this.loading_) {
      this.loading_ = (async () => {
        const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
        this.segmenter_ = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {modelAssetPath: MODEL_URL, delegate: 'GPU'},
          runningMode: 'IMAGE',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        return true;
      })().catch((error) => {
        console.warn('[magic_window] segmenter failed to load', error);
        this.loading_ = null;
        return false;
      });
    }
    return this.loading_;
  }

  /**
   * Segments a single frame.
   * @param {CanvasImageSource} image - Canvas / video / image to segment.
   * @returns {{data: Uint8Array, width: number, height: number} | null}
   *     The per-pixel category indices, or null if not ready.
   */
  segment(image) {
    if (!this.segmenter_) {
      return null;
    }
    let out = null;
    this.segmenter_.segment(image, (result) => {
      const mask = result.categoryMask;
      if (mask) {
        // Copy out before close() frees the underlying buffer.
        out = {
          data: new Uint8Array(mask.getAsUint8Array()),
          width: mask.width,
          height: mask.height,
        };
        mask.close();
      }
    });
    return out;
  }

  dispose() {
    this.segmenter_?.close?.();
    this.segmenter_ = null;
    this.loading_ = null;
  }
}
