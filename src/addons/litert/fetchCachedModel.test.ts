import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {fetchCachedModel} from './fetchCachedModel';
const url = 'https://models.test/model.tflite';
let cached: Response | undefined;
let fetchModel: ReturnType<typeof vi.fn>;
beforeEach(() => {
  cached = undefined;
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async () => cached?.clone(),
      put: async (_url: string, response: Response) => {
        cached = response;
      },
    }),
  });
  fetchModel = vi.fn();
  vi.stubGlobal('fetch', fetchModel);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('stores complete downloaded bytes and reads them again without a second request', async () => {
  fetchModel.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3]));
          controller.close();
        },
      })
    )
  );
  expect(Array.from(await fetchCachedModel(url))).toEqual([1, 2, 3]);
  expect(Array.from(await fetchCachedModel(url))).toEqual([1, 2, 3]);
  expect(fetchModel).toHaveBeenCalledOnce();
});

it('does not cache a failed response', async () => {
  fetchModel.mockResolvedValue(new Response('unavailable', {status: 503}));
  await expect(fetchCachedModel(url)).rejects.toThrow('503');
  expect(cached).toBeUndefined();
});

it('rejects an aborted download and does not store partial bytes', async () => {
  const started = Promise.withResolvers<void>();
  fetchModel.mockImplementation(
    (_url: string, {signal}: {signal: AbortSignal}) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
        started.resolve();
      })
  );
  const abort = new AbortController();
  const pending = fetchCachedModel(url, {signal: abort.signal});
  const rejected = expect(pending).rejects.toMatchObject({name: 'AbortError'});
  await started.promise;
  abort.abort();
  await rejected;
  expect(cached).toBeUndefined();
});
