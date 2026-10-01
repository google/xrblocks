import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => {
  class FakeTensor {
    deleted = false;
    constructor(
      readonly data_: unknown,
      readonly shape?: number[]
    ) {}
    static fromTypedArray(data: unknown, shape?: number[]) {
      const tensor = new FakeTensor(data, shape);
      created.push(tensor);
      return tensor;
    }
    async data() {
      return this.data_;
    }
    delete() {
      this.deleted = true;
    }
  }
  const created: FakeTensor[] = [];
  return {
    created,
    FakeTensor,
    loadAndCompile: vi.fn(),
  };
});

vi.mock('@litertjs/core', () => ({
  Tensor: mocks.FakeTensor,
  loadAndCompile: mocks.loadAndCompile,
}));

import {compileModel, runModel} from './compileModel';

const bytes = new Uint8Array([1, 2, 3]);

describe('compileModel', () => {
  beforeEach(() => {
    mocks.loadAndCompile.mockReset();
  });

  it('compiles for the requested accelerator', async () => {
    const model = {id: 'gpu'};
    mocks.loadAndCompile.mockResolvedValue(model);
    const handle = await compileModel(bytes, {accelerator: 'webgpu'});
    expect(handle).toEqual({model, accelerator: 'webgpu'});
    expect(mocks.loadAndCompile).toHaveBeenCalledWith(bytes, {
      accelerator: 'webgpu',
    });
  });

  it('only forwards cpuOptions to a wasm compile', async () => {
    mocks.loadAndCompile.mockResolvedValue({});
    await compileModel(bytes, {
      accelerator: 'wasm',
      cpuOptions: {numThreads: 4},
    });
    expect(mocks.loadAndCompile).toHaveBeenCalledWith(bytes, {
      accelerator: 'wasm',
      cpuOptions: {numThreads: 4},
    });
  });

  it('falls back to wasm when WebGPU fails and reports the cause', async () => {
    const failure = new Error('device lost');
    const model = {id: 'cpu'};
    mocks.loadAndCompile
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(model);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handle = await compileModel(bytes, {
      accelerator: 'webgpu',
      cpuOptions: {numThreads: 2},
    });

    expect(handle).toEqual({
      model,
      accelerator: 'wasm',
      fallbackError: failure,
    });
    expect(mocks.loadAndCompile).toHaveBeenNthCalledWith(2, bytes, {
      accelerator: 'wasm',
      cpuOptions: {numThreads: 2},
    });
  });

  it('rethrows when fallback is disabled or wasm itself fails', async () => {
    mocks.loadAndCompile.mockRejectedValue(new Error('bad graph'));
    await expect(
      compileModel(bytes, {accelerator: 'webgpu', fallbackToWasm: false})
    ).rejects.toThrow('bad graph');
    await expect(compileModel(bytes, {accelerator: 'wasm'})).rejects.toThrow(
      'bad graph'
    );
  });
});

describe('runModel', () => {
  beforeEach(() => {
    mocks.created.length = 0;
  });

  it('wraps inputs, reads outputs and deletes every tensor', async () => {
    const outputs = [
      new mocks.FakeTensor(new Float32Array([1, 2])),
      new mocks.FakeTensor(new Float32Array([3])),
    ];
    const model = {run: vi.fn().mockResolvedValue(outputs)};

    const buffers = await runModel(model as never, [
      {data: new Float32Array([0.5]), shape: [1, 1]},
      {data: new Int32Array([7]), shape: [1]},
    ]);

    expect(buffers).toEqual([new Float32Array([1, 2]), new Float32Array([3])]);
    expect(mocks.created.map((t) => t.shape)).toEqual([[1, 1], [1]]);
    expect(model.run).toHaveBeenCalledWith(mocks.created);
    for (const tensor of [...mocks.created, ...outputs]) {
      expect(tensor.deleted).toBe(true);
    }
  });

  it('deletes the inputs when the run throws', async () => {
    const model = {run: vi.fn().mockRejectedValue(new Error('oom'))};
    await expect(
      runModel(model as never, [{data: new Float32Array(1), shape: [1]}])
    ).rejects.toThrow('oom');
    expect(mocks.created).toHaveLength(1);
    expect(mocks.created[0].deleted).toBe(true);
  });
});
