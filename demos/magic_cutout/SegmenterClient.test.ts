import {describe, expect, it, vi} from 'vitest';

import {
  MEDIAPIPE_WASM_URL,
  MODEL_URL,
  SegmenterClient,
} from './SegmenterClient.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function makeFakeMask<T extends Uint8Array | Float32Array>(
  data: T,
  width: number,
  height: number
) {
  const mask = {
    width,
    height,
    closed: false,
    getAsUint8Array: vi.fn(() => data),
    getAsFloat32Array: vi.fn(() => data),
    close: vi.fn(() => {
      mask.closed = true;
    }),
  };
  return mask;
}

function makeSegmentResult(width = 16, height = 16) {
  const categoryMask = makeFakeMask(
    new Uint8Array(width * height),
    width,
    height
  );
  const confidenceMask = makeFakeMask(
    new Float32Array(width * height).fill(0.9),
    width,
    height
  );
  const result = {
    categoryMask,
    confidenceMasks: [confidenceMask],
    closed: false,
    close: vi.fn(() => {
      result.closed = true;
      categoryMask.close();
      confidenceMask.close();
    }),
  };
  return {result, categoryMask, confidenceMask};
}

describe('SegmenterClient initialization and fallback', () => {
  it('initializes with GPU delegate when supported', async () => {
    const close = vi.fn();
    const segment = vi.fn(
      (
        _img: unknown,
        _roi: unknown,
        cb: (result: ReturnType<typeof makeSegmentResult>['result']) => void
      ) => {
        cb(makeSegmentResult().result);
      }
    );
    const createFromOptions = vi.fn(async () => ({segment, close}));
    const forVisionTasks = vi.fn(async () => ({wasm: true}));

    const client = new SegmenterClient(async () => ({
      FilesetResolver: {forVisionTasks},
      InteractiveSegmenter: {createFromOptions},
    }));

    await client.init();

    expect(forVisionTasks).toHaveBeenCalledWith(MEDIAPIPE_WASM_URL);
    expect(createFromOptions).toHaveBeenCalledTimes(1);
    expect(createFromOptions).toHaveBeenCalledWith(
      {wasm: true},
      expect.objectContaining({
        baseOptions: {modelAssetPath: MODEL_URL, delegate: 'GPU'},
      })
    );
    expect(client.delegate).toBe('GPU');
    expect(client.fallbackReason).toBe('');
  });

  it('falls back to CPU when GPU delegate creation fails', async () => {
    const cpuSegment = vi.fn(
      (
        _img: unknown,
        _roi: unknown,
        cb: (result: ReturnType<typeof makeSegmentResult>['result']) => void
      ) => {
        cb(makeSegmentResult().result);
      }
    );
    const createFromOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error('WebGL context lost'))
      .mockResolvedValueOnce({segment: cpuSegment, close: vi.fn()});

    const client = new SegmenterClient(async () => ({
      FilesetResolver: {forVisionTasks: vi.fn(async () => ({}))},
      InteractiveSegmenter: {createFromOptions},
    }));

    await client.init();

    expect(client.delegate).toBe('CPU');
    expect(client.fallbackReason).toContain('WebGL context lost');
    expect(createFromOptions).toHaveBeenCalledTimes(2);
    expect(createFromOptions.mock.calls[1]?.[1]).toMatchObject({
      baseOptions: {modelAssetPath: MODEL_URL, delegate: 'CPU'},
    });
  });

  it('falls back to CPU and closes GPU instance if GPU warmup throws', async () => {
    const gpuClose = vi.fn();
    const gpuSegment = vi.fn(() => {
      throw new Error('GPU shader compilation failed');
    });
    const cpuSegment = vi.fn(
      (
        _img: unknown,
        _roi: unknown,
        cb: (result: ReturnType<typeof makeSegmentResult>['result']) => void
      ) => {
        cb(makeSegmentResult().result);
      }
    );
    const createFromOptions = vi
      .fn()
      .mockResolvedValueOnce({segment: gpuSegment, close: gpuClose})
      .mockResolvedValueOnce({segment: cpuSegment, close: vi.fn()});

    const client = new SegmenterClient(async () => ({
      FilesetResolver: {forVisionTasks: vi.fn(async () => ({}))},
      InteractiveSegmenter: {createFromOptions},
    }));

    await client.init();

    expect(gpuClose).toHaveBeenCalledTimes(1);
    expect(client.delegate).toBe('CPU');
    expect(client.fallbackReason).toContain('GPU shader compilation failed');
  });
});

describe('SegmenterClient mask copying and disposal', () => {
  it('copies mask buffers out before closing MediaPipe masks once', async () => {
    const {result, categoryMask, confidenceMask} = makeSegmentResult(4, 4);
    categoryMask.getAsUint8Array.mockReturnValue(new Uint8Array(16).fill(0));
    confidenceMask.getAsFloat32Array.mockReturnValue(
      new Float32Array(16).fill(0.75)
    );

    const segment = vi.fn(
      (
        _img: unknown,
        _roi: unknown,
        cb: (r: ReturnType<typeof makeSegmentResult>['result']) => void
      ) => {
        cb(result);
      }
    );
    const client = new SegmenterClient(async () => ({
      FilesetResolver: {forVisionTasks: vi.fn(async () => ({}))},
      InteractiveSegmenter: {
        createFromOptions: vi.fn(async () => ({segment, close: vi.fn()})),
      },
    }));
    await client.init();

    const out = await client.segmentAt(
      {data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4},
      {u: 0.25, v: 0.75}
    );

    expect(result.close).toHaveBeenCalledTimes(2);
    expect(categoryMask.close).toHaveBeenCalledTimes(2);
    expect(confidenceMask.close).toHaveBeenCalledTimes(2);
    expect(out.categoryMask?.data).toBeInstanceOf(Uint8Array);
    expect(out.confidenceMasks[0]?.data[0]).toBeCloseTo(0.75);
  });

  it('defers closing segmenter while inference is active and is idempotent', async () => {
    const close = vi.fn();
    const wait = deferred<void>();
    let callIndex = 0;
    const segment = vi.fn(
      (
        _img: unknown,
        _roi: unknown,
        cb: (r: ReturnType<typeof makeSegmentResult>['result']) => void
      ) => {
        callIndex++;
        if (callIndex === 1) {
          cb(makeSegmentResult().result);
          return;
        }
        void wait.promise.then(() => {
          cb(makeSegmentResult().result);
        });
      }
    );

    const client = new SegmenterClient(async () => ({
      FilesetResolver: {forVisionTasks: vi.fn(async () => ({}))},
      InteractiveSegmenter: {
        createFromOptions: vi.fn(async () => ({segment, close})),
      },
    }));
    await client.init();

    const pending = client.segmentAt(
      {data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4},
      {u: 0.5, v: 0.5}
    );
    client.dispose();
    client.dispose();

    expect(close).not.toHaveBeenCalled();

    wait.resolve();
    await expect(pending).rejects.toThrow('SegmenterClient disposed');
    expect(close).toHaveBeenCalledTimes(1);
  });
});
