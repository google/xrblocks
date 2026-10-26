import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  DEFAULT_LITERT_CACHE_NAME,
  evictCachedModel,
  fetchCachedModel,
} from './fetchCachedModel';

const URL_A = 'https://models.test/a.tflite';

function streamedResponse(chunks: Uint8Array[], contentLength?: number) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const headers: Record<string, string> = {};
  if (contentLength !== undefined) {
    headers['Content-Length'] = String(contentLength);
  }
  return new Response(stream, {status: 200, headers});
}

describe('fetchCachedModel', () => {
  let store: Map<string, Response>;
  let cache: {match: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>};
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new Map();
    cache = {
      match: vi.fn(async (url: string) => store.get(url)?.clone()),
      put: vi.fn(async (url: string, response: Response) => {
        store.set(url, response);
      }),
    };
    vi.stubGlobal('caches', {
      open: vi.fn(async () => cache),
      delete: vi.fn(async () => true),
    });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('streams the download, reports progress and stores it in the cache', async () => {
    fetchMock.mockResolvedValue(
      streamedResponse([new Uint8Array([1, 2]), new Uint8Array([3])], 3)
    );
    const progress: Array<[number, number]> = [];

    const bytes = await fetchCachedModel(URL_A, {
      onProgress: (r, t) => progress.push([r, t]),
    });

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(progress).toEqual([
      [2, 3],
      [3, 3],
    ]);
    expect(caches.open).toHaveBeenCalledWith(DEFAULT_LITERT_CACHE_NAME);
    expect(cache.put).toHaveBeenCalledWith(URL_A, expect.any(Response));
    expect(
      Array.from(new Uint8Array(await store.get(URL_A)!.arrayBuffer()))
    ).toEqual([1, 2, 3]);
  });

  it('serves a cache hit without touching the network', async () => {
    store.set(URL_A, new Response(new Uint8Array([9, 9])));
    const progress: Array<[number, number]> = [];

    const bytes = await fetchCachedModel(URL_A, {
      cacheName: 'custom',
      onProgress: (r, t) => progress.push([r, t]),
    });

    expect(Array.from(bytes)).toEqual([9, 9]);
    expect(progress).toEqual([[2, 2]]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(caches.open).toHaveBeenCalledWith('custom');
  });

  it('reports zero total when Content-Length is missing', async () => {
    fetchMock.mockResolvedValue(streamedResponse([new Uint8Array([1])]));
    const progress: Array<[number, number]> = [];
    await fetchCachedModel(URL_A, {
      onProgress: (r, t) => progress.push([r, t]),
    });
    expect(progress).toEqual([[1, 0]]);
  });

  it('throws on a non-2xx response and caches nothing', async () => {
    fetchMock.mockResolvedValue(new Response('nope', {status: 403}));
    await expect(fetchCachedModel(URL_A)).rejects.toThrow('HTTP 403');
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('still returns the bytes when the cache write fails', async () => {
    fetchMock.mockResolvedValue(streamedResponse([new Uint8Array([7])], 1));
    cache.put.mockRejectedValue(new Error('QuotaExceededError'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(Array.from(await fetchCachedModel(URL_A))).toEqual([7]);
    expect(warn).toHaveBeenCalled();
  });

  it('works without the Cache API', async () => {
    vi.stubGlobal('caches', undefined);
    fetchMock.mockResolvedValue(streamedResponse([new Uint8Array([5])], 1));
    expect(Array.from(await fetchCachedModel(URL_A))).toEqual([5]);
    expect(await evictCachedModel(URL_A)).toBe(false);
  });

  it('passes the abort signal to fetch', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(streamedResponse([new Uint8Array([1])], 1));
    await fetchCachedModel(URL_A, {signal: controller.signal});
    expect(fetchMock).toHaveBeenCalledWith(URL_A, {signal: controller.signal});
  });
});
