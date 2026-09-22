/**
 * Compile-and-run helpers around `@litertjs/core`, imported dynamically so
 * the addon bundle carries no static dependency on it.
 */

import type {CompiledModel, TypedArray} from '@litertjs/core';

import {describeError, type LiteRtAccelerator} from './LiteRtRuntime';

export interface CompileModelOptions {
  /** Accelerator to try first, normally `runtime.accelerator`. */
  accelerator: LiteRtAccelerator;
  /**
   * When a WebGPU compile fails, compile for wasm instead of throwing.
   * WebGPU exists on paper in more browsers than it works in.
   */
  fallbackToWasm?: boolean;
  /** XNNPACK options applied when the model ends up on wasm. */
  cpuOptions?: {numThreads?: number};
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
export async function compileModel(
  bytes: Uint8Array,
  {accelerator, fallbackToWasm = true, cpuOptions}: CompileModelOptions
): Promise<CompiledModelHandle> {
  const core = await import('@litertjs/core');
  const compile = (target: LiteRtAccelerator) =>
    core.loadAndCompile(bytes, {
      accelerator: target,
      ...(target === 'wasm' && cpuOptions ? {cpuOptions} : {}),
    });

  try {
    return {model: await compile(accelerator), accelerator};
  } catch (error) {
    if (accelerator === 'wasm' || !fallbackToWasm) throw error;
    console.warn(
      `LiteRT: ${accelerator} compile failed (${describeError(error)}); ` +
        'falling back to wasm.'
    );
    return {
      model: await compile('wasm'),
      accelerator: 'wasm',
      fallbackError: error,
    };
  }
}

/** One model input: a typed array plus its tensor shape. */
export interface ModelInput {
  data: TypedArray;
  shape: number[];
}

/**
 * Runs one inference: wraps the inputs in tensors, reads every output back
 * to host memory, and deletes all tensors (also on failure).
 */
export async function runModel(
  model: CompiledModel,
  inputs: ModelInput[]
): Promise<TypedArray[]> {
  const {Tensor} = await import('@litertjs/core');
  const inputTensors = [];
  const outputTensors = [];
  try {
    for (const input of inputs) {
      inputTensors.push(Tensor.fromTypedArray(input.data, input.shape));
    }
    const outputs = await model.run(inputTensors);
    outputTensors.push(...outputs);
    const buffers: TypedArray[] = [];
    for (const output of outputs) {
      buffers.push(await output.data());
    }
    return buffers;
  } finally {
    for (const tensor of [...inputTensors, ...outputTensors]) {
      try {
        tensor.delete();
      } catch {
        // Already deleted or never allocated.
      }
    }
  }
}

/** Signature demos accept so their model code can be tested without LiteRT. */
export type RunModelFn = typeof runModel;
