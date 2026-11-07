import {CACHE_NAME, MODEL_DTYPE, MODEL_ID, REVISION} from './modelConfig.js';
import * as modelStore from './modelStore.js';
import {
  BACKGROUND_LABELS,
  contrast,
  meanEmbedding,
  promptsFor,
  similarities,
} from './search.js';

export const PROGRESS_MS = 100;
/** Query embeddings are cheap to keep and save model calls on repeat queries. */
export const TEXT_CACHE_SIZE = 32;
/** The default grid makes at most 32 crops; more would take tens of seconds. */
export const MAX_TILES = 40;
export const MAX_FRAME_PIXELS = 4096 * 4096;

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

/**
 * Checks a frame and its crop rectangles before they reach the model.
 * @param {{data: ArrayLike<number>, width: number, height: number}} image RGBA.
 * @param {{x: number, y: number, side: number}[]} tiles
 */
export function validateFrame(image, tiles) {
  const {width, height, data} = image ?? {};
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_FRAME_PIXELS ||
    !data ||
    data.length !== width * height * 4
  ) {
    throw new Error('Invalid camera frame.');
  }
  if (!Array.isArray(tiles) || !tiles.length || tiles.length > MAX_TILES) {
    throw new Error('Invalid crop list.');
  }
  for (const tile of tiles) {
    const {x, y, side} = tile ?? {};
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(side) ||
      x < 0 ||
      y < 0 ||
      side < 1 ||
      x + side > width ||
      y + side > height
    ) {
      throw new Error('A crop falls outside the camera frame.');
    }
  }
}

/** Worker-side request handler; one operation runs at a time. */
export class SearchRuntime {
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
    this.tf = null;
    this.tokenizer = null;
    this.processor = null;
    this.textModel = null;
    this.visionModel = null;
    this.textCache = new Map();
    this.backgrounds = null;
    this.active = null;
    this.closing = false;
  }

  get loaded() {
    return !!(this.textModel && this.visionModel);
  }

  handle(message) {
    const id = message?.id;
    if (!Number.isSafeInteger(id) || id < 1) {
      this.error(id, new Error('Invalid worker request ID.'));
      return Promise.resolve();
    }
    if (this.closing) {
      this.error(id, new Error('The search worker has been disposed.'));
      return Promise.resolve();
    }
    if (message.type === 'stop') return this.stop(message);
    if (message.type === 'dispose') return this.dispose(id);
    if (this.active) {
      this.error(id, new Error('The search worker is busy.'));
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
      case 'search':
        return this.search(message);
      default:
        throw new Error(`Unknown search operation: ${message.type}`);
    }
  }

  async download(operation) {
    this.probe();
    let last = -Infinity;
    let pending = null;
    const result = await this.store.downloadAssets({
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
    if (pending) {
      this.post({type: 'progress', id: operation.id, event: pending});
    }
    return result;
  }

  async load() {
    if (this.loaded) throw new Error('The search model is already loaded.');
    this.probe();
    const cached = await this.store.inspectCache();
    if (!cached.complete) {
      throw new Error('The search model is not cached. Choose Download.');
    }
    const started = this.now();
    const tf = await this.loadRuntime();
    configureRuntime(tf, this.store);
    // Built from cached JSON: the Auto* loaders would also query the main
    // branch, which the cache-only fetch refuses.
    const tokenizer = new tf.CLIPTokenizer(
      await this.store.readCachedJSON('tokenizer.json'),
      await this.store.readCachedJSON('tokenizer_config.json')
    );
    const processor = new tf.CLIPImageProcessor(
      await this.store.readCachedJSON('preprocessor_config.json')
    );
    const options = {revision: REVISION, dtype: MODEL_DTYPE, device: 'wasm'};
    const textModel = await tf.CLIPTextModelWithProjection.from_pretrained(
      MODEL_ID,
      options
    );
    const visionModel = await tf.CLIPVisionModelWithProjection.from_pretrained(
      MODEL_ID,
      options
    );
    this.tf = tf;
    this.tokenizer = tokenizer;
    this.processor = processor;
    this.textModel = textModel;
    this.visionModel = visionModel;
    const loadMs = this.now() - started;
    const warmupStarted = this.now();
    // The background captions are fixed, so embed them once here; this also
    // warms up the text model.
    const backgrounds = [];
    for (const label of BACKGROUND_LABELS) {
      backgrounds.push(await this.embedQuery(label));
    }
    this.backgrounds = backgrounds;
    this.textCache.clear();
    const gray = new Uint8ClampedArray(224 * 224 * 4).fill(128);
    await this.embedTiles({data: gray, width: 224, height: 224}, [
      {x: 0, y: 0, side: 224},
    ]);
    return {loadMs, warmupMs: this.now() - warmupStarted};
  }

  /**
   * Scores every crop of one camera frame against one query.
   * @param {{image: {data: Uint8ClampedArray, width: number, height: number},
   *   tiles: {x: number, y: number, side: number}[], query: string}} message
   * @returns {Promise<{scores: number[], probabilities: number[],
   *   textMs: number, visionMs: number}>} Per crop, the query similarity and
   *   the probability that the query beats the background captions.
   */
  async search({image, tiles, query}) {
    if (!this.loaded) throw new Error('Load the search model first.');
    if (typeof query !== 'string' || !query.trim()) {
      throw new Error('Type what to look for.');
    }
    validateFrame(image, tiles);
    const textStarted = this.now();
    const text = await this.embedQuery(query);
    const textMs = this.now() - textStarted;
    const visionStarted = this.now();
    const images = await this.embedTiles(image, tiles);
    const visionMs = this.now() - visionStarted;
    const scores = similarities(text, images);
    const backgrounds = this.backgrounds.map((background) =>
      similarities(background, images)
    );
    return {
      scores,
      probabilities: contrast(scores, backgrounds),
      textMs,
      visionMs,
    };
  }

  /** One embedding per query: the mean over the prompt templates. */
  async embedQuery(query) {
    const prompts = promptsFor(query);
    const key = prompts[0];
    const hit = this.textCache.get(key);
    if (hit) {
      // Refresh recency so the cache evicts the least recently used query.
      this.textCache.delete(key);
      this.textCache.set(key, hit);
      return hit;
    }
    const inputs = this.tokenizer(prompts, {padding: true, truncation: true});
    let output;
    try {
      output = await this.textModel(inputs);
      const embeds = output.text_embeds;
      const size = embeds.dims[1];
      const embedding = meanEmbedding(
        prompts.map((_, i) => embeds.data.subarray(i * size, (i + 1) * size))
      );
      this.textCache.set(key, embedding);
      if (this.textCache.size > TEXT_CACHE_SIZE) {
        this.textCache.delete(this.textCache.keys().next().value);
      }
      return embedding;
    } finally {
      disposeAll(output);
      disposeAll(inputs);
    }
  }

  async embedTiles(image, tiles) {
    const {RawImage} = this.tf;
    const frame = new RawImage(image.data, image.width, image.height, 4).rgb();
    const crops = await Promise.all(
      tiles.map(({x, y, side}) =>
        frame.crop([x, y, x + side - 1, y + side - 1])
      )
    );
    let inputs;
    let output;
    try {
      inputs = await this.processor(crops);
      output = await this.visionModel(inputs);
      const embeds = output.image_embeds;
      const size = embeds.dims[1];
      const data = embeds.data;
      return tiles.map((_, i) =>
        Float32Array.from(data.subarray(i * size, (i + 1) * size))
      );
    } finally {
      disposeAll(output);
      disposeAll(inputs);
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
      this.active.abort.abort(new Error('The search worker was disposed.'));
      await this.active.promise;
    }
    try {
      await this.textModel?.dispose?.();
      await this.visionModel?.dispose?.();
      this.textModel = null;
      this.visionModel = null;
      this.tokenizer = null;
      this.processor = null;
      this.backgrounds = null;
      this.textCache.clear();
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

/** Frees the tensors in a model input or output record. */
function disposeAll(record) {
  if (!record) return;
  for (const value of Object.values(record)) value?.dispose?.();
}
