/**
 * Compile-and-run helpers around `@litertjs/core`, imported dynamically so
 * the addon bundle carries no static dependency on it.
 */
import type { CompiledModel, TypedArray } from '@litertjs/core';
import { type LiteRtAccelerator } from './LiteRtRuntime';
export interface CompileModelOptions {
    /** Accelerator to try first, normally `runtime.accelerator`. */
    accelerator: LiteRtAccelerator;
    /**
     * When a WebGPU compile fails, compile for wasm instead of throwing.
     * WebGPU exists on paper in more browsers than it works in.
     */
    fallbackToWasm?: boolean;
    /** XNNPACK options applied when the model ends up on wasm. */
    cpuOptions?: {
        numThreads?: number;
    };
}
export interface CompiledModelHandle {
    model: CompiledModel;
    /** The accelerator the model actually compiled for. */
    accelerator: LiteRtAccelerator;
    /** Set when the requested accelerator failed and wasm was used instead. */
    fallbackError?: unknown;
}
/**
 * Compiles `.tflite` bytes. Requires {@link loadLiteRtRuntime} to have
 * resolved first.
 */
export declare function compileModel(bytes: Uint8Array, { accelerator, fallbackToWasm, cpuOptions }: CompileModelOptions): Promise<CompiledModelHandle>;
/** One model input: a typed array plus its tensor shape. */
export interface ModelInput {
    data: TypedArray;
    shape: number[];
}
/**
 * Runs one inference: wraps the inputs in tensors, reads every output back
 * to host memory, and deletes all tensors (also on failure).
 */
export declare function runModel(model: CompiledModel, inputs: ModelInput[]): Promise<TypedArray[]>;
/** Signature demos accept so their model code can be tested without LiteRT. */
export type RunModelFn = typeof runModel;
