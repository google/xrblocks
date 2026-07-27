import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {WorldOptions} from '../WorldOptions';
import {SegmentationMask} from './SegmentationMask';

/**
 * Context provided to a segmentation backend: shared world config plus access
 * to the device camera for capturing frames.
 */
export interface SegmenterBackendContext {
  readonly options: WorldOptions;
  readonly deviceCamera: XRDeviceCamera;
}

/**
 * Abstract base for segmentation backends (e.g. MediaPipe).
 *
 * `run()` is a Template Method: it checks availability, grabs a camera frame,
 * then defers to the concrete `segment()` hook. Unlike pose/object detection
 * there is no depth or world-space step, the result is a 2D mask.
 */
export abstract class BaseSegmenterBackend {
  constructor(protected context: SegmenterBackendContext) {}

  /**
   * Runs one segmentation pass. Returns `null` when the backend is not ready
   * or no camera frame is available.
   */
  async run(): Promise<SegmentationMask | null> {
    if (!(await this.isAvailable())) {
      return null;
    }
    const snapshot = await this.getSnapshot();
    if (!snapshot) {
      return null;
    }
    return this.segment(snapshot);
  }

  /** Whether the backend is loaded and ready to run inference. */
  protected abstract isAvailable(): Promise<boolean>;

  /** Acquires a camera frame to segment, or `null` if unavailable. */
  protected abstract getSnapshot(): Promise<{imageData: ImageData} | null>;

  /** Runs the model on a frame and maps it to a {@link SegmentationMask}. */
  protected abstract segment(snapshot: {
    imageData: ImageData;
  }): Promise<SegmentationMask | null>;

  dispose() {}
}
