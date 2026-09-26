/**
 * Downloads a model file once and keeps it in the Cache API, reporting
 * streamed progress so a spatial panel can show "12 / 71 MB" while the
 * (large) first download runs.
 */
/** Cache API bucket shared by demos unless they pass their own. */
export declare const DEFAULT_LITERT_CACHE_NAME = "xrblocks-litert-v1";
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
export declare function fetchCachedModel(url: string, { cacheName, onProgress, signal, }?: FetchCachedModelOptions): Promise<Uint8Array<ArrayBuffer>>;
/** Removes one cached model, or the whole bucket when `url` is omitted. */
export declare function evictCachedModel(url?: string, cacheName?: string): Promise<boolean>;
