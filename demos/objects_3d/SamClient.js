const CANDIDATES = [
  {device: 'webgpu', dtype: 'fp16'},
  {device: 'webgpu', dtype: 'fp32'},
  {device: 'wasm', dtype: 'fp32'},
];

export function createSamClient({
  createWorker = () =>
    new Worker(new URL('./sam.worker.js', import.meta.url), {type: 'module'}),
  logger = console,
  timeoutMs = 300000,
} = {}) {
  let queue = Promise.resolve();
  let active = null;
  let nextId = 0;
  let closed = false;
  const snapshots = new WeakMap();

  function serialize(fn) {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  }

  function spawn(index) {
    const worker = createWorker();
    const entry = {worker, index, stateId: null, pending: null, broken: false};
    worker.onmessage = ({data}) => {
      if (data.id !== entry.pending?.id) return;
      const pending = entry.pending;
      entry.pending = null;
      clearTimeout(pending.timer);
      if (data.error) {
        entry.disposed = data.disposed;
        pending.reject(new Error(data.error));
      } else {
        pending.resolve(data.result);
      }
    };
    const failed = (event) => {
      event.preventDefault?.();
      entry.broken = true;
      if (!entry.pending) return;
      clearTimeout(entry.pending.timer);
      entry.pending.reject(
        new Error(event.message || 'SAM worker message could not be read')
      );
      entry.pending = null;
    };
    worker.onerror = failed;
    worker.onmessageerror = failed;
    return entry;
  }

  function request(entry, type, payload = {}, deadline = timeoutMs) {
    return new Promise((resolve, reject) => {
      if (entry.broken) {
        reject(new Error('SAM worker is unavailable'));
        return;
      }
      const id = ++nextId;
      const timer = setTimeout(() => {
        entry.broken = true;
        entry.pending = null;
        reject(new Error(`SAM worker ${type} timed out`));
      }, deadline);
      entry.pending = {id, resolve, reject, timer};
      try {
        // Structured cloning preserves the caller's snapshot for detector,
        // depth rays, and replay after GPU failure. Never transfer its buffer.
        entry.worker.postMessage({id, type, ...payload});
      } catch (error) {
        clearTimeout(timer);
        entry.pending = null;
        reject(error);
      }
    });
  }

  async function discard(entry) {
    try {
      if (!entry.broken && !entry.disposed) {
        await request(entry, 'dispose', {}, Math.min(timeoutMs, 5000));
      }
    } catch (error) {
      logger.warn('[objects_3d] SAM worker cleanup failed', error);
    } finally {
      entry.worker.terminate();
    }
  }

  async function run(state, box2d) {
    const snapshot = snapshots.get(state);
    let lastError;
    for (let index = active?.index ?? 0; index < CANDIDATES.length; index++) {
      if (closed) throw new Error('SAM client is closed');
      let entry = active;
      try {
        entry ??= spawn(index);
        if (entry.stateId !== state.id) {
          await request(entry, 'encode', {
            snapshot,
            stateId: state.id,
            candidate: CANDIDATES[index],
          });
          entry.stateId = state.id;
        }
        if (active !== entry) {
          logger.info(
            `[objects_3d] SAM ready on ${CANDIDATES[index].device}/${CANDIDATES[index].dtype}`
          );
          active = entry;
        }
        if (box2d) {
          return await request(entry, 'mask', {stateId: state.id, box2d});
        }
        return;
      } catch (error) {
        lastError = error;
        active = null;
        logger.warn(
          `[objects_3d] SAM failed on ${CANDIDATES[index].device}/${CANDIDATES[index].dtype}`,
          error
        );
        if (entry) await discard(entry);
      }
    }
    throw new Error(
      `SAM failed on all remaining devices: ${lastError?.message}`,
      {
        cause: lastError,
      }
    );
  }

  function encodeSnapshot(snapshot) {
    const state = {
      id: ++nextId,
      width: snapshot.width,
      height: snapshot.height,
    };
    snapshots.set(state, {
      width: snapshot.width,
      height: snapshot.height,
      data: new Uint8ClampedArray(snapshot.data),
    });
    return serialize(async () => {
      await run(state);
      return state;
    });
  }

  function maskFromBbox(state, box2d) {
    const prompt = {
      min: {x: box2d.min.x, y: box2d.min.y},
      max: {x: box2d.max.x, y: box2d.max.y},
    };
    return serialize(async () => {
      if (!snapshots.has(state)) throw new Error('Unknown SAM snapshot');
      const mask = await run(state, prompt);
      return {
        width: mask.width,
        height: mask.height,
        getAsUint8Array: () => mask.data,
        close: () => {},
      };
    });
  }

  function dispose() {
    closed = true;
    return serialize(async () => {
      if (active) {
        const entry = active;
        active = null;
        await discard(entry);
      }
    });
  }

  return {encodeSnapshot, maskFromBbox, dispose};
}
