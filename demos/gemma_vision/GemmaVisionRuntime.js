import {CACHE_NAME, DEFAULT_MODEL, getModel} from './modelConfig.js';
import * as modelStore from './modelStore.js';
import {
  assertContextBudget,
  MAX_NEW_TOKENS,
  validateQuestion,
} from './conversation.js';
import {MAX_IMAGE_EDGE} from './image.js';
import {ADAPTERS} from './modelAdapters.js';

export async function checkCapabilities() {
  if (!globalThis.isSecureContext || !navigator.gpu) {
    throw new Error('Use desktop Chrome with WebGPU on HTTPS or localhost.');
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter?.features.has('shader-f16')) {
    throw new Error('q4f16 models require a WebGPU adapter with shader-f16.');
  }
  if (
    typeof OffscreenCanvas === 'undefined' ||
    !new OffscreenCanvas(1, 1).getContext('2d') ||
    typeof createImageBitmap !== 'function'
  ) {
    throw new Error('Image processing is unavailable in this browser worker.');
  }
}

export class GemmaVisionRuntime {
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
    this.modelInfo = null;
    this.image = null;
    this.history = [];
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
      this.error(id, new Error('The vision worker has been disposed.'));
      return Promise.resolve();
    }
    if (message.type === 'stop') return this.stop(message);
    if (message.type === 'dispose') return this.dispose(id);
    if (this.active) {
      this.error(id, new Error('The vision worker is busy.'));
      return Promise.resolve();
    }
    const operation = {id, interrupted: false, stopping: null, promise: null};
    this.active = operation;
    operation.promise = Promise.resolve()
      .then(async () => {
        switch (message.type) {
          case 'check':
            await this.probe();
            return {};
          case 'load':
            return this.load(
              message.modelKey ?? DEFAULT_MODEL,
              message.allowDownload === true,
              operation
            );
          case 'image':
            return this.setImage(message);
          case 'generate':
            return this.generate(message, operation);
          case 'clear':
            this.history = [];
            return {};
          default:
            throw new Error(`Unknown vision operation: ${message.type}`);
        }
      })
      .then(
        (result) => this.post({type: 'result', id, result}),
        (error) => this.error(id, error)
      )
      .finally(() => {
        this.active = null;
      });
    return operation.promise;
  }

  /**
   * Load one model at a time. Switching disposes the previous model in this
   * worker and reuses the imported runtime, so it also works offline.
   */
  async load(modelKey, allowDownload, operation) {
    const info = getModel(modelKey);
    if (this.model && this.modelInfo === info) {
      throw new Error(`${info.name} is already loaded.`);
    }
    // Any failed switch leaves no model loaded, matching the client state.
    await this.unloadModel();
    await this.probe();
    const cached = await this.store.inspectCache(info);
    if (!cached.complete && !allowDownload) {
      throw new Error(`Download ${info.name} first; its cache is incomplete.`);
    }
    const started = this.now();
    const tf = (this.tf ??= await this.loadRuntime());
    tf.env.cacheKey = CACHE_NAME;
    tf.env.useBrowserCache = true;
    tf.env.allowLocalModels = !allowDownload;
    tf.env.allowRemoteModels = allowDownload;
    tf.env.fetch = this.store.createGuardedFetch(allowDownload, info);
    tf.env.backends.onnx.wasm.proxy = false;
    tf.env.backends.onnx.wasm.numThreads = 1;
    const progress = (event) =>
      this.post({type: 'progress', id: operation.id, event});
    const assets = await this.store.loadProcessorAssets({
      model: info,
      allowDownload,
      onProgress: progress,
    });
    const adapter = ADAPTERS[info.family];
    this.tokenizer = adapter.createTokenizer(tf, assets);
    this.assets = assets;
    this.model = await adapter.modelClass(tf).from_pretrained(info.modelId, {
      revision: info.revision,
      dtype: 'q4f16',
      device: 'webgpu',
      local_files_only: !allowDownload,
      progress_callback: progress,
    });
    this.modelInfo = info;
    const saved = await this.store.inspectCache(info);
    return {
      modelKey: info.key,
      cached: saved.complete,
      cacheWarning: saved.complete
        ? ''
        : 'Loaded for this session; the model was not fully saved. Check browser storage.',
      loadMs: this.now() - started,
    };
  }

  setImage({imageId, width, height, buffer}) {
    if (
      !Number.isSafeInteger(imageId) ||
      imageId < 1 ||
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
    this.image = {
      imageId,
      width,
      height,
      pixels: new Uint8ClampedArray(buffer),
    };
    this.history = [];
    return {imageId};
  }

  async generate({question, imageId, imageBudget}, operation) {
    if (!this.model) throw new Error('Load a model before asking a question.');
    if (!this.image || this.image.imageId !== imageId) {
      throw new Error('Capture an image before asking about it.');
    }
    const info = this.modelInfo;
    imageBudget ??= info.imageBudget;
    if (!info.imageBudgets.includes(imageBudget)) {
      throw new Error('Unsupported image-token budget.');
    }
    question = validateQuestion(question);
    const {tf} = this;
    const adapter = ADAPTERS[info.family];
    const eosTokens = new Set(info.eosTokens);
    const processor = adapter.createProcessor(
      tf,
      {tokenizer: this.tokenizer, assets: this.assets},
      imageBudget
    );
    const prompt = adapter.prompt(processor, this.history, question);
    operation.stopping = new tf.InterruptableStoppingCriteria();
    const {pixels, width, height} = this.image;
    const started = this.now();
    const inputs = await adapter.process(
      processor,
      prompt,
      new tf.RawImage(pixels, width, height, 4)
    );
    let output;
    let text = '';
    let generatedTokens = 0;
    let firstToken = null;
    let lastToken = null;
    const preprocessMs = this.now() - started;
    try {
      const inputTokens = inputs.input_ids.dims.at(-1);
      assertContextBudget(inputTokens);
      if (operation.interrupted) {
        return {
          text,
          interrupted: true,
          generatedTokens,
          tokensPerSecond: null,
        };
      }
      const streamer = new tf.TextStreamer(this.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (chunk) => {
          if (operation.interrupted || this.closing) return;
          text += chunk;
          this.post({type: 'delta', id: operation.id, text: chunk});
        },
        token_callback_function: (tokens) => {
          for (const token of tokens) {
            if (eosTokens.has(Number(token))) continue;
            generatedTokens++;
            lastToken = this.now();
            firstToken ??= lastToken;
          }
        },
      });
      const generationStart = this.now();
      output = await this.model.generate({
        ...inputs,
        do_sample: false,
        num_beams: 1,
        max_new_tokens: MAX_NEW_TOKENS,
        streamer,
        stopping_criteria: operation.stopping,
      });
      const tokens = output.tolist()[0].slice(inputTokens);
      if (!operation.interrupted) {
        text = this.tokenizer
          .decode(tokens, {skip_special_tokens: true})
          .trim();
        if (!text) throw new Error(`${info.name} returned no visible answer.`);
        this.history.push({question, answer: text});
      }
      return {
        text,
        interrupted: operation.interrupted,
        truncated:
          tokens.length >= MAX_NEW_TOKENS &&
          !eosTokens.has(Number(tokens.at(-1))),
        generatedTokens,
        tokensPerSecond:
          generatedTokens > 1 && lastToken > firstToken
            ? ((generatedTokens - 1) * 1000) / (lastToken - firstToken)
            : null,
        preprocessMs,
        generationMs: this.now() - generationStart,
        inputTokens,
        imageBudget,
        imageTokens: inputs.num_soft_tokens_per_image?.[0],
        modelKey: info.key,
        pixelShape: inputs.pixel_values?.dims,
      };
    } finally {
      output?.dispose();
      for (const value of Object.values(inputs)) {
        if (typeof value?.dispose === 'function') value.dispose();
      }
    }
  }

  async stop({id, targetId}) {
    const operation = this.active;
    if (!operation || operation.id !== targetId) {
      this.post({type: 'result', id, result: {}});
      return;
    }
    operation.interrupted = true;
    operation.stopping?.interrupt();
    await operation.promise;
    this.post({type: 'result', id, result: {}});
  }

  async dispose(id) {
    this.closing = true;
    if (this.active) {
      this.active.interrupted = true;
      this.active.stopping?.interrupt();
      await this.active.promise;
    }
    try {
      await this.unloadModel();
      this.image = null;
      this.post({type: 'result', id, result: {}});
    } catch (error) {
      this.error(id, error);
    }
  }

  /** Release the loaded model and its per-model state; keep the capture. */
  async unloadModel() {
    const model = this.model;
    this.model = null;
    this.modelInfo = null;
    this.tokenizer = null;
    this.assets = null;
    this.history = [];
    await model?.dispose();
  }

  error(id, error) {
    this.post({
      type: 'error',
      id,
      message: error?.message ?? String(error),
      fatal: /device.*lost|out of memory|memory access|runtimeerror/i.test(
        `${error?.name}: ${error?.message}`
      ),
    });
  }
}
