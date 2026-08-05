/**
 * Device selection for the SlimSAM mask backend.
 *
 * Kept free of `@huggingface/transformers` imports so the capability logic can
 * be unit tested without the runtime-only peer dependency.
 */
/**
 * SlimSAM's ViT runs 1024x1024 / patch 16 = 4096 tokens over 12 heads, so the
 * attention MatMul binds a buffer of this many elements: 384 MB at fp16. The
 * WebGPU spec default `maxStorageBufferBindingSize` is only 128 MB and
 * onnxruntime already requests the adapter maximum, so a device capped at the
 * default logs uncaught "Binding size ... is larger than the maximum storage
 * buffer binding size" validation errors during the encode.
 *
 * Those are noisy but recoverable: onnxruntime falls back per node and still
 * produces masks. Routing such devices to wasm instead is worse, because the
 * wasm backend runs synchronously on the main thread and stalls the render
 * loop long enough to look like a frozen app in a headset. The input cannot be
 * shrunk to fit either, as the exported graph fixes `pixel_values` at
 * 1024x1024. So this is used only to warn, never to switch backend.
 */
export declare const SAM_ATTENTION_ELEMENTS: number;
/** The WebGPU adapter fields the SAM device choice depends on. */
export interface SamGpuAdapterInfo {
    /** Adapter feature set, queried for `shader-f16`. */
    features: {
        has(feature: string): boolean;
    };
    /** Adapter limits, queried for `maxStorageBufferBindingSize`. */
    limits: {
        maxStorageBufferBindingSize?: number;
    };
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
 * `navigator.gpu` means WebGPU + fp16 will work, this checks the `shader-f16`
 * feature that fp16 actually needs. Every entry loads the same model, so masks
 * stay consistent across devices.
 *
 * A storage buffer binding limit below {@link SAM_ATTENTION_ELEMENTS} is only
 * warned about, never acted on. CPU stays last precisely because the wasm
 * backend blocks the main thread, so it must never pre-empt a GPU
 * configuration that merely logs recoverable validation warnings.
 *
 * @param adapter - WebGPU adapter info, or `null` when WebGPU is unavailable.
 * @returns Load configurations in preference order, never empty.
 */
export declare function samDeviceCandidates(adapter: SamGpuAdapterInfo | null): SamLoadOption[];
