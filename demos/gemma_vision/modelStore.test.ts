// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  CACHE_NAME,
  IMAGE_BUDGET,
  MODEL_BASE,
  MODEL_BYTES,
  MODEL_FILES,
  MODEL_ID,
  MODELS,
  ORT_BASE,
  REVISION,
  RUNTIME_URL,
} from './modelConfig.js';
import {
  createGuardedFetch,
  inspectCache,
  loadProcessorAssets,
  prepareStorage,
} from './modelStore.js';

const processorFiles = [
  'processor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'chat_template.jinja',
];

function cacheEntry(size: number, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    headers: new Headers({'Content-Length': String(size)}),
    body: {cancel: vi.fn().mockResolvedValue(undefined)},
    arrayBuffer: vi.fn(() => {
      throw new Error('Inspection must not read model weights');
    }),
  };
}

function assetResponse(file: string, size = MODEL_FILES[file]) {
  const text = file.endsWith('.jinja') ? 'template' : '{"fixture":true}';
  return new Response(text.padEnd(size), {
    headers: {'Content-Length': String(size)},
  });
}

const entries = new Map<string, ReturnType<typeof cacheEntry> | Response>();
const match = vi.fn(async (url: string) => {
  const entry = entries.get(url);
  return entry instanceof Response ? entry.clone() : entry;
});
const put = vi.fn(async (url: string, response: Response) => {
  entries.set(url, response);
});
const open = vi.fn(async () => ({match, put}));
const network = vi.fn<typeof fetch>();

function fillCache() {
  for (const [file, size] of Object.entries(MODEL_FILES)) {
    entries.set(MODEL_BASE + file, cacheEntry(size));
  }
}

function storage(value: object) {
  vi.stubGlobal('navigator', {storage: value});
}

beforeEach(() => {
  entries.clear();
  vi.clearAllMocks();
  put.mockImplementation(async (url, response) => {
    entries.set(url, response);
  });
  network.mockReset();
  vi.stubGlobal('caches', {open});
  vi.stubGlobal('fetch', network);
  vi.stubGlobal('navigator', {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pinned model manifest', () => {
  it('accounts for every graph, sidecar and used metadata byte', () => {
    expect(MODEL_ID).toBe('onnx-community/gemma-4-E2B-it-ONNX');
    expect(REVISION).toBe('9f4bef82ea6e296bc69f8a2f5939f73af81b07a6');
    expect(MODEL_BASE).toBe(
      `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/`
    );
    expect(RUNTIME_URL).toBe(
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js'
    );
    expect(ORT_BASE).toBe(
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/'
    );
    expect(CACHE_NAME).toBe('xrblocks-gemma-vision-4.3.0');
    expect(IMAGE_BUDGET).toBe(140);
    expect(Object.keys(MODEL_FILES)).toHaveLength(14);
    expect(MODEL_FILES).not.toHaveProperty('preprocessor_config.json');
    expect(MODEL_FILES['config.json']).toBe(5549);
    expect(MODEL_FILES['generation_config.json']).toBe(238);
    expect(MODEL_BYTES).toBe(3401448609);
    expect(Object.values(MODEL_FILES).reduce((a, b) => a + b, 0)).toBe(
      MODEL_BYTES
    );
  });
});

describe('inspectCache', () => {
  it('reports an empty cache without any network or body reads', async () => {
    expect(await inspectCache()).toEqual({
      complete: false,
      missingBytes: MODEL_BYTES,
      presentBytes: 0,
      totalBytes: MODEL_BYTES,
    });
    expect(open).toHaveBeenCalledWith(CACHE_NAME);
    expect(match.mock.calls.map(([url]) => url)).toEqual(
      Object.keys(MODEL_FILES).map((file) => MODEL_BASE + file)
    );
    expect(network).not.toHaveBeenCalled();
  });

  it('accepts the full exact-length cache and cancels every unused body', async () => {
    fillCache();
    expect(await inspectCache()).toEqual({
      complete: true,
      missingBytes: 0,
      presentBytes: MODEL_BYTES,
      totalBytes: MODEL_BYTES,
    });
    for (const entry of entries.values()) {
      expect(entry.body?.cancel).toHaveBeenCalledOnce();
      expect(entry.arrayBuffer).not.toHaveBeenCalled();
    }
    expect(network).not.toHaveBeenCalled();
  });

  it('accounts for missing sidecars and does not accept main-revision keys', async () => {
    fillCache();
    const file = 'onnx/embed_tokens_q4f16.onnx_data';
    const url = MODEL_BASE + file;
    entries.set(url.replace(REVISION, 'main'), entries.get(url)!);
    entries.delete(url);
    expect(await inspectCache()).toEqual({
      complete: false,
      missingBytes: MODEL_FILES[file],
      presentBytes: MODEL_BYTES - MODEL_FILES[file],
      totalBytes: MODEL_BYTES,
    });
    expect(network).not.toHaveBeenCalled();
  });

  it.each(['wrong length', 'HTTP error', 'missing length'])(
    'does not count a cached response with %s',
    async (problem) => {
      fillCache();
      const file = 'config.json';
      const response = cacheEntry(
        problem === 'wrong length' ? 1 : MODEL_FILES[file],
        problem === 'HTTP error' ? 500 : 200
      );
      if (problem === 'missing length') {
        response.headers.delete('Content-Length');
      }
      entries.set(MODEL_BASE + file, response);
      expect(await inspectCache()).toMatchObject({
        complete: false,
        missingBytes: MODEL_FILES[file],
      });
      expect(response.body.cancel).toHaveBeenCalledOnce();
      expect(response.arrayBuffer).not.toHaveBeenCalled();
    }
  );

  it('requires config and generation metadata, not just ONNX weights', async () => {
    fillCache();
    entries.delete(MODEL_BASE + 'config.json');
    entries.delete(MODEL_BASE + 'generation_config.json');
    expect(await inspectCache()).toMatchObject({
      complete: false,
      missingBytes: 5787,
    });
  });

  it('surfaces unavailable browser cache storage', async () => {
    vi.stubGlobal('caches', undefined);
    await expect(inspectCache()).rejects.toThrow(/cache storage.*unavailable/i);
  });
});

describe('prepareStorage', () => {
  it('requests persistence and requires missing bytes plus 64 MiB headroom', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    const available = 1000 + 64 * 1024 * 1024;
    storage({
      persist,
      estimate: vi.fn().mockResolvedValue({quota: available + 500, usage: 500}),
    });
    expect(await prepareStorage(1000)).toEqual({
      persistent: true,
      quotaKnown: true,
    });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not request persistence again when it is already granted', async () => {
    const persist = vi.fn();
    storage({
      persisted: vi.fn().mockResolvedValue(true),
      persist,
      estimate: vi.fn().mockResolvedValue({quota: MODEL_BYTES * 2, usage: 0}),
    });
    expect(await prepareStorage(MODEL_BYTES)).toEqual({
      persistent: true,
      quotaKnown: true,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it('blocks insufficient known quota before any download', async () => {
    storage({
      persist: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockResolvedValue({quota: MODEL_BYTES, usage: 0}),
    });
    await expect(prepareStorage(MODEL_BYTES)).rejects.toThrow(
      /insufficient.*storage/i
    );
    expect(network).not.toHaveBeenCalled();
    expect((await inspectCache()).complete).toBe(false);
  });

  it('reports denied persistence instead of calling it persistent', async () => {
    storage({
      persist: vi.fn().mockResolvedValue(false),
      estimate: vi.fn().mockResolvedValue({quota: MODEL_BYTES * 2, usage: 0}),
    });
    expect(await prepareStorage(10)).toEqual({
      persistent: false,
      quotaKnown: true,
      warning: expect.stringMatching(/persistence.*denied/i),
    });
  });

  it('returns persistence rejection as a visible warning', async () => {
    storage({
      persist: vi.fn().mockRejectedValue(new Error('permission failed')),
      estimate: vi.fn().mockResolvedValue({quota: MODEL_BYTES * 2, usage: 0}),
    });
    expect(await prepareStorage(10)).toEqual({
      persistent: null,
      quotaKnown: true,
      warning: expect.stringContaining('permission failed'),
    });
  });

  it.each([undefined, {}, {quota: MODEL_BYTES}, {quota: NaN, usage: 0}])(
    'reports unknown quota rather than treating it as enough: %j',
    async (estimate) => {
      storage({
        persist: vi.fn().mockResolvedValue(true),
        ...(estimate === undefined
          ? {}
          : {estimate: vi.fn().mockResolvedValue(estimate)}),
      });
      expect(await prepareStorage(10)).toEqual({
        persistent: true,
        quotaKnown: false,
        warning: expect.stringMatching(/quota.*unavailable/i),
      });
    }
  );

  it('reports estimate errors without hiding the underlying reason', async () => {
    storage({
      persist: vi.fn().mockResolvedValue(true),
      estimate: vi.fn().mockRejectedValue(new Error('estimate failed')),
    });
    expect(await prepareStorage(10)).toMatchObject({
      quotaKnown: false,
      warning: expect.stringContaining('estimate failed'),
    });
  });

  it('reports missing storage and persistence APIs', async () => {
    expect(await prepareStorage(10)).toMatchObject({
      persistent: null,
      quotaKnown: false,
      warning: expect.stringMatching(/unavailable/i),
    });
  });
});

describe('loadProcessorAssets', () => {
  it('rejects a missing cache entry without explicit download permission', async () => {
    await expect(loadProcessorAssets({allowDownload: false})).rejects.toThrow(
      /download/i
    );
    expect(network).not.toHaveBeenCalled();
  });

  it('reads only the four pinned processor files from cache', async () => {
    for (const file of processorFiles) {
      entries.set(MODEL_BASE + file, assetResponse(file));
    }
    const result = await loadProcessorAssets({allowDownload: false});
    expect(result.processorConfig).toEqual({fixture: true});
    expect(result.tokenizerJSON).toEqual({fixture: true});
    expect(result.tokenizerConfig).toEqual({fixture: true});
    expect(result.chatTemplate.trim()).toBe('template');
    expect(match.mock.calls.map(([url]) => url)).toEqual(
      processorFiles.map((file) => MODEL_BASE + file)
    );
    expect(network).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('downloads only missing metadata, validates bytes and saves exact lengths', async () => {
    entries.set(
      MODEL_BASE + processorFiles[0],
      assetResponse(processorFiles[0])
    );
    network.mockImplementation(async (input) => {
      const file = String(input).slice(MODEL_BASE.length);
      return assetResponse(file);
    });
    const onProgress = vi.fn();
    await loadProcessorAssets({allowDownload: true, onProgress});
    expect(network.mock.calls.map(([url]) => url)).toEqual(
      processorFiles.slice(1).map((file) => MODEL_BASE + file)
    );
    for (const [url, response] of put.mock.calls) {
      const expected = MODEL_FILES[url.slice(MODEL_BASE.length)];
      expect(response.headers.get('Content-Length')).toBe(String(expected));
      expect((await response.clone().arrayBuffer()).byteLength).toBe(expected);
    }
    expect(onProgress).toHaveBeenCalledTimes(4);
    expect(onProgress).toHaveBeenLastCalledWith({
      status: 'progress',
      file: 'chat_template.jinja',
      loaded: 16317,
      total: 16317,
      progress: 100,
    });
    expect((await inspectCache()).complete).toBe(false);
  });

  it('rejects short actual bytes even if the server claims the right length', async () => {
    network.mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Length': String(MODEL_FILES[processorFiles[0]])},
      })
    );
    await expect(loadProcessorAssets({allowDownload: true})).rejects.toThrow(
      /byte length.*processor_config.json/i
    );
    expect(put).not.toHaveBeenCalled();
    expect(network).toHaveBeenCalledOnce();
  });

  it('validates actual cached metadata bytes before parsing', async () => {
    entries.set(
      MODEL_BASE + processorFiles[0],
      new Response('{}', {
        headers: {'Content-Length': String(MODEL_FILES[processorFiles[0]])},
      })
    );
    await expect(loadProcessorAssets({allowDownload: false})).rejects.toThrow(
      /byte length.*processor_config.json/i
    );
    expect(network).not.toHaveBeenCalled();
  });

  it('surfaces HTTP failures without reading or caching error bodies', async () => {
    const response = cacheEntry(0, 403);
    network.mockResolvedValue(response as unknown as Response);
    await expect(loadProcessorAssets({allowDownload: true})).rejects.toThrow(
      /processor_config.json/
    );
    expect(response.body.cancel).toHaveBeenCalledOnce();
    expect(response.arrayBuffer).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('surfaces cache-write quota failures and never claims the model cached', async () => {
    network.mockResolvedValue(assetResponse(processorFiles[0]));
    put.mockRejectedValue(
      new DOMException('quota exceeded', 'QuotaExceededError')
    );
    await expect(loadProcessorAssets({allowDownload: true})).rejects.toThrow(
      /quota exceeded/i
    );
    expect((await inspectCache()).complete).toBe(false);
    expect(network).toHaveBeenCalledOnce();
  });
});

describe('createGuardedFetch', () => {
  it.each(['string', 'URL', 'Request'])(
    'passes approved exact manifest %s requests to the captured fetch',
    async (kind) => {
      const url = MODEL_BASE + 'onnx/vision_encoder_q4f16.onnx';
      const input =
        kind === 'URL'
          ? new URL(url)
          : kind === 'Request'
            ? new Request(url)
            : url;
      const response = new Response('fixture');
      network.mockResolvedValue(response);
      const guarded = createGuardedFetch(true);
      const replacement = vi.fn();
      vi.stubGlobal('fetch', replacement);
      const init = {signal: new AbortController().signal};
      expect(await guarded(input, init)).toBe(response);
      expect(network).toHaveBeenCalledWith(input, init);
      expect(network.mock.contexts[0]).toBe(globalThis);
      expect(replacement).not.toHaveBeenCalled();
      expect(globalThis.fetch).toBe(replacement);
    }
  );

  it.each(['string', 'URL', 'Request'])(
    'rejects model network requests in cache-only mode for %s inputs',
    async (kind) => {
      fillCache();
      const url = MODEL_BASE + 'config.json';
      const input =
        kind === 'URL'
          ? new URL(url)
          : kind === 'Request'
            ? new Request(url)
            : url;
      await expect(createGuardedFetch(false)(input)).rejects.toThrow(
        /download/i
      );
      expect(network).not.toHaveBeenCalled();
    }
  );

  it.each([
    `${MODEL_BASE.replace(REVISION, 'main')}tokenizer_config.json`,
    `${MODEL_BASE.replace(REVISION, 'wrong-revision')}config.json`,
    `${MODEL_BASE}preprocessor_config.json`,
    `${MODEL_BASE}config.json?download=true`,
    '/models/config.json',
    'http://localhost/models/config.json',
    'https://example.com/config.json',
    `${ORT_BASE}ort-wasm-simd-threaded.wasm`,
  ])('blocks unapproved URL %s even with download permission', async (url) => {
    await expect(createGuardedFetch(true)(url)).rejects.toThrow(/unapproved/i);
    expect(network).not.toHaveBeenCalled();
  });

  it.each(['mjs', 'wasm'])(
    'allows only the pinned ORT asyncify %s in cache-only mode',
    async (extension) => {
      const url = `${ORT_BASE}ort-wasm-simd-threaded.asyncify.${extension}`;
      network.mockResolvedValue(new Response('runtime fixture'));
      await createGuardedFetch(false)(url);
      expect(network).toHaveBeenCalledWith(url, undefined);
    }
  );
});

describe('Lite model storage', () => {
  const lite = MODELS.lite;

  it('inspects only Lite keys and ignores a complete Gemma cache', async () => {
    fillCache();
    match.mockClear();
    expect(await inspectCache(lite)).toEqual({
      complete: false,
      missingBytes: lite.bytes,
      presentBytes: 0,
      totalBytes: lite.bytes,
    });
    expect(match.mock.calls.map(([url]) => url)).toEqual(
      Object.keys(lite.files).map((file) => lite.base + file)
    );
    for (const [file, size] of Object.entries(lite.files)) {
      entries.set(lite.base + file, cacheEntry(size));
    }
    expect((await inspectCache(lite)).complete).toBe(true);
    expect(await inspectCache()).toMatchObject({complete: true});
    expect(network).not.toHaveBeenCalled();
  });

  it('approves only the selected model files', async () => {
    network.mockResolvedValue(new Response('ok'));
    const liteFetch = createGuardedFetch(true, lite);
    await liteFetch(lite.base + 'onnx/vision_encoder_q4f16.onnx');
    await expect(liteFetch(MODEL_BASE + 'config.json')).rejects.toThrow(
      /Unapproved/
    );
    await expect(
      createGuardedFetch(false, lite)(lite.base + 'config.json')
    ).rejects.toThrow(/explicit Download/);
    expect(network).toHaveBeenCalledOnce();
  });

  it('reads Lite processor files from cache and parses its JSON template', async () => {
    for (const file of Object.values(lite.processorFiles)) {
      const size = lite.files[file];
      const json =
        file === 'chat_template.json'
          ? '{"chat_template":"lite"}'
          : '{"fixture":true}';
      entries.set(
        lite.base + file,
        new Response(json.padEnd(size), {
          headers: {'Content-Length': String(size)},
        })
      );
    }
    const assets = await loadProcessorAssets({
      model: lite,
      allowDownload: false,
    });
    expect(assets.chatTemplate).toEqual({chat_template: 'lite'});
    expect(assets.imageProcessorConfig).toEqual({fixture: true});
    expect(Object.keys(assets)).toEqual(Object.keys(lite.processorFiles));
    expect(network).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
