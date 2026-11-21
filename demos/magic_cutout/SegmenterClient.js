export const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
export const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';

const SELF_CHECK_SIZE = 16;

export class SegmenterClient {
  constructor(runtimeLoader = loadMediaPipeRuntime) {
    this.runtimeLoader = runtimeLoader;
    this.runtime = null;
    this.vision = null;
    this.segmenter = null;
    this.delegate = null;
    this.fallbackReason = '';
    this.loadMs = 0;
    this.warmupMs = 0;
    this.disposed = false;
    this.activeOperations = 0;
    this.canvas = null;
    this.ctx = null;
  }

  async init() {
    const start = performance.now();
    this.runtime = await this.trackOperation(() => this.runtimeLoader());
    this.ensureActive();

    this.vision = await this.trackOperation(() =>
      this.runtime.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL)
    );
    this.ensureActive();

    try {
      await this.createAndWarmup('GPU');
    } catch (error) {
      if (this.disposed) throw error;
      this.fallbackReason = `GPU delegate unavailable: ${messageFor(error)}`;
      await this.createAndWarmup('CPU');
    }

    this.ensureActive();
    this.loadMs = Math.round(performance.now() - start);
  }

  async createAndWarmup(delegate) {
    this.ensureActive();
    this.closeSegmenter();
    const segmenter = await this.trackOperation(() =>
      this.runtime.InteractiveSegmenter.createFromOptions(this.vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate,
        },
        outputCategoryMask: true,
        outputConfidenceMasks: true,
      })
    );
    if (this.disposed) {
      segmenter.close?.();
      throw new Error('SegmenterClient disposed');
    }
    this.segmenter = segmenter;
    this.delegate = delegate;

    const warmupStart = performance.now();
    try {
      const checkInput = this.createSelfCheckInput();
      const result = await this.trackOperation(() =>
        this.runSegmentOnSource(checkInput, {u: 0.5, v: 0.5})
      );
      this.ensureActive();
      const hasCategory = (result.categoryMask?.data?.length ?? 0) > 0;
      const hasConfidence = result.confidenceMasks.some(
        (mask) => mask.data.length > 0
      );
      if (!hasCategory && !hasConfidence) {
        throw new Error(`${delegate} self-check returned empty masks`);
      }
      this.warmupMs = Math.round(performance.now() - warmupStart);
    } catch (error) {
      this.closeSegmenter();
      throw error;
    }
  }

  async segmentAt(imageData, point = {u: 0.5, v: 0.5}) {
    this.ensureActive();
    if (!this.segmenter) {
      throw new Error('SegmenterClient is not initialized');
    }
    const source = this.imageDataToSource(imageData);
    const start = performance.now();
    const masks = await this.trackOperation(() =>
      this.runSegmentOnSource(source, point)
    );
    this.ensureActive();
    return {
      ...masks,
      ms: Math.round(performance.now() - start),
      delegate: this.delegate,
    };
  }

  runSegmentOnSource(source, point) {
    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        this.segmenter.segment(
          source,
          {keypoint: {x: point.u, y: point.v}},
          (result) => {
            try {
              const copied = copyAndCloseResult(result);
              settled = true;
              resolve(copied);
            } catch (error) {
              settled = true;
              reject(error);
            }
          }
        );
      } catch (error) {
        if (!settled) {
          reject(error);
        }
      }
    });
  }

  imageDataToSource(imageData) {
    if (typeof document === 'undefined') {
      return imageData;
    }
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
    if (!this.ctx) {
      return imageData;
    }
    if (
      this.canvas.width !== imageData.width ||
      this.canvas.height !== imageData.height
    ) {
      this.canvas.width = imageData.width;
      this.canvas.height = imageData.height;
    }
    if (typeof ImageData !== 'undefined' && imageData instanceof ImageData) {
      this.ctx.putImageData(imageData, 0, 0);
    } else {
      const target = this.ctx.createImageData(
        imageData.width,
        imageData.height
      );
      target.data.set(imageData.data);
      this.ctx.putImageData(target, 0, 0);
    }
    return this.canvas;
  }

  createSelfCheckInput() {
    const data = new Uint8ClampedArray(SELF_CHECK_SIZE * SELF_CHECK_SIZE * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128;
      data[i + 1] = 128;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
    return this.imageDataToSource({
      data,
      width: SELF_CHECK_SIZE,
      height: SELF_CHECK_SIZE,
    });
  }

  ensureActive() {
    if (this.disposed) {
      throw new Error('SegmenterClient disposed');
    }
  }

  async trackOperation(callback) {
    this.activeOperations++;
    try {
      return await callback();
    } finally {
      this.activeOperations--;
      this.cleanupIfIdle();
    }
  }

  dispose() {
    this.disposed = true;
    this.cleanupIfIdle();
  }

  closeSegmenter() {
    if (this.segmenter) {
      this.segmenter.close?.();
      this.segmenter = null;
    }
  }

  cleanupIfIdle() {
    if (!this.disposed || this.activeOperations > 0) return;
    this.closeSegmenter();
    this.vision = null;
  }
}

function copyAndCloseResult(result) {
  try {
    let categoryMask = null;
    if (result?.categoryMask) {
      categoryMask = {
        width: result.categoryMask.width,
        height: result.categoryMask.height,
        data: new Uint8Array(result.categoryMask.getAsUint8Array()),
      };
    }

    const confidenceMasks = [];
    if (Array.isArray(result?.confidenceMasks)) {
      for (const mask of result.confidenceMasks) {
        if (!mask) continue;
        confidenceMasks.push({
          width: mask.width,
          height: mask.height,
          data: new Float32Array(mask.getAsFloat32Array()),
        });
      }
    }

    return {categoryMask, confidenceMasks};
  } finally {
    // InteractiveSegmenterResult.close() frees every underlying MPMask once.
    if (typeof result?.close === 'function') {
      result.close();
    } else {
      result?.categoryMask?.close?.();
      if (Array.isArray(result?.confidenceMasks)) {
        for (const mask of result.confidenceMasks) {
          mask?.close?.();
        }
      }
    }
  }
}

async function loadMediaPipeRuntime() {
  const specifier = '@mediapipe/tasks-vision';
  return await import(/* @vite-ignore */ specifier);
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}
