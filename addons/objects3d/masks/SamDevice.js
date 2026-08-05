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
const SAM_ATTENTION_ELEMENTS = 4096 * 4096 * 12;
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
function samDeviceCandidates(adapter) {
    const cpu = { device: 'wasm', dtype: 'fp32' };
    if (!adapter)
        return [cpu];
    const maxBinding = adapter.limits.maxStorageBufferBindingSize ?? 0;
    if (maxBinding < SAM_ATTENTION_ELEMENTS * 2) {
        console.warn(`[objects3d] WebGPU maxStorageBufferBindingSize ${maxBinding} is below ` +
            `SAM's ${SAM_ATTENTION_ELEMENTS * 2} byte attention binding; expect ` +
            `WebGPU validation warnings during encode`);
    }
    const gpu = [];
    if (adapter.features.has('shader-f16')) {
        gpu.push({ device: 'webgpu', dtype: 'fp16' });
    }
    gpu.push({ device: 'webgpu', dtype: 'fp32' });
    return [...gpu, cpu];
}

export { SAM_ATTENTION_ELEMENTS, samDeviceCandidates };
