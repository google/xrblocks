// @vitest-environment node
import {createHash} from 'node:crypto';
import {describe, expect, it, vi} from 'vitest';

import {ASSETS, CACHE_NAME, MODEL_BASE, TOTAL_BYTES} from './modelConfig.js';
import {
  cacheOnlyFetch,
  downloadAssets,
  inspectCache,
  prepareStorage,
  readCachedJSON,
  sha256,
} from './modelStore.js';

export class FakeCache {
  entries = new Map<string, Response>();
  async match(url: string) {
    return this.entries.get(url)?.clone();
  }
  async put(url: string, response: Response) {
    this.entries.set(url, response);
  }
}

export class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
}

function asCacheStorage(fake: FakeCacheStorage) {
  return fake as unknown as CacheStorage;
}

/** A small manifest shaped like the real one. */
function fakeManifest() {
  const bodies = new Map<string, Uint8Array>();
  const assets = ASSETS.map((asset, index) => {
    const body = new TextEncoder().encode(
      asset.file.endsWith('.json') ? `{"index":${index}}` : `bytes-${index}`
    );
    bodies.set(asset.url, body);
    return {
      ...asset,
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
  });
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  return {assets, bodies, total};
}

function streamResponse(bytes: Uint8Array, chunk = 3) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += chunk) {
          controller.enqueue(bytes.slice(offset, offset + chunk));
        }
        controller.close();
      },
    })
  );
}

describe('model manifest', () => {
  it('pins every asset to an exact revision, size and digest', () => {
    expect(ASSETS).toHaveLength(8);
    expect(TOTAL_BYTES).toBe(93825325);
    for (const asset of ASSETS) {
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.bytes).toBeGreaterThan(0);
      expect(asset.url).not.toMatch(/\/(main|latest)\//);
    }
    expect(Object.isFrozen(ASSETS)).toBe(true);
  });
});

describe('modelStore', () => {
  it('reports missing assets without reading bodies', async () => {
    const storage = new FakeCacheStorage();
    const cache = await storage.open(CACHE_NAME);
    const first = ASSETS[0];
    await cache.put(
      first.url,
      new Response('x', {headers: {'Content-Length': String(first.bytes)}})
    );
    await cache.put(
      ASSETS[1].url,
      new Response('x', {headers: {'Content-Length': '1'}})
    );
    const result = await inspectCache({cacheStorage: asCacheStorage(storage)});
    expect(result.complete).toBe(false);
    expect(result.presentBytes).toBe(first.bytes);
    expect(result.missingBytes).toBe(TOTAL_BYTES - first.bytes);
    expect(result.missing).toHaveLength(ASSETS.length - 1);
  });

  it('downloads, verifies and caches every missing asset with progress', async () => {
    const {assets, bodies, total} = fakeManifest();
    {
      const storage = new FakeCacheStorage();
      const fetchImpl = vi.fn(async (url: string) =>
        streamResponse(bodies.get(url)!)
      );
      const progress: number[] = [];
      await downloadAssets({
        assets,
        cacheStorage: asCacheStorage(storage),
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onProgress: ({loaded}) => progress.push(loaded),
      });
      expect(fetchImpl).toHaveBeenCalledTimes(ASSETS.length);
      for (let i = 1; i < progress.length; i++) {
        expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
      }
      expect(progress.at(-1)).toBe(total);
      const cached = await inspectCache({
        assets,
        cacheStorage: asCacheStorage(storage),
      });
      expect(cached).toMatchObject({complete: true, presentBytes: total});
      expect(
        await readCachedJSON('config.json', {
          assets,
          cacheStorage: asCacheStorage(storage),
        })
      ).toEqual({index: 0});

      fetchImpl.mockClear();
      await downloadAssets({
        assets,
        cacheStorage: asCacheStorage(storage),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('rejects corrupted, truncated and failed downloads without caching', async () => {
    const {assets, bodies} = fakeManifest();
    {
      for (const bad of [
        (bytes: Uint8Array) => streamResponse(bytes.map((b) => b ^ 1)),
        (bytes: Uint8Array) => streamResponse(bytes.slice(1)),
        (bytes: Uint8Array) => streamResponse(new Uint8Array([...bytes, 1])),
        () => new Response('nope', {status: 404}),
      ]) {
        const storage = new FakeCacheStorage();
        await expect(
          downloadAssets({
            assets,
            cacheStorage: asCacheStorage(storage),
            fetchImpl: (async (url: string) =>
              bad(bodies.get(url)!)) as unknown as typeof fetch,
          })
        ).rejects.toThrow(/integrity|incomplete|larger|HTTP 404/);
        const cache = await storage.open(CACHE_NAME);
        expect(cache.entries.size).toBe(0);
      }
    }
  });

  it('stops between files when aborted', async () => {
    const {assets, bodies} = fakeManifest();
    {
      const controller = new AbortController();
      const storage = new FakeCacheStorage();
      let calls = 0;
      await expect(
        downloadAssets({
          assets,
          cacheStorage: asCacheStorage(storage),
          signal: controller.signal,
          fetchImpl: (async (url: string) => {
            calls++;
            controller.abort(new Error('Download canceled.'));
            return streamResponse(bodies.get(url)!);
          }) as unknown as typeof fetch,
        })
      ).rejects.toThrow('Download canceled.');
      expect(calls).toBe(1);
      expect((await storage.open(CACHE_NAME)).entries.size).toBe(0);
    }
  });

  it('refuses every runtime network request', async () => {
    await expect(cacheOnlyFetch(`${MODEL_BASE}config.json`)).rejects.toThrow(
      /Not cached: .*config\.json\. Choose Download/
    );
    await expect(
      cacheOnlyFetch(new URL('https://example.com/a'))
    ).rejects.toThrow(/example\.com/);
  });

  it('reads cached JSON from another pinned model base', async () => {
    const storage = new FakeCacheStorage();
    const base = 'https://huggingface.co/other/resolve/abc/';
    const body = JSON.stringify({ok: true});
    const assets = [
      {
        file: 'tokenizer.json',
        url: `${base}tokenizer.json`,
        bytes: body.length,
        sha256: '',
      },
    ];
    (await storage.open(CACHE_NAME)).entries.set(
      assets[0].url,
      new Response(body, {headers: {'Content-Length': String(body.length)}})
    );
    const cacheStorage = asCacheStorage(storage);
    await expect(
      readCachedJSON('tokenizer.json', {cacheStorage, assets, base})
    ).resolves.toEqual({ok: true});
    await expect(
      readCachedJSON('tokenizer.json', {cacheStorage, assets})
    ).rejects.toThrow(/not a pinned/);
  });

  it('throws when a cached JSON file is missing or unpinned', async () => {
    const storage = asCacheStorage(new FakeCacheStorage());
    await expect(
      readCachedJSON('tokenizer.json', {cacheStorage: storage})
    ).rejects.toThrow(/not cached/);
    await expect(
      readCachedJSON('evil.json', {cacheStorage: storage})
    ).rejects.toThrow(/not a pinned/);
  });

  it('checks quota and requests persistence before a download', async () => {
    const storage = {
      persisted: vi.fn(async () => false),
      persist: vi.fn(async () => true),
      estimate: vi.fn(async () => ({quota: 500e6, usage: 100e6})),
    };
    await expect(
      prepareStorage(100e6, {storage: storage as unknown as StorageManager})
    ).resolves.toEqual({persistent: true, quotaKnown: true});
    expect(storage.persist).toHaveBeenCalled();
    await expect(
      prepareStorage(390e6, {storage: storage as unknown as StorageManager})
    ).rejects.toThrow(/Not enough browser storage/);
    await expect(prepareStorage(1, {storage: undefined})).resolves.toEqual({
      persistent: null,
      quotaKnown: false,
    });
  });

  it('computes SHA-256 digests', async () => {
    expect(await sha256(new TextEncoder().encode('abc').buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
