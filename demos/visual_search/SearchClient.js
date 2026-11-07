const SHUTDOWN_MS = 5000;

/** Main-thread handle for the search worker, created lazily. */
export class SearchClient {
  /**
   * @param {{createWorker?: () => Worker, now?: () => number}} [options]
   */
  constructor({
    createWorker = () =>
      new Worker(new URL('./searchWorker.js', import.meta.url), {
        type: 'module',
      }),
    now = () => performance.now(),
  } = {}) {
    this._createWorker = createWorker;
    this._now = now;
    /** @type {'idle' | 'checking' | 'downloading' | 'loading' | 'ready' | 'searching' | 'disposed'} */
    this.state = 'idle';
    this.loaded = false;
    /** Increments whenever the worker is reset, so callers can detect crashes. */
    this.resets = 0;
    this.lastError = null;
    this._worker = null;
    this._pending = new Map();
    this._active = null;
    this._stopping = null;
    this._disposing = null;
    this._closing = false;
    this._requestId = 0;
  }

  get busy() {
    return this._active !== null || this._stopping !== null;
  }

  check() {
    this._assertAvailable();
    return this._send('check', 'checking').promise;
  }

  /** @param {{onProgress?: (event: {loaded: number, total: number, file: string}) => void}} [options] */
  download({onProgress} = {}) {
    this._assertAvailable();
    return this._send('download', 'downloading', {}, {onProgress}).promise;
  }

  load() {
    this._assertAvailable();
    if (this.loaded) throw new Error('The search model is already loaded.');
    return this._send('load', 'loading').promise;
  }

  /**
   * Scores each crop of a frame against a text query.
   * @param {{data: Uint8ClampedArray, width: number, height: number}} image
   *   RGBA pixels; the pixel buffer moves to the worker.
   * @param {{x: number, y: number, side: number}[]} tiles
   * @param {string} query What to look for, such as "keys".
   * @returns {Promise<{scores: number[], probabilities: number[],
   *   textMs: number, visionMs: number}>}
   */
  search(image, tiles, query) {
    this._assertAvailable();
    if (!this.loaded) throw new Error('Load the search model first.');
    const data = image?.data;
    if (!(data instanceof Uint8ClampedArray) || !data.length) {
      throw new Error('Invalid camera frame.');
    }
    const owned =
      data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
        ? data
        : data.slice();
    const frame = {data: owned, width: image.width, height: image.height};
    return this._send(
      'search',
      'searching',
      {image: frame, tiles, query},
      {expectedScores: tiles.length},
      [owned.buffer]
    ).promise;
  }

  /** Cancel a download cooperatively, or loading by resetting the worker. */
  async stop() {
    if (this._closing) return;
    if (this._stopping) return this._stopping;
    const active = this._active;
    if (active?.type === 'load' || active?.type === 'check') {
      this._reset(new Error('Model loading canceled.'));
      return;
    }
    if (active?.type !== 'download') return;
    const stopping = this._send('stop', null, {targetId: active.id}).promise;
    this._stopping = this._deadline(
      Promise.all([active.promise.catch(() => {}), stopping]),
      'Stopping timed out; the search worker was reset.'
    )
      .catch((error) => this._reset(asError(error)))
      .finally(() => {
        this._stopping = null;
      });
    return this._stopping;
  }

  async dispose() {
    if (this._disposing) return this._disposing;
    if (this.state === 'disposed') return;
    this._closing = true;
    if (!this._worker) {
      this._reset(new Error('The search client is disposed.'));
      return;
    }
    this._disposing = this._deadline(
      this._send('dispose', null).promise,
      'Disposal timed out; the search worker was terminated.'
    )
      .catch(() => {})
      .finally(() => this._reset(new Error('The search client is disposed.')));
    return this._disposing;
  }

  _assertAvailable() {
    if (this._closing) throw new Error('The search client is disposed.');
    if (this.busy) throw new Error('The search worker is busy.');
  }

  _send(type, state, data = {}, callbacks = {}, transfer = []) {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const pending = {
      id: ++this._requestId,
      type,
      callbacks,
      promise,
      resolve,
      reject,
    };
    this._pending.set(pending.id, pending);
    if (state) {
      this._active = pending;
      this.state = state;
    }
    try {
      if (!this._worker) this._spawn();
      this._worker.postMessage({id: pending.id, type, ...data}, transfer);
    } catch (error) {
      this._reset(asError(error));
    }
    return pending;
  }

  _spawn() {
    const worker = this._createWorker();
    this._worker = worker;
    worker.onmessage = ({data}) => {
      if (this._worker !== worker) return;
      try {
        this._message(data);
      } catch (error) {
        this._reset(asError(error));
      }
    };
    worker.onerror = (event) => {
      event?.preventDefault?.();
      if (this._worker === worker) {
        this._reset(new Error(event?.message || 'The search worker crashed.'));
      }
    };
    worker.onmessageerror = () => {
      if (this._worker === worker) {
        this._reset(new Error('Unreadable search worker message.'));
      }
    };
  }

  _message(message) {
    if (
      !isRecord(message) ||
      !Number.isSafeInteger(message.id) ||
      message.id < 1 ||
      !['result', 'error', 'progress'].includes(message.type) ||
      (message.type === 'result' && !isRecord(message.result)) ||
      (message.type === 'error' &&
        (typeof message.message !== 'string' ||
          typeof message.fatal !== 'boolean')) ||
      (message.type === 'progress' && !isRecord(message.event))
    ) {
      throw new Error('Malformed search worker response.');
    }
    const pending = this._pending.get(message.id);
    // Unknown IDs belong to requests that were already settled or reset.
    if (!pending) return;
    if (message.type === 'progress') {
      if (pending.type !== 'download') {
        throw new Error('Unexpected search worker progress.');
      }
      pending.callbacks.onProgress?.(message.event);
      return;
    }
    if (message.type === 'error') {
      const error = new Error(message.message);
      if (message.fatal || pending.type === 'load') this._reset(error);
      else this._finish(pending, error);
      return;
    }
    const {result} = message;
    this._validate(pending, result);
    if (pending.type === 'load') this.loaded = true;
    this._finish(pending, null, result);
  }

  _validate(pending, result) {
    if (pending.type === 'load' && !Number.isFinite(result.loadMs)) {
      throw new Error('Malformed search worker load result.');
    }
    if (
      pending.type === 'search' &&
      (!Array.isArray(result.scores) ||
        result.scores.length !== pending.callbacks.expectedScores ||
        !result.scores.every(Number.isFinite) ||
        !Array.isArray(result.probabilities) ||
        result.probabilities.length !== result.scores.length ||
        !result.probabilities.every(Number.isFinite) ||
        !Number.isFinite(result.textMs) ||
        !Number.isFinite(result.visionMs))
    ) {
      throw new Error('Malformed search worker result.');
    }
  }

  _finish(pending, error, result = {}) {
    this._pending.delete(pending.id);
    if (this._active === pending) {
      this._active = null;
      this.state = this.loaded ? 'ready' : 'idle';
    }
    if (error) pending.reject(error);
    else pending.resolve(result);
  }

  _reset(error) {
    const worker = this._worker;
    this._worker = null;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      this.resets++;
    }
    this.lastError = error;
    const pending = [...this._pending.values()];
    this._pending.clear();
    this._active = null;
    this.loaded = false;
    this.state = this._closing ? 'disposed' : 'idle';
    for (const request of pending) request.reject(error);
  }

  _deadline(promise, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(message);
        this._reset(error);
        reject(error);
      }, SHUTDOWN_MS);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}
