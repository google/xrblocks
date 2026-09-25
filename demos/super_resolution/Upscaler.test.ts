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

function tensorOutput(data: Float32Array) {
  return {
    data: vi.fn().mockResolvedValue(data),
    delete: vi.fn(),
  };
}

function makeCompiledModel(outputs: Float32Array[]) {
  return {
    getInputDetails: () => [{shape: [1, 1, 1, 3]}],
    getOutputDetails: () => [{shape: [1, 3, 4, 4]}],
    run: vi.fn(async () => [
      tensorOutput(outputs.shift() ?? new Float32Array(48).fill(0.25)),
    ]),
    delete: vi.fn(),
  };
}

function makeRuntimeForModels(
  models: ReturnType<typeof makeCompiledModel>[],
  webgpu = true
) {
  const runtime = {
    Tensor: FakeTensor,
    isWebGPUSupported: vi.fn(() => webgpu),
    loadLiteRt: vi.fn(async () => ({loadAndCompile})),
    unloadLiteRt: vi.fn(),
  };
  const loadAndCompile = vi.fn(async () => models.shift());
  return {runtime, loadAndCompile};
}

describe('Upscaler self-check output validation', () => {
  it('falls back to WASM when WebGPU self-check returns all zeros', async () => {
    const webgpu = makeCompiledModel([
      new Float32Array(48),
      new Float32Array(48),
    ]);
    const wasm = makeCompiledModel([
      new Float32Array(48).fill(0.25),
      new Float32Array(48).fill(0.25),
    ]);
    const {runtime, loadAndCompile} = makeRuntimeForModels([webgpu, wasm]);
    const upscaler = new Upscaler(async () => runtime);

    await upscaler.init();

    expect(upscaler.backend).toBe('wasm');
    expect(upscaler.fallbackReason).toContain('all zeros');
    expect(
      loadAndCompile.mock.calls.map(([, options]) => options.accelerator)
    ).toEqual(['webgpu', 'wasm']);
  });

  it.each([
    ['empty', new Float32Array()],
    ['zero', new Float32Array(48)],
  ])('throws when WASM self-check returns %s output', async (_name, output) => {
    const wasm = makeCompiledModel([output, output]);
    const {runtime} = makeRuntimeForModels([wasm], false);
    const upscaler = new Upscaler(async () => runtime);

    await expect(upscaler.init()).rejects.toThrow(/self-check returned/);
  });
});
