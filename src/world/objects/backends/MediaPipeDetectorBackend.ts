import type * as MEDIAPIPE from '@mediapipe/tasks-vision';
import {
  BaseDetectorBackend,
  DetectorBackendContext,
} from '../ObjectDetectorBackend';
import {CameraSnapshot, NormalizedDetectedObject} from '../ObjectDetector';

let FilesetResolver: typeof MEDIAPIPE.FilesetResolver | undefined;
let ObjectDetector: typeof MEDIAPIPE.ObjectDetector | undefined;

// --- Attempt Dynamic Import ---
async function loadMediaPipeModule() {
  if (FilesetResolver && ObjectDetector) {
    return;
  }
  try {
    const mediapipeModule = await import('@mediapipe/tasks-vision');
    FilesetResolver = mediapipeModule.FilesetResolver;
    ObjectDetector = mediapipeModule.ObjectDetector;
    console.log("'@mediapipe/tasks-vision' module loaded successfully.");
  } catch (error) {
    console.error('Failed to load MediaPipe module:', error);
    throw error;
  }
}

/**
 * Object detector backend implementation using MediaPipe's Object Detector.
 * Runs locally on the device.
 *
 * T - The type of additional data associated with the detected object (not used currently).
 */
export class MediaPipeDetectorBackend<T> extends BaseDetectorBackend<T> {
  private objectDetector: MEDIAPIPE.ObjectDetector | null = null;
  private initializationPromise: Promise<void>;

  constructor(context: DetectorBackendContext) {
    super(context);
    this.initializationPromise = this.tryInitializeObjectDetector();
  }

  protected async isAvailable(): Promise<boolean> {
    try {
      await this.initializationPromise;
      return true;
    } catch (e) {
      console.error('MediaPipe Object Detector is not available:', e);
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

  protected async detect(
    snapshot: CameraSnapshot
  ): Promise<NormalizedDetectedObject<T>[]> {
    await this.initializationPromise;

    if (!this.objectDetector) return [];

    const backendResponse = this.objectDetector.detect(snapshot.imageData!);
    if (!backendResponse) return [];

    const width = snapshot.imageData!.width;
    const height = snapshot.imageData!.height;

    return this.normalizeDetections(backendResponse, width, height);
  }

  private normalizeDetections(
    backendResponse: MEDIAPIPE.ObjectDetectorResult,
    width: number,
    height: number
  ): NormalizedDetectedObject<T>[] {
    // Map MediaPipe detections to NormalizedDetectedObject format.
    // We normalize the bounding box coordinates by the image dimensions.
    return backendResponse.detections.reduce<NormalizedDetectedObject<T>[]>(
      (acc: NormalizedDetectedObject<T>[], detection: MEDIAPIPE.Detection) => {
        const box = detection.boundingBox;
        if (box) {
          const category = detection.categories?.[0];
          const objectName =
            category?.categoryName || category?.displayName || 'unknown';
          acc.push({
            ymin: box.originY / height,
            xmin: box.originX / width,
            ymax: (box.originY + box.height) / height,
            xmax: (box.originX + box.width) / width,
            objectName: objectName,
          });
        }
        return acc;
      },
      []
    );
  }

  /**
   * Initializes the MediaPipe Object Detector if it has not already been initialized.
   * Loads the fileset resolver for vision tasks and creates the detector instance
   * with the configured model asset path and score threshold.
   */
  private async tryInitializeObjectDetector(): Promise<void> {
    if (this.objectDetector) return;

    await loadMediaPipeModule();

    const mediapipeOptions =
      this.context.options.objects.backendConfig.mediapipe;
    const vision = await FilesetResolver!.forVisionTasks(
      mediapipeOptions.wasmFilesUrl
    );
    this.objectDetector = await ObjectDetector!.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: mediapipeOptions.modelAssetPath,
      },
      scoreThreshold: mediapipeOptions.scoreThreshold,
    });
  }
}
