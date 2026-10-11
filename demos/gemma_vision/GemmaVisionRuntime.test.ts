import {describe, expect, it, vi} from 'vitest';
import {GemmaVisionRuntime} from './GemmaVisionRuntime.js';
import {MODELS, REVISION} from './modelConfig.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return {promise, resolve};
}

function fixture() {
  const replies: Array<{type: string; id: number; [key: string]: unknown}> = [];
  const disposeInput = vi.fn();
  const disposeOutput = vi.fn();
  const process = vi.fn(async () => ({
    input_ids: {dims: [1, 300], dispose: disposeInput},
    pixel_values: {dims: [1, 2520, 768], dispose: disposeInput},
    num_soft_tokens_per_image: [266],
  }));
  const template = vi.fn(() => 'templated image question');
  const budgets: number[] = [];
  const model = {
    dispose: vi.fn(),
    generate: vi.fn(async (options) => {
      options.streamer.options.token_callback_function([12n]);
      options.streamer.options.callback_function('A red ');
      options.streamer.options.token_callback_function([13n, 14n, 1n]);
      options.streamer.options.callback_function('chair.');
      return {
        tolist: () => [Array(300).fill(0n).concat([12n, 13n, 14n, 1n])],
        dispose: disposeOutput,
      };
    }),
  };
  const liteModel = {
    dispose: vi.fn(),
    generate: vi.fn(async (options) => {
      options.streamer.options.token_callback_function([7n]);
      options.streamer.options.callback_function('A sign.');
      options.streamer.options.token_callback_function([49279n]);
      return {
        tolist: () => [Array(300).fill(0n).concat([7n, 49279n])],
        dispose: vi.fn(),
      };
    }),
  };
  const liteTemplate = vi.fn(() => 'lite prompt');
  const liteProcess = vi.fn(async () => ({
    input_ids: {dims: [1, 300], dispose: vi.fn()},
    pixel_values: {dims: [1, 5, 3, 512, 512], dispose: vi.fn()},
  }));
  const liteImageConfigs: Record<string, unknown>[] = [];
  const library = {
    env: {backends: {onnx: {wasm: {}}}},
    Idefics3ForConditionalGeneration: {
      from_pretrained: vi.fn(async () => liteModel),
    },
    GPT2Tokenizer: class {
      decode() {
        return 'A sign.';
      }
    },
    Idefics3ImageProcessor: class {
      constructor(config) {
        liteImageConfigs.push(config);
      }
    },
    Idefics3Processor: vi.fn(function () {
      return Object.assign(liteProcess, {apply_chat_template: liteTemplate});
    }),
    Gemma4ForConditionalGeneration: {
      from_pretrained: vi.fn(async () => model),
    },
    GemmaTokenizer: class {
      decode() {
        return 'A red chair.';
      }
    },
    Gemma4ImageProcessor: class {
      constructor(config) {
        budgets.push(config.max_soft_tokens);
      }
    },
    Gemma4Processor: vi.fn(function () {
      return Object.assign(process, {apply_chat_template: template});
    }),
    RawImage: class {
      constructor(
        public data,
        public width,
        public height,
        public channels
      ) {}
    },
    TextStreamer: class {
      constructor(
        public tokenizer,
        public options
      ) {}
    },
    InterruptableStoppingCriteria: class {
      interrupted = false;
      interrupt() {
        this.interrupted = true;
      }
    },
  };
  const store = {
    inspectCache: vi.fn(async () => ({complete: true, missingBytes: 0})),
    loadProcessorAssets: vi.fn(async ({model = MODELS.gemma} = {}) =>
      model === MODELS.lite
        ? {
            processorConfig: {image_seq_len: 64},
            imageProcessorConfig: {do_image_splitting: true},
            tokenizerJSON: {},
            tokenizerConfig: {},
            chatTemplate: {chat_template: 'lite template'},
          }
        : {
            processorConfig: {image_processor: {max_soft_tokens: 280}},
            tokenizerJSON: {},
            tokenizerConfig: {},
            chatTemplate: 'template',
          }
    ),
    createGuardedFetch: vi.fn(() => vi.fn()),
  };
  let clock = 0;
  const loadRuntime = vi.fn(async () => library);
  const runtime = new GemmaVisionRuntime({
    loadRuntime,
    postMessage: (reply) => replies.push(reply),
    probe: vi.fn(async () => {}),
    store,
    now: () => (clock += 10),
  });
  const call = (id: number, type: string, extra = {}) =>
    runtime.handle({id, type, ...extra});
  const capture = () =>
    call(2, 'image', {
      imageId: 1,
      width: 1,
      height: 1,
      buffer: new ArrayBuffer(4),
    });
  return {
    runtime,
    replies,
    model,
    liteModel,
    liteTemplate,
    liteProcess,
    liteImageConfigs,
    loadRuntime,
    library,
    store,
    process,
    template,
    budgets,
    disposeInput,
    disposeOutput,
    call,
    capture,
  };
}

describe('GemmaVisionRuntime', () => {
  it('does not load or fetch on construction or capture', async () => {
    const f = fixture();
    await f.capture();
    expect(
      f.library.Gemma4ForConditionalGeneration.from_pretrained
    ).not.toHaveBeenCalled();
    expect(f.store.loadProcessorAssets).not.toHaveBeenCalled();
  });

  it('requires explicit download consent when cache is incomplete', async () => {
    const f = fixture();
    f.store.inspectCache.mockResolvedValue({complete: false, missingBytes: 10});
    await f.call(1, 'load', {allowDownload: false});
    expect(f.replies.at(-1)).toMatchObject({type: 'error', id: 1});
    expect(
      f.library.Gemma4ForConditionalGeneration.from_pretrained
    ).not.toHaveBeenCalled();
  });

  it('pins model loading and does not use AutoProcessor discovery', async () => {
    const f = fixture();
    await f.call(1, 'load', {allowDownload: false});
    expect(
      f.library.Gemma4ForConditionalGeneration.from_pretrained
    ).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        revision: REVISION,
        dtype: 'q4f16',
        device: 'webgpu',
        local_files_only: true,
      })
    );
    expect(f.store.createGuardedFetch).toHaveBeenCalledWith(
      false,
      MODELS.gemma
    );
    expect(f.replies.at(-1)).toMatchObject({
      type: 'result',
      result: {cached: true},
    });
  });

  it('processes the actual image and counts tokens rather than text chunks', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    await f.call(3, 'generate', {imageId: 1, question: 'What is this?'});
    expect(f.template).toHaveBeenCalledWith(
      [
        {
          role: 'user',
          content: [{type: 'image'}, {type: 'text', text: 'What is this?'}],
        },
      ],
      {tokenize: false, add_generation_prompt: true, enable_thinking: false}
    );
    expect(f.process).toHaveBeenCalledWith(
      'templated image question',
      expect.objectContaining({width: 1, height: 1, channels: 4}),
      null,
      {add_special_tokens: false}
    );
    expect(f.model.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        do_sample: false,
        num_beams: 1,
        max_new_tokens: 128,
      })
    );
    expect(f.replies.at(-1)).toMatchObject({
      type: 'result',
      id: 3,
      result: {text: 'A red chair.', generatedTokens: 3, interrupted: false},
    });
    expect(f.disposeInput).toHaveBeenCalledTimes(2);
    expect(f.disposeOutput).toHaveBeenCalledOnce();
  });

  it.each([70, 140, 280])(
    'uses public constructor options for budget %i',
    async (budget) => {
      const f = fixture();
      await f.call(1, 'load');
      await f.capture();
      await f.call(3, 'generate', {
        imageId: 1,
        question: 'Read this',
        imageBudget: budget,
      });
      expect(f.budgets).toEqual([budget]);
    }
  );

  it('retains completed turns only and resets them on a new capture', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    await f.call(3, 'generate', {imageId: 1, question: 'Describe'});
    await f.call(4, 'generate', {imageId: 1, question: 'What color?'});
    expect(f.template.mock.calls[1][0]).toHaveLength(3);
    await f.call(5, 'image', {
      imageId: 2,
      width: 1,
      height: 1,
      buffer: new ArrayBuffer(4),
    });
    await f.call(6, 'generate', {imageId: 2, question: 'Describe again'});
    expect(f.template.mock.calls[2][0]).toHaveLength(1);
  });

  it('rejects a stale image, invalid budget and unknown operation', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    for (const extra of [
      {imageId: 9, question: 'Describe'},
      {imageId: 1, question: 'Describe', imageBudget: 42},
    ]) {
      await f.call(3, 'generate', extra);
      expect(f.replies.at(-1)?.type).toBe('error');
    }
    await f.call(4, 'unknown');
    expect(f.replies.at(-1)?.type).toBe('error');
    expect(f.model.generate).not.toHaveBeenCalled();
  });

  it('serializes work and stops during preprocessing without invoking the model', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    const pause = deferred();
    const input = {input_ids: {dims: [1, 300], dispose: vi.fn()}};
    f.process.mockImplementation(async () => {
      await pause.promise;
      return input;
    });
    const pending = f.call(3, 'generate', {imageId: 1, question: 'Describe'});
    await Promise.resolve();
    await f.call(4, 'image', {
      imageId: 2,
      width: 1,
      height: 1,
      buffer: new ArrayBuffer(4),
    });
    expect(f.replies.at(-1)).toMatchObject({type: 'error', id: 4});
    const stopping = f.call(5, 'stop', {targetId: 3});
    pause.resolve();
    await Promise.all([pending, stopping]);
    expect(f.model.generate).not.toHaveBeenCalled();
    expect(f.replies).toContainEqual(
      expect.objectContaining({
        id: 3,
        type: 'result',
        result: expect.objectContaining({interrupted: true}),
      })
    );
    expect(input.input_ids.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the model once and visibly rejects later operations', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    await f.call(3, 'dispose');
    await f.call(4, 'generate', {imageId: 1, question: 'Describe'});
    expect(f.model.dispose).toHaveBeenCalledOnce();
    expect(f.replies.at(-1)).toMatchObject({id: 4, type: 'error'});
  });

  it('keeps an interrupted reply out of history and ignores late streamed text', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    const entered = deferred();
    const release = deferred();
    const output = {
      tolist: () => [Array(300).fill(0n).concat([12n])],
      dispose: vi.fn(),
    };
    f.model.generate.mockImplementation(async (options) => {
      options.streamer.options.callback_function('Partial answer');
      entered.resolve();
      await release.promise;
      options.streamer.options.callback_function(' that should be ignored');
      return output;
    });
    const pending = f.call(3, 'generate', {imageId: 1, question: 'Describe'});
    await entered.promise;
    const stopping = f.call(4, 'stop', {targetId: 3});
    release.resolve();
    await Promise.all([pending, stopping]);
    expect(f.runtime.history).toEqual([]);
    expect(f.replies.filter((reply) => reply.type === 'delta')).toEqual([
      {type: 'delta', id: 3, text: 'Partial answer'},
    ]);
    expect(output.dispose).toHaveBeenCalledOnce();
    expect(f.replies).toContainEqual(
      expect.objectContaining({
        id: 3,
        result: expect.objectContaining({
          text: 'Partial answer',
          interrupted: true,
        }),
      })
    );
  });

  it('rejects expanded context overflow and releases processor tensors', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    f.process.mockResolvedValue({
      input_ids: {dims: [1, 4096], dispose: f.disposeInput},
      pixel_values: {dims: [1, 1260, 768], dispose: f.disposeInput},
      num_soft_tokens_per_image: [121],
    });
    await f.call(3, 'generate', {imageId: 1, question: 'Describe'});
    expect(f.replies.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('Context budget'),
    });
    expect(f.model.generate).not.toHaveBeenCalled();
    expect(f.disposeInput).toHaveBeenCalledTimes(2);
    expect(f.runtime.history).toEqual([]);
  });

  it('releases inputs on generation failure without saving a completed answer', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    f.model.generate.mockRejectedValue(new Error('GPU device lost'));
    await f.call(3, 'generate', {imageId: 1, question: 'Describe'});
    expect(f.replies.at(-1)).toMatchObject({type: 'error', fatal: true});
    expect(f.disposeInput).toHaveBeenCalledTimes(2);
    expect(f.runtime.history).toEqual([]);
  });

  it('does not confuse a loaded model with a successfully persisted cache', async () => {
    const f = fixture();
    f.store.inspectCache
      .mockResolvedValueOnce({complete: false, missingBytes: 10})
      .mockResolvedValueOnce({complete: false, missingBytes: 10});
    await f.call(1, 'load', {allowDownload: true});
    expect(f.replies.at(-1)).toMatchObject({
      type: 'result',
      result: {
        cached: false,
        cacheWarning: expect.stringContaining('not fully saved'),
      },
    });
    expect(
      f.library.Gemma4ForConditionalGeneration.from_pretrained
    ).toHaveBeenCalledOnce();
  });

  it('loads Lite with its own pinned classes, files and prompt shape', async () => {
    const f = fixture();
    await f.call(1, 'load', {modelKey: 'lite'});
    expect(
      f.library.Idefics3ForConditionalGeneration.from_pretrained
    ).toHaveBeenCalledWith(
      MODELS.lite.modelId,
      expect.objectContaining({
        revision: MODELS.lite.revision,
        dtype: 'q4f16',
        device: 'webgpu',
        local_files_only: true,
      })
    );
    expect(
      f.library.Gemma4ForConditionalGeneration.from_pretrained
    ).not.toHaveBeenCalled();
    expect(f.store.inspectCache).toHaveBeenCalledWith(MODELS.lite);
    expect(f.store.createGuardedFetch).toHaveBeenCalledWith(false, MODELS.lite);
    expect(f.replies.at(-1)).toMatchObject({
      type: 'result',
      result: {modelKey: 'lite', cached: true},
    });
    await f.capture();
    await f.call(3, 'generate', {imageId: 1, question: 'Describe'});
    await f.call(4, 'generate', {imageId: 1, question: 'What color?'});
    expect(f.liteTemplate.mock.calls[1]).toEqual([
      [
        {
          role: 'user',
          content: [{type: 'image'}, {type: 'text', text: 'Describe'}],
        },
        {role: 'assistant', content: [{type: 'text', text: 'A sign.'}]},
        {role: 'user', content: [{type: 'text', text: 'What color?'}]},
      ],
      {tokenize: false, add_generation_prompt: true},
    ]);
    expect(f.liteProcess).toHaveBeenCalledWith(
      'lite prompt',
      expect.objectContaining({width: 1, height: 1, channels: 4})
    );
    expect(f.library.Idefics3Processor).toHaveBeenCalledWith(
      {image_seq_len: 64},
      expect.anything(),
      'lite template'
    );
    expect(f.replies.at(-1)).toMatchObject({
      type: 'result',
      id: 4,
      result: {
        text: 'A sign.',
        generatedTokens: 1,
        truncated: false,
        imageBudget: 64,
        modelKey: 'lite',
      },
    });
  });

  it.each([
    [64, false],
    [320, true],
  ])('maps Lite budget %i to tiling %s', async (budget, tiled) => {
    const f = fixture();
    await f.call(1, 'load', {modelKey: 'lite'});
    await f.capture();
    await f.call(3, 'generate', {
      imageId: 1,
      question: 'Read this',
      imageBudget: budget,
    });
    expect(f.liteImageConfigs).toEqual([
      {do_image_splitting: tiled, size: {longest_edge: 1024}},
    ]);
  });

  it('rejects Gemma budgets for Lite and unknown models', async () => {
    const f = fixture();
    await f.call(1, 'load', {modelKey: 'giant'});
    expect(f.replies.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('Unknown vision model'),
      fatal: false,
    });
    await f.call(2, 'load', {modelKey: 'lite'});
    await f.capture();
    await f.call(3, 'generate', {imageId: 1, question: 'x', imageBudget: 140});
    expect(f.replies.at(-1)).toMatchObject({type: 'error'});
    expect(f.liteModel.generate).not.toHaveBeenCalled();
  });

  it('disposes the old model before switching and reuses the imported runtime', async () => {
    const f = fixture();
    const order: string[] = [];
    f.model.dispose.mockImplementation(() => order.push('dispose gemma'));
    f.library.Idefics3ForConditionalGeneration.from_pretrained.mockImplementation(
      async () => {
        order.push('load lite');
        return f.liteModel;
      }
    );
    await f.call(1, 'load');
    await f.capture();
    await f.call(3, 'generate', {imageId: 1, question: 'Describe'});
    await f.call(4, 'load', {modelKey: 'lite'});
    expect(order).toEqual(['dispose gemma', 'load lite']);
    expect(f.loadRuntime).toHaveBeenCalledOnce();
    expect(f.runtime.history).toEqual([]);
    await f.call(5, 'generate', {imageId: 1, question: 'Describe'});
    expect(f.replies.at(-1)).toMatchObject({type: 'result', id: 5});
    await f.call(6, 'load', {modelKey: 'gemma'});
    expect(f.liteModel.dispose).toHaveBeenCalledOnce();
    expect(f.loadRuntime).toHaveBeenCalledOnce();
    await f.call(7, 'load', {modelKey: 'gemma'});
    expect(f.replies.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('already loaded'),
    });
    expect(f.model.dispose).toHaveBeenCalledOnce();
  });

  it('leaves no model loaded when a cache-only switch finds missing files', async () => {
    const f = fixture();
    await f.call(1, 'load');
    await f.capture();
    f.store.inspectCache.mockResolvedValueOnce({
      complete: false,
      missingBytes: 10,
    });
    await f.call(3, 'load', {modelKey: 'lite', allowDownload: false});
    expect(f.replies.at(-1)).toMatchObject({type: 'error', fatal: false});
    expect(
      f.library.Idefics3ForConditionalGeneration.from_pretrained
    ).not.toHaveBeenCalled();
    expect(f.model.dispose).toHaveBeenCalledOnce();
    await f.call(4, 'generate', {imageId: 1, question: 'Describe'});
    expect(f.replies.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringContaining('Load a model'),
    });
    await f.call(5, 'load');
    await f.call(6, 'generate', {imageId: 1, question: 'Describe'});
    expect(f.replies.at(-1)).toMatchObject({type: 'result', id: 6});
  });
});
