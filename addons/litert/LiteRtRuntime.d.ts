/**
 * LiteRT.js runtime bootstrap.
 *
 * `@litertjs/core` is an external peer dependency resolved by the page's
 * import map and loaded with a dynamic `import()`, so nothing from it is
 * bundled into `xrblocks`. The wasm runtime itself is fetched from a CDN by
 * default; no model or runtime file has to be checked in.
 */
import type { LiteRt } from '@litertjs/core';
/** The dynamically imported `@litertjs/core` module. */
export type LiteRtCore = typeof import('@litertjs/core');
/** Accelerators LiteRT.js can compile a model for. */
export type LiteRtAccelerator = 'webgpu' | 'wasm';
/** Pin the wasm runtime to the same version as the ESM entry in the import map. */
export declare const LITERT_VERSION = "2.5.3";
/** Directory holding `litert_wasm_*_internal.{js,wasm}` (trailing slash). */
export declare const DEFAULT_LITERT_WASM_DIR = "https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.3/wasm/";
/** The Emscripten glue LiteRT.js picks for the `{threads: true}` build. */
export declare const LITERT_THREADED_GLUE_FILE = "litert_wasm_threaded_internal.js";
export interface LoadLiteRtRuntimeOptions {
    /** Where the wasm runtime lives. Defaults to {@link DEFAULT_LITERT_WASM_DIR}. */
    wasmDir?: string;
    /**
     * Try the multi-threaded runtime first. Only honored on a cross-origin
     * isolated page (`crossOriginIsolated === true`); otherwise the
     * single-threaded build is loaded directly.
     */
    preferThreads?: boolean;
    /**
     * Accelerator to report for model compilation. Defaults to `'webgpu'`
     * when `isWebGPUSupported()` says so, else `'wasm'`.
     */
    preferAccelerator?: LiteRtAccelerator;
}
export interface LiteRtRuntime {
    /** The imported `@litertjs/core` module (`Tensor`, `loadAndCompile`, …). */
    core: LiteRtCore;
    /** The loaded runtime. */
    liteRt: LiteRt;
    /** Accelerator models should be compiled for on this device. */
    accelerator: LiteRtAccelerator;
    /** Whether the multi-threaded wasm build is the one that loaded. */
    threads: boolean;
    /** The wasm directory that was used. */
    wasmDir: string;
}
/**
 * Loads LiteRT.js once per page and resolves with the runtime plus the
 * accelerator to use. Concurrent and repeated calls share one load; a failed
 * load can be retried by calling again.
 *
 * Call this before {@link compileModel}: LiteRT.js keeps one global runtime
 * and `loadAndCompile` throws until it exists.
 */
export declare function loadLiteRtRuntime(options?: LoadLiteRtRuntimeOptions): Promise<LiteRtRuntime>;
/** Test hook: forget the shared runtime promise. Does not unload LiteRT. */
export declare function resetLiteRtRuntimeForTesting(): void;
/**
 * Human-readable text for anything a LiteRT.js or fetch failure can throw:
 * `Error` objects, bare strings, and `Event`s from a failed `<script>` load.
 */
export declare function describeError(error: unknown): string;
/** Threads to give XNNPACK: the hardware count, capped. */
export declare function defaultNumThreads(max?: number): number;
