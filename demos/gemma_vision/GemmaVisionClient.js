import {validateQuestion} from './conversation.js';
import {MAX_IMAGE_EDGE} from './image.js';
import {DEFAULT_MODEL, getModel} from './modelConfig.js';

/**
 * @typedef {'check' | 'load' | 'image' | 'generate' | 'clear' | 'stop' | 'dispose'} Command
 * @typedef {{id: number, type: Command} & Record<string, unknown>} Request
 * @typedef {Record<string, unknown>} Result
 * @typedef {{onText?: (text: string) => void, onProgress?: (event: unknown) => void}} Callbacks
 * @typedef {object} Transport
 * @property {(request: Request, transfer: ArrayBuffer[]) => void} postMessage
 * @property {() => void} terminate
 * @property {((event: MessageEvent<unknown>) => void) | null} onmessage
 * @property {((event: ErrorEvent) => void) | null} onerror
 * @property {((event: MessageEvent<unknown>) => void) | null} onmessageerror
 * @typedef {object} Pending
 * @property {number} id
 * @property {Command} type
 * @property {Result} data
 * @property {Promise<Result>} promise
 * @property {(result: Result) => void} resolve
 * @property {(error: Error) => void} reject
 * @property {Callbacks} callbacks
 * @property {number} started
 * @property {string} text
 * @property {number | null} firstTextMs
 */

const SHUTDOWN_MS = 5000;

/** One lazily created worker shared by the preload and spatial interfaces. */
export class GemmaVisionClient {
  /**
   * @param {{createWorker?: () => Transport, now?: () => number}} options
   */
  constructor({
    createWorker = () =>
      new Worker(new URL('./gemmaVisionWorker.js', import.meta.url), {
        type: 'module',
      }),
    now = () => performance.now(),
  } = {}) {
    this._createWorker = createWorker;
    this._now = now;
    /** @type {'idle' | 'loading' | 'ready' | 'generating' | 'disposed'} */
    this.state = 'idle';
    this.loaded = false;
    /** @type {string | null} Key of the loaded model in MODELS. */
    this.modelKey = null;
    /** @type {number | null} Last acknowledged capture, never an in-flight capture. */
    this.imageId = null;
    /** @type {Transport | null} */
    this._worker = null;
    /** @type {Map<number, Pending>} */
    this._pending = new Map();
    /** @type {Pending | null} */
    this._active = null;
    /** @type {Promise<void> | null} */
    this._stopping = null;
    /** @type {Promise<void> | null} */
    this._disposing = null;
    this._closing = false;
    this._requestId = 0;
    this._imageId = 0;
  }

  /** Check worker capabilities without loading a model. */
  async check() {
    this._assertAvailable();
    return this._send('check').promise;
  }

  /**
   * Resolve the worker's cached, cacheWarning and loadMs result.
   * Downloads are never authorized implicitly. Loading a different model
   * replaces the current one inside the same worker.
   * @param {{modelKey?: string, allowDownload?: boolean, onProgress?: (event: unknown) => void}} options
   */
  async load({
    modelKey = DEFAULT_MODEL,
    allowDownload = false,
    onProgress,
  } = {}) {
    this._assertAvailable();
    const model = getModel(modelKey);
    if (this.loaded && this.modelKey === model.key) {
      throw new Error(`${model.name} is already loaded.`);
    }
    this.state = 'loading';
    return this._send(
      'load',
      {modelKey: model.key, allowDownload: allowDownload === true},
      {onProgress}
    ).promise;
  }

  /**
   * Transfer ownership of an exact, bounded RGBA buffer to the worker.
   * A failed replacement leaves the previous acknowledged capture usable.
   * @param {{width: number, height: number, buffer: ArrayBuffer}} image
   */
  async setImage({width, height, buffer}) {
    this._assertAvailable();
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > MAX_IMAGE_EDGE ||
      height > MAX_IMAGE_EDGE ||
      !(buffer instanceof ArrayBuffer) ||
      buffer.byteLength !== width * height * 4
    ) {
      throw new Error('Invalid captured RGBA image.');
    }
    return this._send(
      'image',
      {
        imageId: ++this._imageId,
        width,
        height,
        buffer,
      },
      {},
      [buffer]
    ).promise;
  }

  /**
   * Stream cumulative text and return worker metrics plus firstTextMs.
   * firstTextMs is null when no nonempty text chunk was received.
   * @param {string} question
   * @param {{imageBudget?: number, onText?: (text: string) => void}} options
   */
  async generate(question, {imageBudget, onText} = {}) {
    this._assertAvailable();
    if (!this.loaded) throw new Error('Load a model before asking a question.');
    if (this.imageId === null) {
      throw new Error('Capture an image before asking a question.');
    }
    question = validateQuestion(question);
    this.state = 'generating';
    return this._send(
      'generate',
      {
        question,
        imageId: this.imageId,
        imageBudget: imageBudget ?? getModel(this.modelKey).imageBudget,
      },
      {onText}
    ).promise;
  }

  /** Reset conversation history while retaining the model and captured image. */
  async clear() {
    this._assertAvailable();
    if (!this._worker) return {};
    return this._send('clear').promise;
  }

  /** Cancel loading immediately, or give generation five seconds to stop. */
  async stop() {
    if (this._closing) throw new Error('The vision client is disposed.');
    if (this._stopping) return this._stopping;
    const active = this._active;
    if (active?.type === 'load') {
      this._reset(
        new Error('Model loading canceled. Load a model to continue.')
      );
      return;
    }
    if (active?.type !== 'generate') return;
    const stopping = this._send('stop', {targetId: active.id}).promise;
    this._stopping = this._deadline(
      Promise.all([active.promise.catch(() => {}), stopping]),
      'Stopping timed out. Worker reset; load a model and capture a new image.'
    )
      .then(() => {})
      .catch((error) => {
        this._reset(asError(error));
        throw error;
      })
      .finally(() => {
        this._stopping = null;
      });
    return this._stopping;
  }

  /** Dispose gracefully, then terminate; a deadline failure still disposes. */
  async dispose() {
    if (this._disposing) return this._disposing;
    if (this.state === 'disposed') return;
    this._closing = true;
    if (!this._worker) {
      this._reset(new Error('The vision client is disposed.'));
      return;
    }
    this._disposing = this._deadline(
      this._send('dispose').promise,
      'Disposal timed out. The vision worker was reset and disposed.'
    )
      .then(() => {})
      .finally(() => {
        this._reset(new Error('The vision client is disposed.'));
      });
    return this._disposing;
  }

  _assertAvailable() {
    if (this._closing) throw new Error('The vision client is disposed.');
    if (this._active || this._stopping) {
      throw new Error('The vision worker is busy.');
    }
  }

  /**
   * @param {Command} type
   * @param {Result} data
   * @param {Callbacks} callbacks
   * @param {ArrayBuffer[]} transfer
   * @returns {Pending}
   */
  _send(type, data = {}, callbacks = {}, transfer = []) {
    /** @type {(result: Result) => void} */
    let resolve = () => {};
    /** @type {(error: Error) => void} */
    let reject = () => {};
    /** @type {Promise<Result>} */
    const promise = new Promise((done, fail) => {
      resolve = done;
      reject = fail;
    });
    /** @type {Pending} */
    const pending = {
      id: ++this._requestId,
      type,
      data,
      callbacks,
      promise,
      resolve,
      reject,
      started: this._now(),
      text: '',
      firstTextMs: null,
    };
    this._pending.set(pending.id, pending);
    if (type !== 'stop' && type !== 'dispose') this._active = pending;
    try {
      if (!this._worker) {
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
          if (this._worker === worker) {
            this._reset(
              new Error(event.message || 'The vision worker crashed.')
            );
          }
        };
        worker.onmessageerror = () => {
          if (this._worker === worker) {
            this._reset(
              new Error('Unable to deserialize a vision worker message.')
            );
          }
        };
      }
      this._worker.postMessage({id: pending.id, type, ...data}, transfer);
    } catch (error) {
      this._reset(asError(error));
    }
    return pending;
  }

  /** @param {unknown} message */
  _message(message) {
    if (
      !isRecord(message) ||
      typeof message.id !== 'number' ||
      !Number.isSafeInteger(message.id) ||
      message.id < 1 ||
      typeof message.type !== 'string' ||
      !['result', 'error', 'delta', 'progress'].includes(message.type) ||
      (message.type === 'result' && !isRecord(message.result)) ||
      (message.type === 'error' &&
        (typeof message.message !== 'string' ||
          typeof message.fatal !== 'boolean')) ||
      (message.type === 'delta' && typeof message.text !== 'string') ||
      (message.type === 'progress' && !isRecord(message.event))
    )
      throw new Error('Malformed vision worker response.');

    const pending = this._pending.get(message.id);
    if (!pending) return;
    if (message.type === 'error') {
      const error = new Error(String(message.message));
      if (message.fatal) {
        this._reset(error);
      } else {
        // A failed load or switch leaves the worker and its runtime usable.
        if (pending.type === 'load') {
          this.loaded = false;
          this.modelKey = null;
        }
        this._finish(pending, error);
      }
    } else if (message.type === 'delta' && typeof message.text === 'string') {
      if (pending.type !== 'generate') {
        throw new Error('Malformed vision worker text response.');
      }
      if (!message.text) return;
      pending.firstTextMs ??= this._now() - pending.started;
      pending.text += message.text;
      pending.callbacks.onText?.(pending.text);
    } else if (message.type === 'progress') {
      if (pending.type !== 'load') {
        throw new Error('Malformed vision worker progress response.');
      }
      pending.callbacks.onProgress?.(message.event);
    } else if (isRecord(message.result)) {
      const result = message.result;
      if (pending.type === 'load') {
        if (
          typeof result.cached !== 'boolean' ||
          typeof result.cacheWarning !== 'string' ||
          typeof result.loadMs !== 'number' ||
          !Number.isFinite(result.loadMs)
        )
          throw new Error('Malformed vision worker load result.');
        this.loaded = true;
        this.modelKey = pending.data.modelKey;
      }
      if (pending.type === 'image') {
        if (
          typeof result.imageId !== 'number' ||
          result.imageId !== pending.data.imageId
        ) {
          throw new Error('Malformed vision worker image acknowledgement.');
        }
        this.imageId = result.imageId;
      }
      if (pending.type === 'generate' && typeof result.text !== 'string') {
        throw new Error('Malformed vision worker generation result.');
      }
      this._finish(
        pending,
        null,
        pending.type === 'generate'
          ? {...result, firstTextMs: pending.firstTextMs}
          : result
      );
    }
  }

  /**
   * @param {Pending} pending
   * @param {Error | null} error
   * @param {Result} result
   */
  _finish(pending, error, result = {}) {
    this._pending.delete(pending.id);
    if (this._active === pending) {
      this._active = null;
      this.state = this.loaded ? 'ready' : 'idle';
    }
    if (error) pending.reject(error);
    else pending.resolve(result);
  }

  /** @param {Error} error */
  _reset(error) {
    const worker = this._worker;
    this._worker = null;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
    }
    for (const pending of this._pending.values()) pending.reject(error);
    this._pending.clear();
    this._active = null;
    this.loaded = false;
    this.modelKey = null;
    this.imageId = null;
    this.state = this._closing ? 'disposed' : 'idle';
  }

  /**
   * @param {Promise<unknown>} promise
   * @param {string} message
   * @returns {Promise<void>}
   */
  _deadline(promise, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(message);
        this._reset(error);
        reject(error);
      }, SHUTDOWN_MS);
      promise.then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} error */
function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}
