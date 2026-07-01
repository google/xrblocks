import type * as MEDIAPIPE from '@mediapipe/tasks-vision';

import {SegmentationMask} from '../SegmentationMask';
import {
  BaseSegmenterBackend,
  SegmenterBackendContext,
} from '../SegmenterBackend';

let FilesetResolver: typeof MEDIAPIPE.FilesetResolver | undefined;
let ImageSegmenter: typeof MEDIAPIPE.ImageSegmenter | undefined;

// --- Attempt Dynamic Import ---
async function loadMediaPipeModule() {
  if (FilesetResolver && ImageSegmenter) {
    return;
  }
  try {
    const mediapipeModule = await import('@mediapipe/tasks-vision');
    FilesetResolver = mediapipeModule.FilesetResolver;
    ImageSegmenter = mediapipeModule.ImageSegmenter;
    console.log(
      "'@mediapipe/tasks-vision' MediaPipe Segmenter Module loaded successfully."
    );
  } catch (error) {
    console.error('Failed to load MediaPipe Tasks Vision module:', error);
    throw error;
  }
}

/**
 * The subset of the MediaPipe `MPMask` we read. Kept local so the mapping
 * helper can be unit-tested without the MediaPipe runtime.
 */
interface CategoryMask {
  getAsUint8Array(): Uint8Array;
  width: number;
  height: number;
  close(): void;
}

/**
 * Maps a MediaPipe category mask into a {@link SegmentationMask}. Copies the
 * buffer out before `close()` frees the underlying memory. Exported for tests.
 * @param mask - The MediaPipe category mask, or null/undefined if absent.
 * @returns The segmentation mask, or `null` when no mask was provided.
 */
export function categoryMaskToSegmentationMask(
  mask: CategoryMask | null | undefined
): SegmentationMask | null {
  if (!mask) {
    return null;
  }
  const result: SegmentationMask = {
    // Copy out before close() frees the underlying buffer.
    data: new Uint8Array(mask.getAsUint8Array()),
    width: mask.width,
    height: mask.height,
  };
  mask.close();
  return result;
}

/**
 * Segmentation backend backed by MediaPipe's `ImageSegmenter`. Runs locally on
 * the device using the configured selfie multiclass model.
 */
export class MediaPipeSegmenterBackend extends BaseSegmenterBackend {
  private imageSegmenter: MEDIAPIPE.ImageSegmenter | null = null;
  private initializationPromise: Promise<void>;

  constructor(context: SegmenterBackendContext) {
    super(context);
    this.initializationPromise = this.tryInitializeSegmenter();
  }

  private async tryInitializeSegmenter(): Promise<void> {
    await loadMediaPipeModule();
    const mediapipe = this.context.options.segmentation.backendConfig.mediapipe;
    const vision = await FilesetResolver!.forVisionTasks(
      mediapipe.wasmFilesUrl
    );
    this.imageSegmenter = await ImageSegmenter!.createFromOptions(vision, {
      baseOptions: {modelAssetPath: mediapipe.modelAssetPath, delegate: 'GPU'},
      runningMode: 'IMAGE',
      outputCategoryMask: mediapipe.outputCategoryMask,
      outputConfidenceMasks: false,
    });
  }

  protected override async isAvailable(): Promise<boolean> {
    try {
      await this.initializationPromise;
      return this.imageSegmenter !== null;
    } catch (e) {
      console.error('MediaPipe Image Segmenter is not available:', e);
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

  protected override async segment(snapshot: {
    imageData: ImageData;
  }): Promise<SegmentationMask | null> {
    await this.initializationPromise;
    if (!this.imageSegmenter) {
      return null;
    }
    // In IMAGE running mode segment() invokes the callback synchronously
    // before returning, so `out` is populated by the time we read it.
    let out: SegmentationMask | null = null;
    this.imageSegmenter.segment(snapshot.imageData, (result) => {
      out = categoryMaskToSegmentationMask(result.categoryMask);
    });
    return out;
  }
}
