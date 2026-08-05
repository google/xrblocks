/**
 * SlimSAM-77-uniform mask backend via `@huggingface/transformers`.
 *
 * All heavy dependencies are loaded at runtime with dynamic `import()` so the
 * addon bundle stays external-free at build time.
 */
type SamModel = unknown;
type AutoProcessor = unknown;
type RawImage = unknown;
/** Hugging Face model ID for SlimSAM-77-uniform. Apache-2 licensed, ~14 MB. */
export declare const SAM_MODEL_ID = "Xenova/slimsam-77-uniform";
export { SAM_ATTENTION_ELEMENTS, samDeviceCandidates, type SamGpuAdapterInfo, type SamLoadOption, } from './SamDevice';
/** Encoded snapshot state reused across all per-detection mask calls. */
export interface SamState {
    /** The RawImage wrapper used by the processor. */
    image: RawImage;
    /** Raw processor inputs (cached for the decoder). */
    image_inputs: object;
    /** Image embeddings from the SAM encoder (reused per detection). */
    image_embeddings: object;
    /** Snapshot width in pixels. */
    width: number;
    /** Snapshot height in pixels. */
    height: number;
}
/** Mask-compatible return value from the SAM decoder. */
export interface SamMaskResult {
    /** Mask width in pixels. */
    readonly width: number;
    /** Mask height in pixels. */
    readonly height: number;
    /** Raw pixel buffer; values `< 128` are foreground. */
    getAsUint8Array(): Uint8Array;
    /** No-op for API compatibility with MediaPipe masks. */
    close(): void;
}
/**
 * Enqueue `fn` behind the SAM serialisation queue. Ensures that at most one
 * SAM call is in flight at a time (the ONNX runtime is not re-entrant).
 *
 * @param fn - Async factory that performs one SAM operation.
 * @returns Promise resolving to `fn`'s return value.
 */
export declare function samSerialize<T>(fn: () => Promise<T>): Promise<T>;
/**
 * Lazily load SlimSAM-77-uniform model and processor, preferring WebGPU when
 * the adapter can actually run it and falling back through lower-precision and
 * CPU configurations of the same model.
 *
 * @returns Model and processor instances.
 */
export declare function getSam(): Promise<{
    sam: SamModel;
    proc: AutoProcessor;
}>;
/**
 * Run the SAM encoder on a snapshot `ImageData` (once per detect press).
 * Subsequent per-detection mask requests reuse the returned `SamState`.
 *
 * @param snapshot - Raw camera snapshot to encode.
 * @returns Encoder state containing the image embedding and dimensions.
 */
export declare function samEncodeSnapshot(snapshot: ImageData): Promise<SamState>;
/**
 * Decode a single object mask from the SAM encoder state using a 2D bbox
 * prompt. Returns a mask in the same shape that
 * {@link sampleDepthInMask} already accepts from the MediaPipe segmenter.
 *
 * @param samState - Encoder state from {@link samEncodeSnapshot}.
 * @param box2d - Normalised 2-D bounding box (`[0, 1]` range).
 * @returns Mask with foreground pixels at value `< 128`.
 */
export declare function samMaskFromBbox(samState: SamState, box2d: {
    min: {
        x: number;
        y: number;
    };
    max: {
        x: number;
        y: number;
    };
}): Promise<SamMaskResult>;
