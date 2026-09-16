// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';
import {createSamRuntime, supportsSamDevice} from './SamRuntime.js';
import {createSamClient} from './SamClient.js';

const fp16Bytes = 4096 * 4096 * 12 * 2;
const fp32Bytes = fp16Bytes * 2;
const snapshot = {width: 4, height: 2, data: new Uint8ClampedArray(32)};
const candidate = {device: 'wasm', dtype: 'fp32'};
const box2d = {min: {x: 0.25, y: 0}, max: {x: 0.75, y: 1}};

function adapter(binding = fp32Bytes, buffer = fp32Bytes, f16 = true) {
  const device = {
    features: new Set(f16 ? ['shader-f16'] : []),
    limits: {maxStorageBufferBindingSize: binding, maxBufferSize: buffer},
    lost: new Promise(() => {}),
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(async () => null),
    queue: {onSubmittedWorkDone: vi.fn(async () => {})},
    destroy: vi.fn(),
  };
  return {
    features: device.features,
    limits: device.limits,
    requestDevice: vi.fn(async () => device),
    device,
  };
}

function harness(gpu?) {
  const image_inputs = {
    original_sizes: [[2, 4]],
    reshaped_input_sizes: [[512, 1024]],
  };
  const proc = Object.assign(
    vi.fn(async () => image_inputs),
    {
      post_process_masks: vi.fn(async () => [
        {
          dims: [1, 3, 2, 4],
          data: new Uint8Array([
            1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1,
            0,
          ]),
        },
      ]),
    }
  );
  const model = Object.assign(
    vi.fn(async () => ({
      pred_masks: {},
      iou_scores: {data: [1, 0.4, 0.9]},
    })),
    {
      get_image_embeddings: vi.fn(async () => ({image_embeddings: {}})),
      dispose: vi.fn(async () => {}),
    }
  );
  const transformers = {
    env: {
      backends: {
        onnx: {
          webgpu: {
            get device() {
              return undefined;
            },
          },
          wasm: {},
        },
      },
    },
    RawImage: class {
      constructor(
        public data,
        public width,
        public height,
        public channels
      ) {}
    },
    AutoProcessor: {from_pretrained: vi.fn(async () => proc)},
    SamModel: {
      from_pretrained: vi.fn(async () => {
        const webgpu = transformers.env.backends.onnx.webgpu;
        if (webgpu.adapter) {
          // The pinned ORT runtime owns device creation and publishes a
          // readonly device after consuming the supplied adapter.
          Object.defineProperty(webgpu, 'adapter', {
            value: webgpu.adapter,
            writable: false,
            configurable: false,
          });
          Object.defineProperty(webgpu, 'device', {
            value: await webgpu.adapter.requestDevice(),
            writable: false,
            configurable: false,
          });
        }
        return model;
      }),
    },
  };
  const runtime = createSamRuntime({transformers, gpu});
  const encode = (stateId = 1, selected = candidate) =>
    runtime.encode({snapshot, stateId, candidate: selected});
  return {runtime, encode, transformers, model, proc};
}

function loopbackWorker(runtime) {
  const worker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage: (message) => {
      runtime[message.type](message).then(
        (result) =>
          worker.onmessage({
            data: {id: message.id, result},
          }),
        (error) =>
          worker.onmessage({
            data: {
              id: message.id,
              error: error.message,
              disposed: true,
            },
          })
      );
    },
  };
  return worker;
}

describe('SAM execution capacity', () => {
  it.each([
    [128 * 1024 ** 2, fp32Bytes, true, false, false],
    [fp16Bytes - 1, fp32Bytes, true, false, false],
    [fp32Bytes, fp16Bytes - 1, true, false, false],
    [fp16Bytes, fp16Bytes, true, true, false],
    [fp32Bytes - 1, fp32Bytes, true, true, false],
    [fp32Bytes, fp32Bytes - 1, true, true, false],
    [fp32Bytes, fp32Bytes, false, false, true],
    [fp32Bytes, fp32Bytes, true, true, true],
  ])(
    'gates both limits (%s, %s), f16=%s',
    (binding, buffer, f16, half, full) => {
      const executionAdapter = adapter(binding, buffer, f16);
      expect(supportsSamDevice(executionAdapter, 'fp16')).toBe(half);
      expect(supportsSamDevice(executionAdapter, 'fp32')).toBe(full);
    }
  );

  it('supplies the checked adapter before ORT creates its readonly execution device', async () => {
    const executionAdapter = adapter();
    const gpu = {requestAdapter: vi.fn(async () => executionAdapter)};
    const h = harness(gpu);
    await h.encode(1, {device: 'webgpu', dtype: 'fp16'});
    expect(gpu.requestAdapter).toHaveBeenCalledExactlyOnceWith({
      powerPreference: 'high-performance',
    });
    expect(executionAdapter.requestDevice).toHaveBeenCalledOnce();
    expect(h.transformers.env.backends.onnx.webgpu.adapter).toBe(
      executionAdapter
    );
    expect(h.transformers.env.backends.onnx.webgpu.device).toBe(
      executionAdapter.device
    );
    expect(h.transformers.env.backends.onnx.debug).toBe(true);
    expect(h.transformers.env.backends.onnx.wasm).toEqual({
      wasmPaths:
        'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/',
      proxy: false,
      numThreads: 1,
    });
    expect(h.transformers.SamModel.from_pretrained).toHaveBeenCalledWith(
      'Xenova/slimsam-77-uniform',
      {device: 'webgpu', dtype: 'fp16'}
    );
    expect(executionAdapter.device.popErrorScope).toHaveBeenCalled();
  });

  it.each([null, 'rejected', 'undersized'])(
    'never loads a GPU model for an unavailable adapter: %s',
    async (mode) => {
      const gpu = {
        requestAdapter: vi.fn(async () => {
          if (mode === 'rejected') throw new Error('adapter rejected');
          return mode === 'undersized' ? adapter(fp16Bytes - 1) : null;
        }),
      };
      const h = harness(gpu);
      await expect(
        h.encode(1, {device: 'webgpu', dtype: 'fp16'})
      ).rejects.toThrow();
      expect(
        h.transformers.AutoProcessor.from_pretrained
      ).not.toHaveBeenCalled();
      expect(h.transformers.SamModel.from_pretrained).not.toHaveBeenCalled();
    }
  );

  it('checks the returned execution device limits, not only adapter limits', async () => {
    const executionAdapter = adapter();
    const undersizedDevice = adapter(fp16Bytes - 1).device;
    executionAdapter.requestDevice.mockResolvedValue(undersizedDevice);
    const h = harness({requestAdapter: async () => executionAdapter});
    await expect(
      h.encode(1, {device: 'webgpu', dtype: 'fp16'})
    ).rejects.toThrow('execution device');
    expect(h.transformers.SamModel.from_pretrained).toHaveBeenCalledOnce();
    expect(h.model.dispose).toHaveBeenCalledOnce();
    expect(undersizedDevice.destroy).toHaveBeenCalledOnce();
  });

  it.each(['missing', 'null', 'rejected'])(
    'reaches a functioning WASM worker for a %s adapter',
    async (mode) => {
      const gpu =
        mode === 'missing'
          ? undefined
          : {
              requestAdapter: async () => {
                if (mode === 'rejected') throw new Error('adapter rejected');
                return null;
              },
            };
      const attempts = [];
      const client = createSamClient({
        logger: {warn: vi.fn(), info: vi.fn()},
        createWorker: () => {
          const h = harness(gpu);
          attempts.push(h);
          return loopbackWorker(h.runtime);
        },
      });
      const state = await client.encodeSnapshot(snapshot);
      const mask = await client.maskFromBbox(state, box2d);
      expect(attempts).toHaveLength(3);
      for (const attempt of attempts.slice(0, 2)) {
        expect(
          attempt.transformers.SamModel.from_pretrained
        ).not.toHaveBeenCalled();
      }
      expect(
        attempts[2].transformers.SamModel.from_pretrained
      ).toHaveBeenCalledWith('Xenova/slimsam-77-uniform', candidate);
      expect(mask.getAsUint8Array()).toEqual(
        new Uint8Array([255, 255, 0, 255, 255, 255, 0, 255])
      );
      await client.dispose();
      expect(attempts[2].model.dispose).toHaveBeenCalledOnce();
    }
  );
});

describe('SAM worker runtime lifecycle', () => {
  it('does not cache a constructed model whose first real encoder run fails', async () => {
    const attempts = [];
    const workers = [];
    const logger = {warn: vi.fn(), info: vi.fn()};
    const client = createSamClient({
      logger,
      createWorker: () => {
        const h = harness({requestAdapter: async () => adapter()});
        if (attempts.length === 0) {
          h.model.get_image_embeddings.mockRejectedValue(
            new Error('first encoder execution failed')
          );
        }
        attempts.push(h);
        const worker = loopbackWorker(h.runtime);
        workers.push(worker);
        return worker;
      },
    });
    await client.encodeSnapshot(snapshot);
    expect(attempts).toHaveLength(2);
    expect(
      attempts[0].transformers.SamModel.from_pretrained
    ).toHaveResolvedWith(attempts[0].model);
    expect(attempts[0].model.get_image_embeddings).toHaveBeenCalledOnce();
    expect(attempts[0].model.dispose).toHaveBeenCalledOnce();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      '[objects_3d] SAM ready on webgpu/fp32'
    );
    await client.encodeSnapshot(snapshot);
    expect(attempts).toHaveLength(2);
    expect(
      attempts[1].transformers.SamModel.from_pretrained
    ).toHaveBeenCalledOnce();
    expect(attempts[1].model.get_image_embeddings).toHaveBeenCalledTimes(2);
    await client.dispose();
  });

  it('loads the processor once before model creation, not per snapshot', async () => {
    const h = harness();
    await h.encode();
    await h.encode(2);
    expect(h.transformers.AutoProcessor.from_pretrained).toHaveBeenCalledOnce();
    expect(h.transformers.SamModel.from_pretrained).toHaveBeenCalledOnce();
    expect(
      h.transformers.AutoProcessor.from_pretrained.mock.invocationCallOrder[0]
    ).toBeLessThan(
      h.transformers.SamModel.from_pretrained.mock.invocationCallOrder[0]
    );
    expect(h.model.get_image_embeddings).toHaveBeenCalledTimes(2);
  });

  it('never creates a model when processor loading rejects', async () => {
    const h = harness();
    h.transformers.AutoProcessor.from_pretrained.mockRejectedValue(
      new Error('processor unavailable')
    );
    await expect(h.encode()).rejects.toThrow('processor unavailable');
    expect(h.transformers.SamModel.from_pretrained).not.toHaveBeenCalled();
  });

  it('destroys a published ORT device after model construction rejects', async () => {
    const executionAdapter = adapter();
    const h = harness({requestAdapter: async () => executionAdapter});
    h.transformers.SamModel.from_pretrained.mockImplementation(async () => {
      Object.defineProperty(h.transformers.env.backends.onnx.webgpu, 'device', {
        value: executionAdapter.device,
        writable: false,
        configurable: false,
      });
      throw new Error('decoder session initialization failed');
    });
    await expect(
      h.encode(1, {device: 'webgpu', dtype: 'fp16'})
    ).rejects.toThrow('decoder session initialization failed');
    await h.runtime.dispose();
    expect(executionAdapter.device.destroy).toHaveBeenCalledOnce();
  });

  it('awaits disposal on initial encoder failure and never publishes a state', async () => {
    const h = harness();
    let finishDisposal;
    h.model.dispose.mockImplementation(
      () => new Promise((resolve) => (finishDisposal = resolve))
    );
    h.model.get_image_embeddings.mockRejectedValue(new Error('encoder failed'));
    let settled = false;
    const result = h.encode().catch((error) => {
      settled = true;
      return error;
    });
    await vi.waitFor(() => expect(h.model.dispose).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    finishDisposal();
    expect((await result).message).toBe('encoder failed');
    await expect(h.runtime.mask({stateId: 1, box2d})).rejects.toThrow();
  });

  it('preserves point coordinates, containment/IoU channel choice and mask convention', async () => {
    const h = harness();
    await h.encode();
    const mask = await h.runtime.mask({stateId: 1, box2d});
    expect(h.proc.mock.calls[1][1]).toEqual({
      input_points: [
        [
          [
            [2, 1],
            [1, 0],
            [3, 2],
          ],
        ],
      ],
      input_labels: [[[1, 2, 3]]],
    });
    expect(mask).toEqual({
      width: 4,
      height: 2,
      data: new Uint8Array([255, 255, 0, 255, 255, 255, 0, 255]),
    });
  });

  it('passes the cached embedding tensor pair directly to the decoder', async () => {
    const h = harness();
    const embeddings = {
      image_embeddings: {data: new Float32Array([1])},
      image_positional_embeddings: {data: new Float32Array([2])},
    };
    h.model.get_image_embeddings.mockResolvedValue(embeddings);
    await h.encode();
    await h.runtime.mask({stateId: 1, box2d});
    expect(h.model.mock.calls[0][0].image_embeddings).toBe(
      embeddings.image_embeddings
    );
    expect(h.model.mock.calls[0][0].image_positional_embeddings).toBe(
      embeddings.image_positional_embeddings
    );
    expect(h.model.get_image_embeddings).toHaveBeenCalledOnce();
  });

  it('rejects stale embedding IDs instead of decoding the wrong snapshot', async () => {
    const h = harness();
    await h.encode(2);
    await expect(h.runtime.mask({stateId: 1, box2d})).rejects.toThrow(
      'snapshot'
    );
    expect(h.model).not.toHaveBeenCalled();
  });

  it.each(['validation', 'device loss'])(
    'rejects GPU %s even when the encoder resolves',
    async (mode) => {
      const executionAdapter = adapter();
      const h = harness({requestAdapter: async () => executionAdapter});
      if (mode === 'validation') {
        executionAdapter.device.popErrorScope.mockResolvedValueOnce({
          message: 'invalid attention dispatch',
        });
      } else {
        executionAdapter.device.lost = Promise.resolve({
          message: 'device removed',
        });
      }
      await expect(
        h.encode(1, {device: 'webgpu', dtype: 'fp16'})
      ).rejects.toThrow();
      expect(executionAdapter.device.destroy).toHaveBeenCalledOnce();
    }
  );

  it('awaits model disposal when a completed GPU encode has validation errors', async () => {
    const executionAdapter = adapter();
    const h = harness({requestAdapter: async () => executionAdapter});
    executionAdapter.device.popErrorScope.mockResolvedValueOnce({
      message: 'invalid attention dispatch',
    });
    await expect(
      h.encode(1, {device: 'webgpu', dtype: 'fp16'})
    ).rejects.toThrow('invalid attention dispatch');
    expect(h.model.get_image_embeddings).toHaveBeenCalledOnce();
    expect(h.model.dispose).toHaveBeenCalledOnce();
  });

  it('rejects loss during inference and disposes the fully initialized model', async () => {
    const executionAdapter = adapter();
    let loseDevice;
    executionAdapter.device.lost = new Promise(
      (resolve) => (loseDevice = resolve)
    );
    const h = harness({requestAdapter: async () => executionAdapter});
    h.model.get_image_embeddings.mockImplementation(async () => {
      loseDevice({message: 'device removed during encode'});
      return {image_embeddings: {}};
    });
    await expect(
      h.encode(1, {device: 'webgpu', dtype: 'fp16'})
    ).rejects.toThrow('device removed during encode');
    expect(h.model.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the initialized model on decoder failure', async () => {
    const h = harness();
    await h.encode();
    h.model.mockRejectedValue(new Error('decoder failed'));
    await expect(h.runtime.mask({stateId: 1, box2d})).rejects.toThrow(
      'decoder failed'
    );
    expect(h.model.dispose).toHaveBeenCalledOnce();
  });
});
