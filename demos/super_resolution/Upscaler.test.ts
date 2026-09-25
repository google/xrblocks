import {describe, expect, it, vi} from 'vitest';

import {Upscaler} from './Upscaler.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

class FakeTensor {
  static deletes = 0;
  constructor(
    readonly data: Float32Array,
    readonly shape: number[]
  ) {}

  delete() {
    FakeTensor.deletes++;
  }
}

function makeUpscaler() {
  const runtime = {
    Tensor: FakeTensor,
    isWebGPUSupported: vi.fn(() => true),
    loadLiteRt: vi.fn(),
    unloadLiteRt: vi.fn(),
  };
  const upscaler = new Upscaler(async () => runtime);
  upscaler.runtime = runtime;
  upscaler.liteRt = {loadAndCompile: vi.fn()};
  upscaler.inputShape = [1, 128, 128, 3];
  upscaler.outputShape = [1, 3, 512, 512];
  upscaler.backend = 'webgpu';
  upscaler.layout = 'nchw';
  upscaler.tileSize = 128;
  upscaler.scale = 4;
  return {upscaler, runtime};
}

describe('Upscaler disposal', () => {
  it('defers model deletion and LiteRT unload while inference is pending', async () => {
    const {upscaler, runtime} = makeUpscaler();
    const run =
      deferred<Array<{data(): Promise<Float32Array>; delete(): void}>>();
    const model = {
      run: vi.fn(() => run.promise),
      delete: vi.fn(),
    };
    upscaler.model = model;

    const pending = upscaler.runTile(new Float32Array(128 * 128 * 3));
    upscaler.dispose();

    expect(model.delete).not.toHaveBeenCalled();
    expect(runtime.unloadLiteRt).not.toHaveBeenCalled();

    run.resolve([
      {
        data: vi.fn().mockResolvedValue(new Float32Array(3 * 512 * 512)),
        delete: vi.fn(),
      },
    ]);

    await expect(pending).rejects.toThrow('Upscaler disposed');
    expect(model.delete).toHaveBeenCalledTimes(1);
    expect(runtime.unloadLiteRt).toHaveBeenCalledTimes(1);
  });

  it('cleans up only once across repeated dispose calls', () => {
    const {upscaler, runtime} = makeUpscaler();
    const model = {delete: vi.fn()};
    upscaler.model = model;

    upscaler.dispose();
    upscaler.dispose();

    expect(model.delete).toHaveBeenCalledTimes(1);
    expect(runtime.unloadLiteRt).toHaveBeenCalledTimes(1);
  });
});
