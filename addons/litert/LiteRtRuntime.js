/**
 * LiteRT.js runtime bootstrap.
 *
 * `@litertjs/core` is an external peer dependency resolved by the page's
 * import map and loaded with a dynamic `import()`, so nothing from it is
 * bundled into `xrblocks`. The wasm runtime itself is fetched from a CDN by
 * default; no model or runtime file has to be checked in.
 */
/** Pin the wasm runtime to the same version as the ESM entry in the import map. */
const LITERT_VERSION = '2.5.3';
/** Directory holding `litert_wasm_*_internal.{js,wasm}` (trailing slash). */
const DEFAULT_LITERT_WASM_DIR = `https://cdn.jsdelivr.net/npm/@litertjs/core@${LITERT_VERSION}/wasm/`;
/** The Emscripten glue LiteRT.js picks for the `{threads: true}` build. */
const LITERT_THREADED_GLUE_FILE = 'litert_wasm_threaded_internal.js';
let runtimePromise;
/**
 * Loads LiteRT.js once per page and resolves with the runtime plus the
 * accelerator to use. Concurrent and repeated calls share one load; a failed
 * load can be retried by calling again.
 *
 * Call this before {@link compileModel}: LiteRT.js keeps one global runtime
 * and `loadAndCompile` throws until it exists.
 */
function loadLiteRtRuntime(options = {}) {
    if (!runtimePromise) {
        runtimePromise = loadRuntime(options).catch((error) => {
            runtimePromise = undefined;
            throw error;
        });
    }
    return runtimePromise;
}
/** Test hook: forget the shared runtime promise. Does not unload LiteRT. */
function resetLiteRtRuntimeForTesting() {
    runtimePromise = undefined;
}
async function loadRuntime({ wasmDir = DEFAULT_LITERT_WASM_DIR, preferThreads = true, preferAccelerator, }) {
    const core = await import('@litertjs/core');
    let liteRt;
    let threads = false;
    // Another script on the page may already own the global runtime; reuse it
    // instead of tripping LiteRT's "already loading / loaded" error.
    const existing = core.getGlobalLiteRtPromise();
    if (existing) {
        liteRt = await existing;
    }
    else {
        const isolated = globalThis.crossOriginIsolated === true;
        const rungs = preferThreads && isolated ? [true, false] : [false];
        let lastError;
        for (const useThreads of rungs) {
            try {
                liteRt = await loadRung(core, wasmDir, useThreads);
                threads = useThreads;
                break;
            }
            catch (error) {
                lastError = error;
                if (useThreads) {
                    console.warn(`LiteRT: threaded runtime failed (${describeError(error)}); ` +
                        'retrying single-threaded.');
                }
            }
        }
        if (!liteRt)
            throw lastError;
    }
    const accelerator = preferAccelerator ?? (core.isWebGPUSupported() ? 'webgpu' : 'wasm');
    return { core, liteRt, accelerator, threads, wasmDir };
}
async function loadRung(core, wasmDir, threads) {
    if (!threads) {
        return core.loadLiteRt(wasmDir, { threads: false });
    }
    // Emscripten pthreads start each worker with `new Worker(<glue URL>)`. A
    // cross-origin glue (the CDN) is refused by the browser, so the glue is
    // fetched with CORS and handed over as a same-origin blob through the
    // `Module.mainScriptUrlOrBlob` hook, which `@litertjs/wasm-utils` forwards
    // when `globalThis.Module` is set before the factory runs.
    const glue = await fetchThreadedGlue(wasmDir);
    const scope = globalThis;
    const previous = scope.Module;
    scope.Module = { mainScriptUrlOrBlob: glue };
    try {
        return await core.loadLiteRt(wasmDir, { threads: true });
    }
    finally {
        if (previous === undefined) {
            delete scope.Module;
        }
        else {
            scope.Module = previous;
        }
    }
}
async function fetchThreadedGlue(wasmDir) {
    const url = new URL(LITERT_THREADED_GLUE_FILE, wasmDir).href;
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
        throw new Error(`${url}: HTTP ${response.status}`);
    }
    return new Blob([await response.text()], { type: 'text/javascript' });
}
/**
 * Human-readable text for anything a LiteRT.js or fetch failure can throw:
 * `Error` objects, bare strings, and `Event`s from a failed `<script>` load.
 */
function describeError(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === 'string')
        return error;
    if (error && typeof error.type === 'string') {
        return `${error.type} event`;
    }
    return String(error);
}
/** Threads to give XNNPACK: the hardware count, capped. */
function defaultNumThreads(max = 8) {
    const cores = globalThis.navigator?.hardwareConcurrency || 4;
    return Math.max(1, Math.min(max, cores));
}

export { DEFAULT_LITERT_WASM_DIR, LITERT_THREADED_GLUE_FILE, LITERT_VERSION, defaultNumThreads, describeError, loadLiteRtRuntime, resetLiteRtRuntimeForTesting };
