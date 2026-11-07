// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';

import {
  MAX_TILES,
  PROGRESS_MS,
  SearchRuntime,
  TEXT_CACHE_SIZE,
  validateFrame,
} from './SearchRuntime.js';
import {CACHE_NAME, MODEL_DTYPE, MODEL_ID, REVISION} from './modelConfig.js';
import {BACKGROUND_LABELS, TEMPLATES} from './search.js';

type Message = Record<string, unknown>;
type Crop = {x0: number; y0: number; x1: number; y1: number};

const DIM = 4;
/** The fake scene has a cup in the 100 x 100 px square at the origin. */
const CUP = {x0: 0, y0: 0, x1: 100, y1: 100};

function tensor(rows: number[][]) {
  return {
    data: Float32Array.from(rows.flat()),
    dims: [rows.length, DIM],
    dispose: vi.fn(),
  };
}

/** Text axis 0 is "cup", axis 1 is every background caption. */
function textVector(prompt: string) {
  return prompt.includes('cup') ? [1, 0, 0, 0] : [0, 1, 0, 0.1];
}

/** Crops mostly inside the cup square look like the cup, others like a wall. */
function imageVector({x0, y0, x1, y1}: Crop) {
  const w = Math.max(0, Math.min(x1 + 1, CUP.x1) - Math.max(x0, CUP.x0));
  const h = Math.max(0, Math.min(y1 + 1, CUP.y1) - Math.max(y0, CUP.y0));
  const share = (w * h) / ((x1 - x0 + 1) * (y1 - y0 + 1));
  return [share, 1 - share, 0, 0.05];
}

function fakeTf() {
  const tokenizerArgs: unknown[] = [];
  const processorArgs: unknown[] = [];
  const textCalls: string[][] = [];
  const visionCalls: Crop[][] = [];
  const inputs: {dispose: ReturnType<typeof vi.fn>}[] = [];
  class CLIPTokenizer {
    constructor(...args: unknown[]) {
      tokenizerArgs.push(...args);
      return ((texts: string[], options: unknown) => {
        expect(options).toEqual({padding: true, truncation: true});
        const input = {dispose: vi.fn()};
        inputs.push(input);
        return {input_ids: input, texts};
      }) as unknown as CLIPTokenizer;
    }
  }
  class CLIPImageProcessor {
    constructor(...args: unknown[]) {
      processorArgs.push(...args);
      return (async (crops: Crop[]) => {
        const input = {dispose: vi.fn()};
        inputs.push(input);
        return {pixel_values: input, crops};
      }) as unknown as CLIPImageProcessor;
    }
  }
  class RawImage {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
      public channels: number
    ) {}
    rgb() {
      return this;
    }
    async crop([x0, y0, x1, y1]: number[]) {
      return {x0, y0, x1, y1};
    }
  }
  const textModel = Object.assign(
    async ({texts}: {texts: string[]}) => {
      textCalls.push(texts);
      return {text_embeds: tensor(texts.map(textVector))};
    },
    {dispose: vi.fn(async () => {})}
  );
  const visionModel = Object.assign(
    async ({crops}: {crops: Crop[]}) => {
      visionCalls.push(crops);
      return {image_embeds: tensor(crops.map(imageVector))};
    },
    {dispose: vi.fn(async () => {})}
  );
  const tf = {
    env: {backends: {onnx: {wasm: {}}}} as Record<string, unknown> & {
      backends: {onnx: {wasm: Record<string, unknown>}};
    },
    CLIPTokenizer,
    CLIPImageProcessor,
    RawImage,
    CLIPTextModelWithProjection: {
      from_pretrained: vi.fn(async () => textModel),
    },
    CLIPVisionModelWithProjection: {
      from_pretrained: vi.fn(async () => visionModel),
    },
  };
  return {
    tf,
    textModel,
    visionModel,
    tokenizerArgs,
    processorArgs,
    textCalls,
    visionCalls,
    inputs,
  };
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
  const runtime = new SearchRuntime({
    loadRuntime: vi.fn(async () => fake.tf),
    postMessage: (message: Message) => messages.push(message),
    probe: vi.fn(),
    store,
    now: () => (now += 5),
  });
  return {runtime, messages, store, ...fake, setNow: (v: number) => (now = v)};
}

async function loaded() {
  const context = setup();
  await context.runtime.handle({id: 1, type: 'load'});
  expect(context.messages.at(-1)).toMatchObject({type: 'result', id: 1});
  return context;
}

function frame(width = 200, height = 200) {
  return {data: new Uint8ClampedArray(width * height * 4), width, height};
}

const TILES = [
  {x: 0, y: 0, side: 100},
  {x: 100, y: 0, side: 100},
  {x: 0, y: 100, side: 100},
  {x: 100, y: 100, side: 100},
];

describe('SearchRuntime', () => {
  it('loads from cache with pinned options, cache-only fetch and a warmup', async () => {
    const {runtime, messages, tf, store, tokenizerArgs, processorArgs} =
      await loaded();
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
    expect(processorArgs).toEqual([{file: 'preprocessor_config.json'}]);
    const options = {revision: REVISION, dtype: MODEL_DTYPE, device: 'wasm'};
    expect(tf.CLIPTextModelWithProjection.from_pretrained).toHaveBeenCalledWith(
      MODEL_ID,
      options
    );
    expect(
      tf.CLIPVisionModelWithProjection.from_pretrained
    ).toHaveBeenCalledWith(MODEL_ID, options);
    expect(runtime.loaded).toBe(true);
  });

  it('embeds every background caption once and warms up the vision model', async () => {
    const {runtime, textCalls, visionCalls, inputs} = await loaded();
    expect(textCalls).toHaveLength(BACKGROUND_LABELS.length);
    for (const call of textCalls) expect(call).toHaveLength(TEMPLATES.length);
    expect(visionCalls).toEqual([[{x0: 0, y0: 0, x1: 223, y1: 223}]]);
    expect(runtime.backgrounds).toHaveLength(BACKGROUND_LABELS.length);
    // Background captions are not user queries, so they do not fill the cache.
    expect(runtime.textCache.size).toBe(0);
    for (const input of inputs) expect(input.dispose).toHaveBeenCalled();
  });

  it('refuses to load an incomplete cache or load twice', async () => {
    const {runtime, messages} = setup({complete: false});
    await runtime.handle({id: 1, type: 'load'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/not cached/),
    });
    const ready = await loaded();
    await ready.runtime.handle({id: 2, type: 'load'});
    expect(ready.messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/already loaded/),
    });
  });

  it('scores crops and finds where the query beats the background', async () => {
    const {runtime, messages, visionCalls} = await loaded();
    await runtime.handle({
      id: 2,
      type: 'search',
      image: frame(),
      tiles: TILES,
      query: 'cup',
    });
    const {result} = messages.at(-1) as {
      result: {
        scores: number[];
        probabilities: number[];
        textMs: number;
        visionMs: number;
      };
    };
    expect(result.scores).toHaveLength(4);
    expect(result.probabilities).toHaveLength(4);
    expect(result.scores[0]).toBeGreaterThan(0.99);
    expect(Math.max(...result.scores.slice(1))).toBeLessThan(0.01);
    expect(result.probabilities[0]).toBeGreaterThan(0.99);
    expect(Math.max(...result.probabilities.slice(1))).toBeLessThan(0.01);
    expect(result.textMs).toBeGreaterThan(0);
    expect(result.visionMs).toBeGreaterThan(0);
    expect(visionCalls.at(-1)).toEqual([
      {x0: 0, y0: 0, x1: 99, y1: 99},
      {x0: 100, y0: 0, x1: 199, y1: 99},
      {x0: 0, y0: 100, x1: 99, y1: 199},
      {x0: 100, y0: 100, x1: 199, y1: 199},
    ]);
  });

  it('reuses query embeddings and evicts the least recently used', async () => {
    const {runtime, textCalls} = await loaded();
    const search = (id: number, query: string) =>
      runtime.handle({id, type: 'search', image: frame(), tiles: TILES, query});
    const before = textCalls.length;
    await search(2, 'cup');
    await search(3, 'cup');
    expect(textCalls.length - before).toBe(1);
    expect(textCalls.at(-1)![0]).toBe('a photo of a cup.');
    for (let i = 0; i < TEXT_CACHE_SIZE; i++)
      await search(10 + i, `thing ${i}`);
    expect(runtime.textCache.size).toBe(TEXT_CACHE_SIZE);
    expect(runtime.textCache.has('a photo of a cup.')).toBe(false);
  });

  it('rejects searches before loading and malformed frames', async () => {
    const {runtime, messages} = setup();
    await runtime.handle({
      id: 1,
      type: 'search',
      image: frame(),
      tiles: TILES,
      query: 'cup',
    });
    expect(messages.at(-1)).toMatchObject({
      message: expect.stringMatching(/Load the search model first/),
    });
    const ready = await loaded();
    await ready.runtime.handle({
      id: 2,
      type: 'search',
      image: frame(),
      tiles: TILES,
      query: '  ',
    });
    expect(ready.messages.at(-1)).toMatchObject({
      message: expect.stringMatching(/what to look for/),
    });
    await ready.runtime.handle({
      id: 3,
      type: 'search',
      image: frame(),
      tiles: [{x: 150, y: 0, side: 100}],
      query: 'cup',
    });
    expect(ready.messages.at(-1)).toMatchObject({
      message: expect.stringMatching(/outside the camera frame/),
    });
  });

  it('allows one operation at a time and rejects unknown requests', async () => {
    const {runtime, messages} = await loaded();
    const first = runtime.handle({
      id: 2,
      type: 'search',
      image: frame(),
      tiles: TILES,
      query: 'cup',
    });
    await runtime.handle({id: 3, type: 'check'});
    expect(messages.at(-1)).toMatchObject({
      id: 3,
      type: 'error',
      message: expect.stringMatching(/busy/),
    });
    await first;
    await runtime.handle({id: 4, type: 'teleport'});
    expect(messages.at(-1)).toMatchObject({
      id: 4,
      message: expect.stringMatching(/Unknown search operation/),
    });
    await runtime.handle({id: 0, type: 'check'});
    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/Invalid worker request ID/),
    });
  });

  it('throttles download progress and always reports the last event', async () => {
    const {runtime, messages, store, setNow} = setup();
    store.downloadAssets.mockImplementation(
      async ({onProgress}: {onProgress: (e: unknown) => void}) => {
        setNow(1000);
        onProgress({loaded: 1, total: 10, file: 'a'});
        setNow(1000 + PROGRESS_MS / 2);
        onProgress({loaded: 2, total: 10, file: 'a'});
        onProgress({loaded: 3, total: 10, file: 'a'});
        return {downloadedBytes: 3};
      }
    );
    // Freeze the clock inside the callback so throttling is deterministic.
    runtime.now = () => 1000;
    await runtime.handle({id: 1, type: 'download'});
    const progress = messages.filter((m) => m.type === 'progress');
    expect(progress.map((m) => (m.event as {loaded: number}).loaded)).toEqual([
      1, 3,
    ]);
    expect(messages.at(-1)).toMatchObject({
      type: 'result',
      result: {downloadedBytes: 3},
    });
  });

  it('cancels a running download with stop', async () => {
    const {runtime, messages, store} = setup();
    store.downloadAssets.mockImplementation(
      ({signal}: {signal: AbortSignal}) =>
        new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason))
        )
    );
    const download = runtime.handle({id: 1, type: 'download'});
    await Promise.resolve();
    await runtime.handle({id: 2, type: 'stop', targetId: 1});
    await download;
    expect(messages).toContainEqual(
      expect.objectContaining({
        id: 1,
        type: 'error',
        message: 'Download canceled.',
      })
    );
    expect(messages).toContainEqual({type: 'result', id: 2, result: {}});
  });

  it('frees both models on dispose and refuses later work', async () => {
    const {runtime, messages, textModel, visionModel} = await loaded();
    await runtime.handle({id: 2, type: 'dispose'});
    expect(textModel.dispose).toHaveBeenCalled();
    expect(visionModel.dispose).toHaveBeenCalled();
    expect(runtime.loaded).toBe(false);
    expect(messages.at(-1)).toEqual({type: 'result', id: 2, result: {}});
    await runtime.handle({id: 3, type: 'check'});
    expect(messages.at(-1)).toMatchObject({
      message: expect.stringMatching(/disposed/),
    });
  });

  it('flags memory failures as fatal so the client resets the worker', () => {
    const {runtime, messages} = setup();
    runtime.error(5, new Error('RuntimeError: memory access out of bounds'));
    expect(messages.at(-1)).toMatchObject({id: 5, fatal: true});
    runtime.error(6, new Error('Type what to look for.'));
    expect(messages.at(-1)).toMatchObject({id: 6, fatal: false});
  });
});

describe('validateFrame', () => {
  it('accepts in-bounds integer crops', () => {
    expect(() => validateFrame(frame(), TILES)).not.toThrow();
  });

  it('rejects malformed frames and crop lists', () => {
    expect(() => validateFrame({...frame(), width: 0}, TILES)).toThrow(
      /Invalid camera frame/
    );
    expect(() =>
      validateFrame({...frame(), data: new Uint8ClampedArray(3)}, TILES)
    ).toThrow(/Invalid camera frame/);
    expect(() => validateFrame(frame(), [])).toThrow(/Invalid crop list/);
    expect(() =>
      validateFrame(
        frame(),
        Array.from({length: MAX_TILES + 1}, () => TILES[0])
      )
    ).toThrow(/Invalid crop list/);
    expect(() => validateFrame(frame(), [{x: 0.5, y: 0, side: 10}])).toThrow(
      /outside/
    );
    expect(() => validateFrame(frame(), [{x: 0, y: 150, side: 100}])).toThrow(
      /outside/
    );
  });
});
