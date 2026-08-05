/**
 * MediaPipe InteractiveSegmenter mask backend.
 *
 * Looser than SAM but requires no model download. Used when
 * `maskBackend === 'mediapipe'`. All heavy dependencies are loaded at runtime
 * with dynamic `import()`.
 */
type InteractiveSegmenter = unknown;
/** Mask result compatible with {@link sampleDepthInMask}. */
export interface SegmenterMaskResult {
    /** Mask width in pixels. */
    readonly width: number;
    /** Mask height in pixels. */
    readonly height: number;
    /** Raw pixel data; values `< 128` are foreground. */
    getAsUint8Array(): Uint8Array;
    /** Release GPU resources held by the underlying MediaPipe mask. */
    close(): void;
}
/**
 * Lazily initialise the MediaPipe `InteractiveSegmenter`. The segmenter is
 * shared across all calls to avoid repeated initialisation cost.
 *
 * @returns Initialised `InteractiveSegmenter` instance.
 */
export declare function getSegmenter(): Promise<InteractiveSegmenter>;
/**
 * Obtain a segmentation mask for one detected object using the MediaPipe
 * `InteractiveSegmenter`. The bbox centre is used as the keypoint prompt.
 *
 * @param snapshot - Raw camera snapshot at detection time.
 * @param box2d - Normalised 2-D bounding box (`[0, 1]` range).
 * @returns Mask with foreground pixels at value `< 128`, or `null` on failure.
 */
export declare function segmenterMaskFromSnapshot(snapshot: ImageData, box2d: {
    min: {
        x: number;
        y: number;
    };
    max: {
        x: number;
        y: number;
    };
}): Promise<SegmenterMaskResult | null>;
export {};
