/**
 * Device selection for the SlimSAM mask backend.
 *
 * Kept free of `@huggingface/transformers` imports so the capability logic can
 * be unit tested without the runtime-only peer dependency.
 */

/**
 * SlimSAM's ViT runs 1024x1024 / patch 16 = 4096 tokens over 12 heads, so the
 * attention MatMul binds a buffer of this many elements: 384 MB at fp16 and
 * 768 MB at fp32. The WebGPU spec default `maxStorageBufferBindingSize` is
 * only 128 MB, and onnxruntime already requests the adapter maximum, so on a
 * device capped at the default this cannot be raised. Exceeding it surfaces as
 * an uncaught "Binding size ... is larger than the maximum storage buffer
 * binding size" validation error part-way through the encode rather than as a
 * clean load failure, so the limit has to be checked before picking WebGPU.
 */
export const SAM_ATTENTION_ELEMENTS = 4096 * 4096 * 12;

/** The WebGPU adapter fields the SAM device choice depends on. */
export interface SamGpuAdapterInfo {
  /** Adapter feature set, queried for `shader-f16`. */
  features: {has(feature: string): boolean};
  /** Adapter limits, queried for `maxStorageBufferBindingSize`. */
  limits: {maxStorageBufferBindingSize?: number};
}

/**
 * A `from_pretrained` backend configuration to attempt.
 *
 * Declared as a type alias rather than an interface so it stays assignable to
 * the `Record<string, unknown>` options parameter of `from_pretrained`.
 */
export type SamLoadOption = {
  /** transformers.js execution device. */
  device: 'webgpu' | 'wasm';
  /** Weight precision for that device. */
  dtype: 'fp16' | 'fp32';
};

/**
 * Build the ordered list of load configurations to try for SlimSAM.
 *
 * transformers.js does not quietly downgrade when `device` is passed
 * explicitly: an unsupported backend throws. So rather than assuming a present
 * `navigator.gpu` means WebGPU + fp16 will work, this checks the two things
 * that actually gate it — the `shader-f16` feature and a storage buffer
 * binding limit large enough for {@link SAM_ATTENTION_ELEMENTS}. CPU is always
 * kept as the final entry so a driver-level failure the capability check
 * didn't predict still ends up on a working configuration. Every entry loads
 * the same model, so masks stay consistent across devices.
 *
 * @param adapter - WebGPU adapter info, or `null` when WebGPU is unavailable.
 * @returns Load configurations in preference order, never empty.
 */
export function samDeviceCandidates(
  adapter: SamGpuAdapterInfo | null
): SamLoadOption[] {
  const cpu: SamLoadOption = {device: 'wasm', dtype: 'fp32'};
  if (!adapter) return [cpu];
  const maxBinding = adapter.limits.maxStorageBufferBindingSize ?? 0;
  const fits = (bytesPerElement: number) =>
    maxBinding >= SAM_ATTENTION_ELEMENTS * bytesPerElement;
  const gpu: SamLoadOption[] = [];
  if (adapter.features.has('shader-f16') && fits(2)) {
    gpu.push({device: 'webgpu', dtype: 'fp16'});
  }
  if (fits(4)) {
    gpu.push({device: 'webgpu', dtype: 'fp32'});
  }
  return [...gpu, cpu];
}
