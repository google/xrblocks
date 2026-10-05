import {ASSETS, CACHE_NAME, MODEL_BASE} from './modelConfig.js';

const HEADROOM_BYTES = 32 * 1024 * 1024;

/** @param {CacheStorage | undefined} cacheStorage */
function openCache(cacheStorage) {
  if (!cacheStorage) throw new Error('Browser cache storage is unavailable.');
  return cacheStorage.open(CACHE_NAME);
}

/**
 * @param {Response} response
 * @param {number} bytes
 */
function matchesSize(response, bytes) {
  return (
    response.ok && Number(response.headers.get('Content-Length')) === bytes
  );
}

/**
 * Inspect cached headers without reading response bodies.
 * @param {{cacheStorage?: CacheStorage, assets?: typeof ASSETS}} [options]
 */
export async function inspectCache({
  cacheStorage = globalThis.caches,
  assets = ASSETS,
} = {}) {
  const cache = await openCache(cacheStorage);
  const totalBytes = assets.reduce((total, {bytes}) => total + bytes, 0);
  const missing = [];
  let presentBytes = 0;
  for (const asset of assets) {
    const response = await cache.match(asset.url);
    if (response && matchesSize(response, asset.bytes)) {
      presentBytes += asset.bytes;
    } else {
      missing.push(asset);
    }
    void response?.body?.cancel();
  }
  return {
    complete: missing.length === 0,
    missing,
    missingBytes: totalBytes - presentBytes,
    presentBytes,
    totalBytes,
  };
}

/**
 * Ask for durable storage and check the quota before a consented download.
 * @param {number} missingBytes
 * @param {{storage?: StorageManager}} [options]
 * @returns {Promise<{persistent: boolean | null, quotaKnown: boolean}>}
 */
export async function prepareStorage(
  missingBytes,
  {storage = globalThis.navigator?.storage} = {}
) {
  let persistent = null;
  try {
    persistent = (await storage?.persisted?.()) ?? null;
    if (persistent !== true && storage?.persist) {
      persistent = await storage.persist();
    }
  } catch {
    persistent = null;
  }
  let estimate;
  try {
    estimate = await storage?.estimate?.();
  } catch {
    estimate = undefined;
  }
  const quotaKnown =
    Number.isFinite(estimate?.quota) && Number.isFinite(estimate?.usage);
  if (quotaKnown) {
    const available = estimate.quota - estimate.usage;
    const required = missingBytes + HEADROOM_BYTES;
    if (available < required) {
      throw new Error(
        `Not enough browser storage: ${Math.ceil(required / 1e6)} MB needed, ${Math.floor(available / 1e6)} MB available.`
      );
    }
  }
  return {persistent, quotaKnown};
}

/**
 * @param {ArrayBuffer} bytes
 * @returns {Promise<string>}
 */
export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Download missing assets, verify byte length and SHA-256, then cache them
 * under the exact URLs the runtime requests.
 * @param {{
 *   onProgress?: (event: {loaded: number, total: number, file: string}) => void,
 *   signal?: AbortSignal,
 *   fetchImpl?: typeof fetch,
 *   cacheStorage?: CacheStorage,
 *   assets?: typeof ASSETS,
 * }} [options]
 */
export async function downloadAssets({
  onProgress = () => {},
  signal,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  cacheStorage = globalThis.caches,
  assets = ASSETS,
} = {}) {
  const {missing, presentBytes, totalBytes} = await inspectCache({
    cacheStorage,
    assets,
  });
  const cache = await openCache(cacheStorage);
  let completed = presentBytes;
  onProgress({loaded: completed, total: totalBytes, file: ''});
  for (const asset of missing) {
    signal?.throwIfAborted();
    const response = await fetchImpl(asset.url, {signal});
    if (!response.ok || !response.body) {
      void response.body?.cancel();
      throw new Error(
        `Could not download ${asset.file}: HTTP ${response.status}.`
      );
    }
    const reader = response.body.getReader();
    const bytes = new Uint8Array(asset.bytes);
    let received = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      if (received + value.length > asset.bytes) {
        await reader.cancel();
        throw new Error(`${asset.file} is larger than expected.`);
      }
      bytes.set(value, received);
      received += value.length;
      onProgress({
        loaded: completed + received,
        total: totalBytes,
        file: asset.file,
      });
    }
    if (received !== asset.bytes) {
      throw new Error(
        `${asset.file} is incomplete: ${received} of ${asset.bytes} bytes.`
      );
    }
    if ((await sha256(bytes.buffer)) !== asset.sha256) {
      throw new Error(`${asset.file} failed its integrity check.`);
    }
    signal?.throwIfAborted();
    await cache.put(
      asset.url,
      new Response(bytes, {
        headers: {'Content-Length': String(asset.bytes)},
      })
    );
    completed += asset.bytes;
  }
  onProgress({loaded: totalBytes, total: totalBytes, file: ''});
  return {downloadedBytes: completed - presentBytes};
}

/**
 * @param {string} file A model file name from the manifest.
 * @param {{cacheStorage?: CacheStorage, assets?: typeof ASSETS, base?: string}} [options]
 */
export async function readCachedJSON(
  file,
  {cacheStorage = globalThis.caches, assets = ASSETS, base = MODEL_BASE} = {}
) {
  const asset = assets.find((candidate) => candidate.url === base + file);
  if (!asset) throw new Error(`${file} is not a pinned model file.`);
  const cache = await openCache(cacheStorage);
  const response = await cache.match(asset.url);
  if (!response || !matchesSize(response, asset.bytes)) {
    void response?.body?.cancel();
    throw new Error(`${file} is not cached. Choose Download.`);
  }
  return JSON.parse(await response.text());
}

/**
 * Runtime fetch for Transformers.js. Every model and runtime file is served
 * from the cache, so any network request is refused.
 * @type {typeof fetch}
 */
export async function cacheOnlyFetch(input) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  throw new Error(`Not cached: ${url}. Choose Download to fetch the model.`);
}
