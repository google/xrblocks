// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';

import {
  MAX_INPUT_TOKENS,
  MAX_NEW_TOKENS,
  TranslationRuntime,
  maxNewTokens,
  stripTargetTags,
} from './TranslationRuntime.js';
import {CACHE_NAME} from './modelConfig.js';
import {TRANSLATION_DTYPE, getLanguage} from './translationConfig.js';

type Message = Record<string, unknown>;

class FakeTensor {
  constructor(
    public type: string,
    public data: BigInt64Array,
    public dims: number[]
  ) {}
  dispose = vi.fn();
}

function fakeTf({decoded = '  Hola mundo.  '} = {}) {
  const generate = vi.fn(async (options: Record<string, unknown>) => ({
    options,
    dispose: vi.fn(),
  }));
  const model = {generate, dispose: vi.fn(async () => {})};
  const tokenizerArgs: unknown[] = [];
  const encoded: unknown[][] = [];
  class MarianTokenizer {
    constructor(...args: unknown[]) {
      tokenizerArgs.push(...args);
      const tokenize = (...call: unknown[]) => {
        encoded.push(call);
        return {
          input_ids: new FakeTensor(
            'int64',
            BigInt64Array.from([7n, 8n, 0n]),
            [1, 3]
          ),
          attention_mask: new FakeTensor(
            'int64',
            BigInt64Array.from([1n, 1n, 1n]),
            [1, 3]
          ),
        };
      };
      return Object.assign(tokenize, {
        batch_decode: () => [decoded],
        convert_tokens_to_ids: (tokens: string[]) =>
          tokens.map((token) => (token === '>>cmn_Hans<<' ? 5 : 1)),
      });
    }
  }
  const tf = {
    env: {backends: {onnx: {wasm: {}}}} as Record<string, unknown> & {
      backends: {onnx: {wasm: Record<string, unknown>}};
    },
    MarianTokenizer,
    Tensor: FakeTensor,
    MarianMTModel: {from_pretrained: vi.fn(async () => model)},
  };
  return {tf, model, generate, tokenizerArgs, encoded};
}

function setup({
  complete = true,
  decoded = undefined as string | undefined,
} = {}) {
  const messages: Message[] = [];
  const fake = fakeTf(decoded === undefined ? {} : {decoded});
  const store = {
    inspectCache: vi.fn(async () => ({complete, missingBytes: 0})),
    readCachedJSON: vi.fn(async (file: string) => ({file})),
    downloadAssets: vi.fn(async () => ({downloadedBytes: 3})),
    cacheOnlyFetch: vi.fn(),
  };
  let now = 0;
  const runtime = new TranslationRuntime({
    loadRuntime: vi.fn(async () => fake.tf),
    postMessage: (message: Message) => messages.push(message),
    probe: vi.fn(),
    store,
    now: () => (now += 5),
  });
  return {runtime, messages, store, ...fake};
}

describe('TranslationRuntime', () => {
  it('loads one pinned language from the cache only, then warms up', async () => {
    const {runtime, messages, tf, store, generate, tokenizerArgs} = setup();
    await runtime.handle({id: 1, type: 'load', language: 'fr'});
    expect(messages.at(-1)).toMatchObject({
      type: 'result',
      id: 1,
      result: {loadMs: expect.any(Number), warmupMs: expect.any(Number)},
    });
    const french = getLanguage('fr');
    expect(store.inspectCache).toHaveBeenCalledWith({assets: french.assets});
    expect(store.readCachedJSON).toHaveBeenCalledWith('tokenizer.json', {
      assets: french.assets,
      base: french.base,
    });
    expect(tokenizerArgs).toEqual([
      {file: 'tokenizer.json'},
      {file: 'tokenizer_config.json'},
    ]);
    expect(tf.env).toMatchObject({
      cacheKey: CACHE_NAME,
      allowLocalModels: false,
      fetch: store.cacheOnlyFetch,
    });
    expect(tf.env.backends.onnx.wasm).toMatchObject({
      proxy: false,
      numThreads: 1,
    });
    expect(tf.MarianMTModel.from_pretrained).toHaveBeenCalledWith(
      'Xenova/opus-mt-en-fr',
      {revision: french.revision, dtype: TRANSLATION_DTYPE, device: 'wasm'}
    );
    expect(generate).toHaveBeenCalledTimes(1);
    await runtime.handle({id: 2, type: 'load', language: 'de'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/already loaded/),
    });
  });

  it('never downloads during load and rejects unknown languages', async () => {
    const {runtime, messages, store, tf} = setup({complete: false});
    await runtime.handle({id: 1, type: 'load', language: 'es'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: 'Spanish is not cached. Choose Download.',
      fatal: false,
    });
    expect(store.downloadAssets).not.toHaveBeenCalled();
    expect(tf.MarianMTModel.from_pretrained).not.toHaveBeenCalled();
    await runtime.handle({id: 2, type: 'download', language: 'xx'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/Unknown translation language/),
    });
  });

  it('downloads exactly the chosen language manifest', async () => {
    const {runtime, messages, store} = setup();
    await runtime.handle({id: 1, type: 'download', language: 'de'});
    expect(store.downloadAssets).toHaveBeenCalledWith(
      expect.objectContaining({assets: getLanguage('de').assets})
    );
    expect(messages.at(-1)).toMatchObject({
      type: 'result',
      result: {downloadedBytes: 3},
    });
  });

  it('translates with greedy decoding and a bounded token budget', async () => {
    const {runtime, messages, generate, encoded} = setup();
    await runtime.handle({id: 1, type: 'load', language: 'es'});
    await runtime.handle({id: 2, type: 'translate', text: ' Hello world. '});
    expect(messages.at(-1)).toMatchObject({
      type: 'result',
      id: 2,
      result: {text: 'Hola mundo.', language: 'es', translateMs: 5},
    });
    expect(encoded.at(-1)).toEqual([
      'Hello world.',
      {truncation: true, max_length: 256},
    ]);
    expect(generate.mock.calls.at(-1)![0]).toMatchObject({
      max_new_tokens: 16,
      do_sample: false,
      num_beams: 1,
    });
    expect(maxNewTokens(500)).toBe(MAX_NEW_TOKENS);
  });

  it('prepends the Simplified Mandarin target token and strips leaked tags', async () => {
    const {runtime, messages, generate, encoded} = setup({
      decoded: ' >>cmn_Hans<< 早上好 。 ',
    });
    await runtime.handle({id: 1, type: 'load', language: 'zh'});
    await runtime.handle({id: 2, type: 'translate', text: 'Good morning.'});
    expect(encoded.at(-1)).toEqual([
      'Good morning.',
      {truncation: true, max_length: MAX_INPUT_TOKENS - 1},
    ]);
    const inputs = generate.mock.calls.at(-1)![0] as unknown as {
      input_ids: FakeTensor;
      attention_mask: FakeTensor;
      max_new_tokens: number;
    };
    expect([...inputs.input_ids.data]).toEqual([5n, 7n, 8n, 0n]);
    expect(inputs.input_ids.dims).toEqual([1, 4]);
    expect([...inputs.attention_mask.data]).toEqual([1n, 1n, 1n, 1n]);
    expect(inputs.max_new_tokens).toBe(maxNewTokens(4));
    expect(messages.at(-1)).toMatchObject({
      type: 'result',
      result: {text: '早上好。', language: 'zh'},
    });
  });

  it('strips Marian target tags from model output', () => {
    expect(stripTargetTags('>>cmn_Hans<< 你好')).toBe('你好');
    expect(stripTargetTags('你好 >>yue<<世界 ，再见 。')).toBe(
      '你好世界，再见。'
    );
    expect(stripTargetTags('Hola, mundo.')).toBe('Hola, mundo.');
  });

  it('validates text and requires a loaded model', async () => {
    const {runtime, messages} = setup();
    await runtime.handle({id: 1, type: 'translate', text: 'Hi.'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/Load a translation model/),
    });
    await runtime.handle({id: 2, type: 'load', language: 'es'});
    for (const [id, text] of [
      [3, '   '],
      [4, 'x'.repeat(1001)],
      [5, 42],
    ] as const) {
      await runtime.handle({id, type: 'translate', text});
      expect(messages.at(-1)).toMatchObject({
        type: 'error',
        id,
        message: 'Invalid text to translate.',
      });
    }
  });

  it('unloads the model but keeps serving the next language', async () => {
    const {runtime, messages, model, tf} = setup();
    await runtime.handle({id: 1, type: 'load', language: 'es'});
    await runtime.handle({id: 2, type: 'unload'});
    expect(model.dispose).toHaveBeenCalledOnce();
    expect(messages.at(-1)).toMatchObject({type: 'result', id: 2});
    expect(runtime.model).toBeNull();
    await runtime.handle({id: 3, type: 'translate', text: 'Hi.'});
    expect(messages.at(-1)).toMatchObject({type: 'error', id: 3});
    await runtime.handle({id: 4, type: 'load', language: 'de'});
    expect(messages.at(-1)).toMatchObject({type: 'result', id: 4});
    expect(tf.MarianMTModel.from_pretrained).toHaveBeenLastCalledWith(
      getLanguage('de').model,
      expect.objectContaining({revision: getLanguage('de').revision})
    );
    await runtime.handle({id: 5, type: 'unload'});
    await runtime.handle({id: 6, type: 'unload'});
    expect(messages.at(-1)).toMatchObject({type: 'result', id: 6});
  });

  it('disposes the loaded model', async () => {
    const {runtime, messages, model} = setup();
    await runtime.handle({id: 1, type: 'load', language: 'es'});
    await runtime.handle({id: 2, type: 'dispose'});
    expect(model.dispose).toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({type: 'result', id: 2});
  });
});
