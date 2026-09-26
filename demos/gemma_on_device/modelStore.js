export const MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/b3ca0d2f076785a8f4b2219ddbd2bdb99954eae1/gemma-4-E2B-it-web.litertlm';
export const MODEL_BYTES = 2_008_432_640;
export const CACHE_NAME = 'xrblocks-gemma-4-e2b-v1';

function complete(response) {
  return (
    response?.ok &&
    response.body !== null &&
    Number(response.headers.get('content-length')) === MODEL_BYTES
  );
}

export async function hasCachedModel() {
  const response = await (await caches.open(CACHE_NAME)).match(MODEL_URL);
  const ready = Boolean(complete(response));
  await response?.body?.cancel();
  return ready;
}

export async function openCachedModel() {
  const response = await (await caches.open(CACHE_NAME)).match(MODEL_URL);
  if (!complete(response)) {
    await response?.body?.cancel();
    throw new Error('No complete cached model. Download Gemma 4 first.');
  }
  return response.body;
}

export async function downloadModel({signal, onProgress = () => {}} = {}) {
  signal?.throwIfAborted();
  if (await hasCachedModel()) return;

  const estimate = await navigator.storage?.estimate?.();
  if (
    Number.isFinite(estimate?.quota) &&
    Number.isFinite(estimate?.usage) &&
    estimate.quota - estimate.usage < MODEL_BYTES
  ) {
    throw new Error('Not enough browser storage space for the 2 GB model.');
  }
  signal?.throwIfAborted();

  const response = await fetch(MODEL_URL, {signal});
  const advertisedSize = response.headers.get('content-length');
  if (
    !response.ok ||
    !response.body ||
    (advertisedSize !== null && Number(advertisedSize) !== MODEL_BYTES)
  ) {
    await response.body?.cancel();
    if (!response.ok) {
      throw new Error(`Model download failed: HTTP ${response.status}.`);
    }
    if (!response.body) throw new Error('Model download has no response body.');
    throw new Error('The model download has an unexpected size.');
  }

  const cache = await caches.open(CACHE_NAME);
  const reader = response.body.getReader();
  let received = 0;
  onProgress({received, total: MODEL_BYTES, phase: 'downloading'});
  // Cache a single stream before loading it: teeing 2 GB can buffer a slow branch.
  const body = new ReadableStream({
    async pull(controller) {
      try {
        signal?.throwIfAborted();
        const {done, value} = await reader.read();
        signal?.throwIfAborted();
        if (done) {
          if (received !== MODEL_BYTES) {
            throw new Error('Incomplete model download: unexpected size.');
          }
          onProgress({received, total: MODEL_BYTES, phase: 'saving'});
          controller.close();
          return;
        }
        received += value.byteLength;
        if (received > MODEL_BYTES) {
          throw new Error('The model download exceeds its expected size.');
        }
        onProgress({received, total: MODEL_BYTES, phase: 'downloading'});
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });

  try {
    await cache.put(
      MODEL_URL,
      new Response(body, {
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(MODEL_BYTES),
        },
      })
    );
    signal?.throwIfAborted();
  } catch (error) {
    try {
      await reader.cancel(error);
      await cache.delete(MODEL_URL);
    } finally {
      reader.releaseLock();
    }
    signal?.throwIfAborted();
    throw error;
  }
  reader.releaseLock();
}
