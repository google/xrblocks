import {CACHE_NAME, MODEL_DTYPE, MODEL_ID, REVISION} from './modelConfig.js';
import * as modelStore from './modelStore.js';
import {TARGET_SAMPLE_RATE} from './audio.js';

export const MAX_AUDIO_SECONDS = 30;
export const PROGRESS_MS = 100;

/** Moonshine's paper uses about 6 output tokens per second of audio. */
export function maxNewTokens(samples) {
  return Math.max(8, Math.ceil((samples / TARGET_SAMPLE_RATE) * 6));
}

export function checkCapabilities() {
  if (typeof WebAssembly !== 'object') {
    throw new Error('This browser does not support WebAssembly.');
  }
  if (!globalThis.caches) {
    throw new Error('Browser cache storage is unavailable here.');
  }
}

/**
 * Serve pinned files from the Cache API only, on single-threaded WASM.
 * @param {any} tf Transformers.js module.
 * @param {{cacheOnlyFetch: typeof fetch}} store
 */
export function configureRuntime(tf, store) {
  tf.env.cacheKey = CACHE_NAME;
  tf.env.useBrowserCache = true;
  tf.env.useWasmCache = true;
  tf.env.allowLocalModels = false;
  tf.env.allowRemoteModels = true;
  tf.env.fetch = store.cacheOnlyFetch;
  tf.env.backends.onnx.wasm.proxy = false;
  tf.env.backends.onnx.wasm.numThreads = 1;
}

/** Worker-side request handler; one operation runs at a time. */
export class CaptionsRuntime {
  constructor({
    loadRuntime,
    postMessage,
    probe = checkCapabilities,
    store = modelStore,
    now = () => performance.now(),
  }) {
    this.loadRuntime = loadRuntime;
    this.post = postMessage;
    this.probe = probe;
    this.store = store;
    this.now = now;
    this.model = null;
    this.tokenizer = null;
    this.active = null;
    this.closing = false;
  }

  handle(message) {
    const id = message?.id;
    if (!Number.isSafeInteger(id) || id < 1) {
      this.error(id, new Error('Invalid worker request ID.'));
      return Promise.resolve();
    }
    if (this.closing) {
      this.error(id, new Error('The captions worker has been disposed.'));
      return Promise.resolve();
    }
    if (message.type === 'stop') return this.stop(message);
    if (message.type === 'dispose') return this.dispose(id);
    if (this.active) {
      this.error(id, new Error('The captions worker is busy.'));
      return Promise.resolve();
    }
    const operation = {id, abort: new AbortController(), promise: null};
    this.active = operation;
    operation.promise = Promise.resolve()
      .then(() => this.perform(message, operation))
      .then(
        (result) => this.post({type: 'result', id, result}),
        (error) => this.error(id, error)
      )
      .finally(() => {
        this.active = null;
      });
    return operation.promise;
  }

  perform(message, operation) {
    switch (message.type) {
      case 'check':
        this.probe();
        return {};
      case 'download':
        return this.download(operation);
      case 'load':
        return this.load();
      case 'transcribe':
        return this.transcribe(message.audio);
      default:
        throw new Error(`Unknown captions operation: ${message.type}`);
    }
  }

  async download(operation, assets) {
    this.probe();
    let last = -Infinity;
    let pending = null;
    const result = await this.store.downloadAssets({
      ...(assets && {assets}),
      signal: operation.abort.signal,
      onProgress: (event) => {
        pending = event;
        const now = this.now();
        if (now - last < PROGRESS_MS && event.loaded < event.total) return;
        last = now;
        pending = null;
        this.post({type: 'progress', id: operation.id, event});
      },
    });
    if (pending)
      this.post({type: 'progress', id: operation.id, event: pending});
    return result;
  }

  async load() {
    if (this.model) throw new Error('The captions model is already loaded.');
    this.probe();
    const cached = await this.store.inspectCache();
    if (!cached.complete) {
      throw new Error('The captions model is not cached. Choose Download.');
    }
    const started = this.now();
    const tf = await this.loadRuntime();
    configureRuntime(tf, this.store);
    // Built from cached JSON: AutoTokenizer would also query the main branch.
    const tokenizer = new tf.PreTrainedTokenizer(
      await this.store.readCachedJSON('tokenizer.json'),
      await this.store.readCachedJSON('tokenizer_config.json')
    );
    const model = await tf.MoonshineForConditionalGeneration.from_pretrained(
      MODEL_ID,
      {revision: REVISION, dtype: MODEL_DTYPE, device: 'wasm'}
    );
    this.tf = tf;
    this.tokenizer = tokenizer;
    this.model = model;
    const loadMs = this.now() - started;
    const warmupStarted = this.now();
    await this.run(new Float32Array(TARGET_SAMPLE_RATE));
    return {loadMs, warmupMs: this.now() - warmupStarted};
  }

  async transcribe(audio) {
    if (!this.model) throw new Error('Load the captions model first.');
    if (
      !(audio instanceof Float32Array) ||
      audio.length < 1 ||
      audio.length > MAX_AUDIO_SECONDS * TARGET_SAMPLE_RATE
    ) {
      throw new Error('Invalid audio segment.');
    }
    const started = this.now();
    const text = await this.run(audio);
    return {
      text,
      inferenceMs: this.now() - started,
      audioMs: (audio.length / TARGET_SAMPLE_RATE) * 1000,
    };
  }

  async run(audio) {
    const {tf} = this;
    const input = new tf.Tensor('float32', audio, [1, audio.length]);
    let output;
    try {
      output = await this.model.generate({
        input_values: input,
        max_new_tokens: maxNewTokens(audio.length),
        do_sample: false,
        num_beams: 1,
      });
      return this.tokenizer
        .batch_decode(output, {skip_special_tokens: true})[0]
        .trim();
    } finally {
      output?.dispose?.();
      input.dispose?.();
    }
  }

  async stop({id, targetId}) {
    const operation = this.active;
    if (operation && operation.id === targetId) {
      operation.abort.abort(new Error('Download canceled.'));
      await operation.promise;
    }
    this.post({type: 'result', id, result: {}});
  }

  async dispose(id) {
    this.closing = true;
    if (this.active) {
      this.active.abort.abort(new Error('The captions worker was disposed.'));
      await this.active.promise;
    }
    try {
      await this.model?.dispose?.();
      this.model = null;
      this.tokenizer = null;
      this.post({type: 'result', id, result: {}});
    } catch (error) {
      this.error(id, error);
    }
  }

  error(id, error) {
    this.post({
      type: 'error',
      id,
      message: error?.message ?? String(error),
      fatal: /out of memory|memory access|runtimeerror/i.test(
        `${error?.name}: ${error?.message}`
      ),
    });
  }
}
