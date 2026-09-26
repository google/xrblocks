/**
 * Public barrel export for the `litert` addon.
 *
 * Import from this file (or from `'xrblocks/addons/litert/index.js'`) to load
 * LiteRT.js from a CDN, download and cache `.tflite` models, and run them.
 */
export { DEFAULT_LITERT_WASM_DIR, LITERT_THREADED_GLUE_FILE, LITERT_VERSION, defaultNumThreads, describeError, loadLiteRtRuntime, } from './LiteRtRuntime';
export type { LiteRtAccelerator, LiteRtCore, LiteRtRuntime, LoadLiteRtRuntimeOptions, } from './LiteRtRuntime';
export { DEFAULT_LITERT_CACHE_NAME, evictCachedModel, fetchCachedModel, } from './fetchCachedModel';
export type { FetchCachedModelOptions } from './fetchCachedModel';
export { compileModel, runModel } from './compileModel';
export type { CompileModelOptions, CompiledModelHandle, ModelInput, RunModelFn, } from './compileModel';
