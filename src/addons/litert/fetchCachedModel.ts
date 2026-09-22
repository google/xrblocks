/**
 * Downloads a model file once and keeps it in the Cache API, reporting
 * streamed progress so a spatial panel can show "12 / 71 MB" while the
 * (large) first download runs.
 */

/** Cache API bucket shared by demos unless they pass their own. */
export const DEFAULT_LITERT_CACHE_NAME = 'xrblocks-litert-v1';

export interface FetchCachedModelOptions {
  /** Cache API bucket name. Defaults to {@link DEFAULT_LITERT_CACHE_NAME}. */
  cacheName?: string;
  /**
   * Progress callback. `total` is `0` when the server sent no
   * `Content-Length`. A cache hit reports `(size, size)` once.
   */
  onProgress?: (received: number, total: number) => void;
  /** Aborts the network download (cache lookups are not cancellable). */
  signal?: AbortSignal;
}

/**
 * Fetches `url` as bytes, serving repeat calls from the Cache API. Cache
 * failures (no `caches`, quota, opaque responses) fall through to the
 * network and never fail the download.
 */
export async function fetchCachedModel(
  url: string,
  {
    cacheName = DEFAULT_LITERT_CACHE_NAME,
    onProgress,
    signal,
  }: FetchCachedModelOptions = {}
): Promise<Uint8Array<ArrayBuffer>> {
  const cache = await openCache(cacheName);
  if (cache) {
    const hit = await cache.match(url).catch(() => undefined);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      onProgress?.(bytes.length, bytes.length);
      return bytes;
    }
  }

  const response = await fetch(url, {signal});
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  const bytes = await readWithProgress(response, onProgress);

  if (cache) {
    try {
      await cache.put(url, new Response(bytes.slice()));
    } catch (error) {
      console.warn(`LiteRT: could not cache ${url}:`, error);
    }
  }
  return bytes;
}

/** Removes one cached model, or the whole bucket when `url` is omitted. */
export async function evictCachedModel(
  url?: string,
  cacheName = DEFAULT_LITERT_CACHE_NAME
): Promise<boolean> {
  if (!('caches' in globalThis)) return false;
  try {
    if (!url) return await caches.delete(cacheName);
    const cache = await caches.open(cacheName);
    return await cache.delete(url);
  } catch {
    return false;
  }
}

async function openCache(name: string): Promise<Cache | null> {
  if (!('caches' in globalThis)) return null;
  try {
    return await caches.open(name);
  } catch {
    return null;
  }
}

async function readWithProgress(
  response: Response,
  onProgress?: (received: number, total: number) => void
): Promise<Uint8Array<ArrayBuffer>> {
  const total = Number(response.headers.get('Content-Length')) || 0;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress?.(bytes.length, bytes.length);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
