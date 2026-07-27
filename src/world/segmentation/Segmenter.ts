import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Script} from '../../core/Script';
import {WorldOptions} from '../WorldOptions';
import {SegmentationMask} from './SegmentationMask';
import {
  BaseSegmenterBackend,
  SegmenterBackendContext,
} from './SegmenterBackend';
import {MediaPipeSegmenterBackend} from './backends/MediaPipeSegmenterBackend';

/**
 * A Script that runs semantic segmentation on the device camera feed and
 * returns a per-pixel category mask ({@link SegmentationMask}).
 *
 * Mirrors `HumanRecognizer` / `ObjectDetector`, but without any depth or
 * world-space step, segmentation is a pure 2D camera-to-mask operation, so it
 * does not depend on the depth mesh or camera intrinsics.
 *
 * Multiple concurrent calls to {@link runSegmentation} within the same async
 * cycle are coalesced: only one MediaPipe inference is dispatched per cycle
 * and its result is shared with all callers. The latest completed mask is also
 * available synchronously via {@link latestMask}.
 */
export class Segmenter extends Script {
  static dependencies = {
    options: WorldOptions,
    deviceCamera: XRDeviceCamera,
  };

  private _backends = new Map<string, Promise<BaseSegmenterBackend>>();

  /** The result of the most recently completed segmentation pass. */
  private _latestMask: SegmentationMask | null = null;

  /**
   * The inference currently in progress, shared among all concurrent callers
   * so MediaPipe is not invoked more than once per cycle.
   */
  private _inferenceInFlight: Promise<SegmentationMask | null> | null = null;

  /**
   * Timestamp (ms) of the most recent inference kick-off. Initialised to
   * `Number.NEGATIVE_INFINITY` so the first `update()` tick fires immediately.
   */
  private _lastRunMs = Number.NEGATIVE_INFINITY;
  private _disposed = false;

  private options!: WorldOptions;
  private deviceCamera!: XRDeviceCamera;

  init({
    options,
    deviceCamera,
  }: {
    options: WorldOptions;
    deviceCamera: XRDeviceCamera;
  }) {
    this.options = options;
    this.deviceCamera = deviceCamera;
    this._disposed = false;
  }

  /**
   * The latest cached segmentation mask from the most recently completed
   * inference pass. Returns `null` until the first inference finishes.
   */
  get latestMask(): SegmentationMask | null {
    return this._latestMask;
  }

  /**
   * Continuous throttled loop driven by the engine frame tick.
   *
   * Called every frame by `ScriptsManager` (via `Core.update → scriptsManager.update`).
   * Kicks off a fresh inference pass at most once per
   * `options.segmentation.pollingIntervalMs` milliseconds. The in-flight guard
   * prevents stacking: if a previous inference is still running the tick is
   * silently skipped rather than launching a second one.
   *
   * After each completed inference {@link latestMask} is updated so all
   * consumers in the same frame read the same cached result without each
   * triggering their own MediaPipe run.
   *
   * @param time - Current timestamp in milliseconds, forwarded from the
   *   engine frame loop.
   */
  override update(time: number) {
    if (this._disposed) return;
    if (this._inferenceInFlight) return;
    if (time - this._lastRunMs < this.options.segmentation.pollingIntervalMs)
      return;
    this._lastRunMs = time;
    void this.runSegmentation();
  }

  /**
   * Runs one segmentation pass over the current camera frame, or returns the
   * result of the in-flight pass when one is already running. Multiple callers
   * in the same async cycle share a single MediaPipe inference rather than
   * each triggering their own.
   *
   * Under normal usage consumers should poll {@link latestMask} (kept fresh
   * by the automatic loop) rather than calling this directly.
   *
   * @returns The mask, or `null` if the backend or camera frame is not ready.
   */
  async runSegmentation(): Promise<SegmentationMask | null> {
    if (this._disposed) {
      return null;
    }
    if (this._inferenceInFlight) {
      return this._inferenceInFlight;
    }

    this._inferenceInFlight = this._runInference().then((mask) => {
      if (!this._disposed) {
        this._latestMask = mask;
      }
      this._inferenceInFlight = null;
      return mask;
    });

    return this._inferenceInFlight;
  }

  private async _runInference(): Promise<SegmentationMask | null> {
    const activeBackend = this.options.segmentation.backendConfig.activeBackend;
    const backendPromise = this.getOrCreateBackend(activeBackend);

    let backend: BaseSegmenterBackend;
    try {
      backend = await backendPromise;
    } catch (error: unknown) {
      console.warn(
        `Failed to load or initialize Segmenter backend '${activeBackend}':`,
        error
      );
      return null;
    }

    return backend.run();
  }

  private getBackendContext(): SegmenterBackendContext {
    return {
      options: this.options,
      deviceCamera: this.deviceCamera,
    };
  }

  private getOrCreateBackend(
    activeBackend: string
  ): Promise<BaseSegmenterBackend> {
    let backendPromise = this._backends.get(activeBackend);

    if (!backendPromise) {
      const context = this.getBackendContext();
      backendPromise = (async () => {
        switch (activeBackend) {
          case 'mediapipe':
            return new MediaPipeSegmenterBackend(context);
          default:
            throw new Error(
              `Segmenter backend '${activeBackend}' is not supported.`
            );
        }
      })();
      this._backends.set(activeBackend, backendPromise);
    }
    return backendPromise;
  }

  override dispose() {
    this._disposed = true;
    this._latestMask = null;
    this._inferenceInFlight = null;
    for (const backendPromise of this._backends.values()) {
      void backendPromise
        .then((backend) => backend.dispose?.())
        .catch(() => {});
    }
    this._backends.clear();
  }
}
