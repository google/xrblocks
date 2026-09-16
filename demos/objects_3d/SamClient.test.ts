// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';
import {createSamClient} from './SamClient.js';

const snapshot = () => ({
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]),
});
const box2d = {min: {x: 0, y: 0}, max: {x: 1, y: 1}};
const mask = {width: 2, height: 1, data: new Uint8Array([0, 255])};

function harness(
  run = async (_worker, message) => {
    if (message.type === 'mask') return mask;
  }
) {
  const workers = [];
  const messages = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const createWorker = vi.fn(() => {
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      terminate: vi.fn(),
      postMessage: vi.fn((message) => {
        messages.push({worker, ...message});
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        Promise.resolve()
          .then(() => run(worker, message))
          .then(
            (result) => {
              inFlight--;
              worker.onmessage?.({data: {id: message.id, result}});
            },
            (error) => {
              inFlight--;
              worker.onmessage?.({
                data: {id: message.id, error: error.message, disposed: true},
              });
            }
          );
      }),
    };
    workers.push(worker);
    return worker;
  });
  const logger = {warn: vi.fn(), info: vi.fn()};
  const client = createSamClient({createWorker, logger, timeoutMs: 1000});
  return {
    client,
    workers,
    messages,
    createWorker,
    logger,
    maxInFlight: () => maxInFlight,
  };
}

describe('SAM worker client', () => {
  it('isolates a rejected first-session promise so a real WASM factory runs', async () => {
    const wasmFactory = vi.fn(async () => {});
    const h = harness(async (worker, message) => {
      if (message.type !== 'encode') return;
      worker.wasmInitPromise ??=
        message.candidate.device === 'webgpu'
          ? Promise.reject(new Error('cached first initialization rejected'))
          : wasmFactory();
      await worker.wasmInitPromise;
    });
    await h.client.encodeSnapshot(snapshot());
    expect(wasmFactory).toHaveBeenCalledOnce();
    expect(h.createWorker).toHaveBeenCalledTimes(3);
    expect(h.workers[0].terminate).toHaveBeenCalledOnce();
    expect(h.workers[1].terminate).toHaveBeenCalledOnce();
    expect(
      h.messages.filter((m) => m.type === 'encode').map((m) => m.candidate)
    ).toEqual([
      {device: 'webgpu', dtype: 'fp16'},
      {device: 'webgpu', dtype: 'fp32'},
      {device: 'wasm', dtype: 'fp32'},
    ]);
    await h.client.dispose();
  });

  it('shares initialization and serializes concurrent encoding and masks', async () => {
    const h = harness();
    const image = snapshot();
    const [first, second] = await Promise.all([
      h.client.encodeSnapshot(image),
      h.client.encodeSnapshot(image),
    ]);
    const masks = await Promise.all([
      h.client.maskFromBbox(first, box2d),
      h.client.maskFromBbox(second, box2d),
    ]);
    expect(h.createWorker).toHaveBeenCalledOnce();
    expect(h.maxInFlight()).toBe(1);
    expect(masks[0].getAsUint8Array()).toEqual(mask.data);
    expect(image.data.byteLength).toBe(8);
    await h.client.dispose();
  });

  it.each(['encode', 'mask'])(
    'replays the same snapshot and box after later %s failure',
    async (failure) => {
      let failed = false;
      const h = harness(async (worker, message) => {
        if (
          !failed &&
          message.type === failure &&
          (failure === 'mask' || worker.encoded)
        ) {
          failed = true;
          throw new Error('GPU execution failed');
        }
        if (message.type === 'encode') worker.encoded = true;
        if (message.type === 'mask') return mask;
      });
      let state = await h.client.encodeSnapshot(snapshot());
      if (failure === 'encode') {
        const second = snapshot();
        second.data[0] = 42;
        state = await h.client.encodeSnapshot(second);
      }
      await h.client.maskFromBbox(state, box2d);
      expect(h.createWorker).toHaveBeenCalledTimes(2);
      const replay = h.messages.find(
        (m) => m.worker === h.workers[1] && m.type === 'encode'
      );
      expect(replay.snapshot.data[0]).toBe(failure === 'encode' ? 42 : 1);
      expect(h.messages.at(-1).box2d).toEqual(box2d);
      expect(h.messages.at(-1).stateId).toBe(replay.stateId);
      await h.client.dispose();
    }
  );

  it('re-encodes an older state instead of using newer embeddings', async () => {
    const h = harness();
    const image = snapshot();
    const first = await h.client.encodeSnapshot(image);
    image.data[0] = 99;
    await h.client.encodeSnapshot(image);
    await h.client.maskFromBbox(first, box2d);
    const encodes = h.messages.filter((m) => m.type === 'encode');
    expect(encodes.map((m) => m.snapshot.data[0])).toEqual([1, 99, 1]);
    expect(h.messages.at(-1).stateId).toBe(encodes[0].stateId);
    await h.client.dispose();
  });

  it('keeps a copy of the box prompt for queued work and fallback replay', async () => {
    const h = harness(async (worker, message) => {
      if (message.type === 'mask' && worker === h.workers[0]) {
        throw new Error('decoder failed');
      }
      if (message.type === 'mask') return mask;
    });
    const state = await h.client.encodeSnapshot(snapshot());
    const box = {min: {x: 0.25, y: 0}, max: {x: 0.75, y: 1}};
    const result = h.client.maskFromBbox(state, box);
    box.min.x = 0;
    await result;
    expect(
      h.messages.filter((m) => m.type === 'mask').map((m) => m.box2d.min.x)
    ).toEqual([0.25, 0.25]);
    await h.client.dispose();
  });

  it('retries from a fresh worker on the second Detect after exhaustion', async () => {
    let failing = true;
    const h = harness(async (_worker, message) => {
      if (failing && message.type === 'encode') throw new Error('offline');
    });
    await expect(h.client.encodeSnapshot(snapshot())).rejects.toThrow(
      'SAM failed'
    );
    expect(h.createWorker).toHaveBeenCalledTimes(3);
    expect(h.workers.every((w) => w.terminate.mock.calls.length === 1)).toBe(
      true
    );
    failing = false;
    await h.client.encodeSnapshot(snapshot());
    expect(h.createWorker).toHaveBeenCalledTimes(4);
    await h.client.dispose();
  });

  it.each(['onerror', 'onmessageerror'])(
    'clears pending work and retries after worker %s',
    async (event) => {
      const h = harness(async (worker, message) => {
        if (message.type === 'encode' && worker === h.workers[0]) {
          worker[event]({message: 'worker unavailable', preventDefault() {}});
        }
      });
      await h.client.encodeSnapshot(snapshot());
      expect(h.createWorker).toHaveBeenCalledTimes(2);
      expect(h.workers[0].terminate).toHaveBeenCalledOnce();
      await h.client.dispose();
    }
  );

  it('bounds an unresponsive worker and retries without retaining pending work', async () => {
    vi.useFakeTimers();
    const h = harness(async (worker, message) => {
      if (worker === h.workers[0] && message.type === 'encode') {
        await new Promise(() => {});
      }
    });
    try {
      const encoded = h.client.encodeSnapshot(snapshot());
      await vi.advanceTimersByTimeAsync(1001);
      await encoded;
      expect(h.createWorker).toHaveBeenCalledTimes(2);
      expect(h.workers[0].terminate).toHaveBeenCalledOnce();
      await h.client.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues after a worker constructor throws', async () => {
    const h = harness();
    h.createWorker.mockImplementationOnce(() => {
      throw new Error('worker script failed to load');
    });
    await h.client.encodeSnapshot(snapshot());
    expect(h.createWorker).toHaveBeenCalledTimes(2);
    await h.client.dispose();
  });

  it('terminates and rejects future work on page cleanup', async () => {
    const h = harness();
    await h.client.encodeSnapshot(snapshot());
    await h.client.dispose();
    expect(h.messages.at(-1).type).toBe('dispose');
    expect(h.workers[0].terminate).toHaveBeenCalledOnce();
    await expect(h.client.encodeSnapshot(snapshot())).rejects.toThrow('closed');
  });
});
