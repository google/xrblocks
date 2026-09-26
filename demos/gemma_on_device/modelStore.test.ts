// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  CACHE_NAME,
  MODEL_BYTES,
  MODEL_URL,
  downloadModel,
  hasCachedModel,
  openCachedModel,
} from './modelStore.js';

function modelBody(length = MODEL_BYTES) {
  const chunk = new Uint8Array(1024 * 1024);
  let remaining = length;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!remaining) {
        controller.close();
        return;
      }
      const next = chunk.subarray(0, Math.min(remaining, chunk.byteLength));
      remaining -= next.byteLength;
      controller.enqueue(next);
    },
  });
}

describe('Gemma model storage', () => {
  let stored: Response | undefined;
  const cache = {
    match: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  const fetchModel = vi.fn();
  const estimate = vi.fn();

  beforeEach(() => {
    stored = undefined;
    cache.match.mockImplementation(async () =>
      stored ? new Response('fixture', {headers: stored.headers}) : undefined
    );
    cache.put.mockImplementation(async (_url: string, response: Response) => {
      const reader = response.body!.getReader();
      let received = 0;
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        received += value.byteLength;
      }
      expect(received).toBe(MODEL_BYTES);
      stored = new Response('fixture', {headers: response.headers});
    });
    cache.delete.mockImplementation(async () => {
      stored = undefined;
      return true;
    });
    fetchModel.mockImplementation(async () => new Response(modelBody()));
    estimate.mockResolvedValue({quota: MODEL_BYTES * 2, usage: 0});
    vi.stubGlobal('caches', {open: vi.fn().mockResolvedValue(cache)});
    vi.stubGlobal('fetch', fetchModel);
    vi.stubGlobal('navigator', {storage: {estimate}});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('checks the cache without downloading and refuses a missing model', async () => {
    expect(await hasCachedModel()).toBe(false);
    await expect(openCachedModel()).rejects.toThrow(/download/i);
    expect(fetchModel).not.toHaveBeenCalled();
    expect(caches.open).toHaveBeenCalledWith(CACHE_NAME);
  });

  it('persists a complete streamed download and reuses it without fetching', async () => {
    const progress: Array<{received: number; total: number; phase: string}> =
      [];
    await downloadModel({onProgress: (value) => progress.push(value)});
    expect(fetchModel).toHaveBeenCalledWith(
      MODEL_URL,
      expect.objectContaining({signal: undefined})
    );
    expect(progress[0]).toMatchObject({received: 0, total: MODEL_BYTES});
    expect(progress.at(-1)).toMatchObject({
      received: MODEL_BYTES,
      phase: 'saving',
    });
    expect(
      progress.every(
        (entry, i) => i === 0 || entry.received >= progress[i - 1].received
      )
    ).toBe(true);
    expect(await hasCachedModel()).toBe(true);
    expect(await openCachedModel()).toBeInstanceOf(ReadableStream);
    await downloadModel({});
    expect(fetchModel).toHaveBeenCalledTimes(1);
  });

  it('does not treat an entry with the wrong size as ready', async () => {
    stored = new Response('broken', {headers: {'content-length': '6'}});
    expect(await hasCachedModel()).toBe(false);
    await expect(openCachedModel()).rejects.toThrow(/download/i);
    expect(fetchModel).not.toHaveBeenCalled();
  });

  it.each([
    ['HTTP failure', () => new Response('unavailable', {status: 503}), /503/],
    ['missing body', () => new Response(null), /body/i],
    [
      'unexpected header size',
      () => new Response('bad', {headers: {'content-length': '3'}}),
      /size/i,
    ],
    [
      'truncated stream',
      () => new Response(modelBody(100)),
      /size|incomplete/i,
    ],
    [
      'oversized stream',
      () => new Response(modelBody(MODEL_BYTES + 1)),
      /size/i,
    ],
  ])('does not cache %s', async (_name, response, error) => {
    fetchModel.mockResolvedValue(response());
    await expect(downloadModel({})).rejects.toThrow(error);
    expect(await hasCachedModel()).toBe(false);
  });

  it('refuses a known insufficient quota before fetching', async () => {
    estimate.mockResolvedValue({quota: MODEL_BYTES, usage: 1024});
    await expect(downloadModel({})).rejects.toThrow(/storage|space/i);
    expect(fetchModel).not.toHaveBeenCalled();
  });

  it('can download when the browser has no storage estimate API', async () => {
    vi.stubGlobal('navigator', {});
    await downloadModel({});
    expect(await hasCachedModel()).toBe(true);
  });

  it('surfaces an estimate error rather than silently assuming space', async () => {
    estimate.mockRejectedValue(new Error('Storage denied'));
    await expect(downloadModel({})).rejects.toThrow('Storage denied');
    expect(fetchModel).not.toHaveBeenCalled();
  });

  it('surfaces a cache write quota failure and cancels the body', async () => {
    const cancel = vi.fn();
    fetchModel.mockResolvedValue(new Response(new ReadableStream({cancel})));
    cache.put.mockRejectedValue(
      new DOMException('No space', 'QuotaExceededError')
    );
    await expect(downloadModel({})).rejects.toThrow(/space/i);
    expect(await hasCachedModel()).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });

  it('cancels a download without a ready entry', async () => {
    const controller = new AbortController();
    await expect(
      downloadModel({
        signal: controller.signal,
        onProgress: ({received}) => {
          if (received) controller.abort();
        },
      })
    ).rejects.toMatchObject({name: 'AbortError'});
    expect(await hasCachedModel()).toBe(false);
  });

  it('does not fetch an already canceled request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      downloadModel({signal: controller.signal})
    ).rejects.toMatchObject({name: 'AbortError'});
    expect(fetchModel).not.toHaveBeenCalled();
  });

  it('preserves a user cancellation when Cache.put wraps the stream error', async () => {
    const controller = new AbortController();
    cache.put.mockImplementation(async (_url, response: Response) => {
      controller.abort();
      await response.body!.cancel();
      throw new TypeError('Failed to fetch');
    });
    await expect(
      downloadModel({signal: controller.signal})
    ).rejects.toMatchObject({name: 'AbortError'});
  });
});
