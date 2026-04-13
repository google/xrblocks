import * as MEDIAPIPE from '@mediapipe/tasks-vision';
import {
  BaseDetectorBackend,
  CameraSnapshot,
  NormalizedDetectedObject,
} from '../ObjectDetector';

/**
 * Object detector backend implementation using MediaPipe's Object Detector.
 * Runs locally on the device.
 *
 * T - The type of additional data associated with the detected object (not used currently).
 */
export class MediaPipeDetectorBackend<T> extends BaseDetectorBackend<T> {
  private objectDetector: MEDIAPIPE.ObjectDetector | null = null;

  protected isAvailable(): boolean {
    return true;
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
    await this.tryInitializeObjectDetector();

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

    const mediapipeOptions =
      this.context.options.objects.backendConfig.mediapipe;
    const vision = await MEDIAPIPE.FilesetResolver.forVisionTasks(
      mediapipeOptions.wasmFilesUrl
    );
    this.objectDetector = await MEDIAPIPE.ObjectDetector.createFromOptions(
      vision,
      {
        baseOptions: {
          modelAssetPath: mediapipeOptions.modelAssetPath,
        },
        scoreThreshold: mediapipeOptions.scoreThreshold,
      }
    );
  }
}
