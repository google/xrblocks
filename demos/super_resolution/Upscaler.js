import {detectLayout, upscaleImage} from './tiling.js';

export const LITERT_WASM_DIR =
  'https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.3/wasm/';
export const MODEL_URL =
  'https://huggingface.co/litert-community/real-esrgan-x4v3-litert/resolve/0a6fc35ba3e34e80b53f43089c1d2b612d33bea9/realesr_general_x4v3.tflite';
export const TILE_OVERLAP = 16;

const SELF_CHECK_EPSILON = 1e-2;

export class Upscaler {
  constructor(runtimeLoader = loadLiteRtRuntime) {
    this.runtimeLoader = runtimeLoader;
    this.runtime = null;
    this.liteRt = null;
    this.model = null;
    this.backend = null;
    this.fallbackReason = '';
    this.tileSize = 128;
    this.scale = 4;
    this.layout = 'nchw';
    this.inputShape = null;
    this.outputShape = null;
    this.loadMs = 0;
    this.warmupMs = 0;
    this.disposed = false;
    this.activeOperations = 0;
    this.unloaded = false;
  }

  async init() {
    const start = performance.now();
    this.runtime = await this.trackOperation(() => this.runtimeLoader());
    this.liteRt = await this.trackOperation(() =>
      this.runtime.loadLiteRt(LITERT_WASM_DIR, {
        threads: false,
        jspi: false,
      })
    );
    if (this.disposed) {
      this.cleanupIfIdle();
      throw new Error('Upscaler disposed');
    }

    const preferredBackend = this.runtime.isWebGPUSupported()
      ? 'webgpu'
      : 'wasm';
    try {
      await this.compile(preferredBackend);
    } catch (error) {
      if (preferredBackend === 'wasm' || this.disposed) throw error;
      this.fallbackReason = `WebGPU compile failed: ${messageFor(error)}`;
      await this.compile('wasm');
    }

    const warmupStart = performance.now();
    await this.runSelfCheckWithFallback();
    this.ensureActive();
    this.warmupMs = Math.round(performance.now() - warmupStart);
    this.loadMs = Math.round(performance.now() - start);
  }

  async compile(backend) {
    this.ensureActive();
    this.model?.delete();
    this.model = null;
    const model = await this.trackOperation(() =>
      this.liteRt.loadAndCompile(MODEL_URL, {
        accelerator: backend,
      })
    );
    if (this.disposed) {
      model.delete();
      throw new Error('Upscaler disposed');
    }
    this.model = model;
    this.backend = backend;
    const input = this.model.getInputDetails()[0];
    const output = this.model.getOutputDetails()[0];
    this.inputShape = Array.from(input.shape);
    this.outputShape = Array.from(output.shape);

    const inputLayout = detectLayout(this.inputShape);
    if (inputLayout !== 'nhwc') {
      throw new Error(
        `Expected NHWC model input, got ${this.inputShape.join('x')}`
      );
    }
    this.layout = detectLayout(this.outputShape);
    this.tileSize = this.inputShape[1];
    const outputTileSize =
      this.layout === 'nchw' ? this.outputShape[2] : this.outputShape[1];
    this.scale = outputTileSize / this.tileSize;
    if (!Number.isInteger(this.scale) || this.scale <= 0) {
      throw new Error(`Unsupported model scale: ${this.outputShape.join('x')}`);
    }
  }

  async runSelfCheckWithFallback() {
    let selfCheck;
    try {
      selfCheck = await this.runSelfCheck();
    } catch (error) {
      if (this.backend !== 'webgpu') throw error;
      selfCheck = {
        ok: false,
        reason: `${this.backendLabel()} self-check failed: ${messageFor(error)}`,
      };
    }

    if (!selfCheck.ok && this.backend === 'webgpu') {
      this.fallbackReason = selfCheck.reason;
      await this.compile('wasm');
      const wasmCheck = await this.runSelfCheck();
      if (!wasmCheck.ok) throw new Error(wasmCheck.reason);
    } else if (!selfCheck.ok) {
      throw new Error(selfCheck.reason);
    }
  }

  async runSelfCheck() {
    this.ensureActive();
    const tile = new Float32Array(this.tileSize * this.tileSize * 3);
    for (let i = 0; i < tile.length; i++) tile[i] = ((i * 13) % 251) / 250;
    const first = await this.runTile(tile);
    this.ensureActive();
    const second = await this.runTile(tile);
    this.ensureActive();
    const expectedLength = this.outputShape.reduce(
      (total, value) => total * value,
      1
    );
    if (
      first.length === 0 ||
      second.length === 0 ||
      first.length !== second.length ||
      first.length !== expectedLength
    ) {
      return {
        ok: false,
        reason: `${this.backendLabel()} self-check returned ${first.length} and ${second.length} values, expected ${expectedLength}`,
      };
    }

    let maxDiff = 0;
    let maxAbs = 0;
    for (let i = 0; i < first.length; i++) {
      const a = first[i];
      const b = second[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return {
          ok: false,
          reason: `${this.backendLabel()} self-check returned non-finite output`,
        };
      }
      maxDiff = Math.max(maxDiff, Math.abs(a - b));
      maxAbs = Math.max(maxAbs, Math.abs(a), Math.abs(b));
    }
    if (maxAbs === 0) {
      return {
        ok: false,
        reason: `${this.backendLabel()} self-check returned all zeros`,
      };
    }
    if (maxDiff > SELF_CHECK_EPSILON) {
      return {
        ok: false,
        reason: `${this.backendLabel()} self-check was unstable (max diff ${maxDiff.toFixed(3)})`,
      };
    }
    return {ok: true, reason: ''};
  }

  async upscale(image, onTile) {
    this.ensureActive();
    if (!this.model) throw new Error('Upscaler is not initialized');
    const start = performance.now();
    let tiles = 0;
    const result = await upscaleImage(image, {
      tileSize: this.tileSize,
      overlap: TILE_OVERLAP,
      scale: this.scale,
      layout: this.layout,
      runTile: (tile) => this.runTile(tile),
      onTile: (done, total) => {
        tiles = total;
        onTile?.(done, total);
      },
    });
    this.ensureActive();
    return {
      image: result,
      ms: Math.round(performance.now() - start),
      tiles,
      backend: this.backend,
    };
  }

  async runTile(tile) {
    this.ensureActive();
    return this.trackOperation(async () => {
      let input;
      let outputs;
      try {
        input = new this.runtime.Tensor(tile, this.inputShape);
        outputs = await this.model.run(input);
        this.ensureActive();
        const output = outputs[0];
        const data = await output.data();
        this.ensureActive();
        return new Float32Array(data);
      } finally {
        input?.delete();
        outputs?.forEach((output) => output.delete());
      }
    });
  }

  ensureActive() {
    if (this.disposed) throw new Error('Upscaler disposed');
  }

  backendLabel() {
    return this.backend === 'webgpu' ? 'WebGPU' : 'WASM';
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

  cleanupIfIdle() {
    if (!this.disposed || this.activeOperations > 0) return;
    this.model?.delete();
    this.model = null;
    if (this.liteRt && this.runtime && !this.unloaded) {
      this.liteRt = null;
      this.runtime.unloadLiteRt();
      this.unloaded = true;
    }
  }
}

async function loadLiteRtRuntime() {
  const specifier = '@litertjs/core';
  return await import(/* @vite-ignore */ specifier);
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}
