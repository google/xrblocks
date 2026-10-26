// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';

import {CaptionsRuntime, maxNewTokens, PROGRESS_MS} from './CaptionsRuntime.js';
import {CACHE_NAME, MODEL_DTYPE, MODEL_ID, REVISION} from './modelConfig.js';

type Message = Record<string, unknown>;

function fakeTf() {
  const generate = vi.fn(async (options: Record<string, unknown>) => ({
    options,
    dispose: vi.fn(),
  }));
  const model = {generate, dispose: vi.fn(async () => {})};
  const tokenizerArgs: unknown[] = [];
  class PreTrainedTokenizer {
    constructor(...args: unknown[]) {
      tokenizerArgs.push(...args);
    }
    batch_decode() {
      return ['  hello world  '];
    }
  }
  class Tensor {
    dispose = vi.fn();
    constructor(
      public type: string,
      public data: Float32Array,
      public dims: number[]
    ) {}
  }
  const tf = {
    env: {backends: {onnx: {wasm: {}}}} as Record<string, unknown> & {
      backends: {onnx: {wasm: Record<string, unknown>}};
    },
    PreTrainedTokenizer,
    Tensor,
    MoonshineForConditionalGeneration: {
      from_pretrained: vi.fn(async () => model),
    },
  };
  return {tf, model, generate, tokenizerArgs};
}

function fakeStore(complete = true) {
  return {
    inspectCache: vi.fn(async () => ({complete})),
    readCachedJSON: vi.fn(async (file: string) => ({file})),
    downloadAssets: vi.fn(),
    cacheOnlyFetch: vi.fn(),
  };
}

function setup({complete = true} = {}) {
  const messages: Message[] = [];
  const fake = fakeTf();
  const store = fakeStore(complete);
  let now = 0;
  const runtime = new CaptionsRuntime({
    loadRuntime: vi.fn(async () => fake.tf),
    postMessage: (message: Message) => messages.push(message),
    probe: vi.fn(),
    store,
    now: () => (now += 5),
  });
  return {runtime, messages, store, ...fake, setNow: (v: number) => (now = v)};
}

describe('CaptionsRuntime', () => {
  it('loads from cache with pinned options, cache-only fetch and a warmup', async () => {
    const {runtime, messages, tf, store, generate, tokenizerArgs} = setup();
    await runtime.handle({id: 1, type: 'load'});
    expect(messages.at(-1)).toMatchObject({type: 'result', id: 1});
    const result = messages.at(-1)!.result as Record<string, number>;
    expect(result.loadMs).toBeGreaterThan(0);
    expect(result.warmupMs).toBeGreaterThan(0);
    expect(tf.env).toMatchObject({
      cacheKey: CACHE_NAME,
      useBrowserCache: true,
      useWasmCache: true,
      allowLocalModels: false,
      fetch: store.cacheOnlyFetch,
    });
    expect(tf.env.backends.onnx.wasm).toMatchObject({
      proxy: false,
      numThreads: 1,
    });
    expect(tokenizerArgs).toEqual([
      {file: 'tokenizer.json'},
      {file: 'tokenizer_config.json'},
    ]);
    expect(
      tf.MoonshineForConditionalGeneration.from_pretrained
    ).toHaveBeenCalledWith(MODEL_ID, {
      revision: REVISION,
      dtype: MODEL_DTYPE,
      device: 'wasm',
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toMatchObject({
      do_sample: false,
      num_beams: 1,
    });
  });

  it('refuses to load an incomplete cache and never downloads during load', async () => {
    const {runtime, messages, store, tf} = setup({complete: false});
    await runtime.handle({id: 1, type: 'load'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      id: 1,
      message: expect.stringMatching(/not cached/),
      fatal: false,
    });
    expect(store.downloadAssets).not.toHaveBeenCalled();
    expect(
      tf.MoonshineForConditionalGeneration.from_pretrained
    ).not.toHaveBeenCalled();
  });

  it('transcribes with greedy decoding and a length-scaled token cap', async () => {
    const {runtime, messages, generate} = setup();
    await runtime.handle({id: 1, type: 'load'});
    const audio = new Float32Array(16000 * 2.5);
    await runtime.handle({id: 2, type: 'transcribe', audio});
    expect(messages.at(-1)).toMatchObject({
      type: 'result',
      id: 2,
      result: {text: 'hello world', audioMs: 2500},
    });
    const options = generate.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(options.max_new_tokens).toBe(15);
    expect(options.do_sample).toBe(false);
    expect((options.input_values as {dims: number[]}).dims).toEqual([1, 40000]);
    expect(maxNewTokens(100)).toBe(8);
  });

  it('validates audio and requires a loaded model', async () => {
    const {runtime, messages} = setup();
    await runtime.handle({
      id: 1,
      type: 'transcribe',
      audio: new Float32Array(10),
    });
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/Load/),
    });
    await runtime.handle({id: 2, type: 'load'});
    for (const [id, audio] of [
      [3, new Float32Array(0)],
      [4, new Float32Array(16000 * 31)],
      [5, [1, 2, 3]],
    ] as const) {
      await runtime.handle({id, type: 'transcribe', audio});
      expect(messages.at(-1)).toMatchObject({
        type: 'error',
        id,
        message: expect.stringMatching(/Invalid audio/),
      });
    }
  });

  it('rejects invalid IDs, unknown operations and concurrent work', async () => {
    const {runtime, messages} = setup();
    await runtime.handle({id: 0, type: 'check'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/Invalid worker request/),
    });
    await runtime.handle({id: 1, type: 'nope'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      id: 1,
      message: expect.stringMatching(/Unknown/),
    });
    const loading = runtime.handle({id: 2, type: 'load'});
    await runtime.handle({id: 3, type: 'check'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      id: 3,
      message: expect.stringMatching(/busy/),
    });
    await loading;
  });

  it('throttles download progress and cancels cooperatively', async () => {
    const {runtime, messages, store, setNow} = setup();
    let signal: AbortSignal | undefined;
    store.downloadAssets.mockImplementation(
      async ({
        onProgress,
        signal: s,
      }: {
        onProgress: (e: unknown) => void;
        signal: AbortSignal;
      }) => {
        signal = s;
        setNow(1000);
        for (let i = 0; i < 50; i++)
          onProgress({loaded: i, total: 100, file: 'a'});
        await new Promise((resolve) => setTimeout(resolve, 5));
        s.throwIfAborted();
        return {downloadedBytes: 100};
      }
    );
    const download = runtime.handle({id: 1, type: 'download'});
    await new Promise((resolve) => setTimeout(resolve, 0));
    const progress = messages.filter((m) => m.type === 'progress');
    // 50 events 5 ms apart at a 100 ms throttle.
    expect(progress.length).toBeLessThanOrEqual(
      Math.ceil((50 * 5) / PROGRESS_MS) + 1
    );
    await runtime.handle({id: 2, type: 'stop', targetId: 1});
    await download;
    expect(signal?.aborted).toBe(true);
    expect(
      messages.find((m) => m.id === 1 && m.type === 'error')
    ).toMatchObject({
      message: 'Download canceled.',
      fatal: false,
    });
    expect(messages.at(-1)).toMatchObject({type: 'result', id: 2});
  });

  it('flags runtime crashes as fatal and disposes the model', async () => {
    const {runtime, messages, generate, model} = setup();
    await runtime.handle({id: 1, type: 'load'});
    generate.mockRejectedValueOnce(
      Object.assign(new Error('Aborted()'), {name: 'RuntimeError'})
    );
    await runtime.handle({
      id: 2,
      type: 'transcribe',
      audio: new Float32Array(100),
    });
    expect(messages.at(-1)).toMatchObject({type: 'error', id: 2, fatal: true});
    await runtime.handle({id: 3, type: 'dispose'});
    expect(model.dispose).toHaveBeenCalled();
    expect(messages.at(-1)).toMatchObject({type: 'result', id: 3});
    await runtime.handle({id: 4, type: 'check'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/disposed/),
    });
  });
});
