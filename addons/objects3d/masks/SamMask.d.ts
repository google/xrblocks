import { LiteRtAccelerator } from "../../litert/LiteRtRuntime.js";
import { RunModelFn } from "../../litert/compileModel.js";
import "../../litert/index.js";
import { CompiledModel } from "@litertjs/core";
//#region src/addons/objects3d/masks/SamMask.d.ts
/** Hosted LiteRT `.tflite` encoder for EfficientSAM-Ti (512×512 input). */
export declare const EFFICIENTSAM_TI_ENCODER_URL = "https://rawcdn.githack.com/xrblocks/proprietary-assets/15e67828b08e0b05160cc8d497106bd600312517/tflite_models/efficientsam/efficientsam_ti_encoder.tflite";
/** Hosted LiteRT `.tflite` decoder for EfficientSAM-Ti (up to 6 prompt points). */
export declare const EFFICIENTSAM_TI_DECODER_URL = "https://rawcdn.githack.com/xrblocks/proprietary-assets/15e67828b08e0b05160cc8d497106bd600312517/tflite_models/efficientsam/efficientsam_ti_decoder.tflite";
/** Encoder input spatial resolution (`512×512`). */
export declare const SAM_IMG_SIZE = 512;
/** Low-resolution mask logit grid output by the decoder (`128×128`). */
export declare const SAM_MASK_LOW_RES = 128;
/** Encoder output channel count (`[1, 256, 32, 32]`). */
export declare const SAM_EMBED_DIM = 256;
/** Encoder output spatial grid size (`512 / 16 = 32`). */
export declare const SAM_EMBED_GRID = 32;
/** Static prompt point capacity of the exported decoder (`[1, 6, 2]`). */
export declare const SAM_MAX_POINTS = 6;
/** Loaded EfficientSAM-Ti encoder and decoder handle. */
export interface SamModels {
  encoder: CompiledModel;
  decoder: CompiledModel;
  encoderAccelerator: LiteRtAccelerator;
  decoderAccelerator: LiteRtAccelerator;
}
/** Encoded snapshot state reused across all per-detection mask calls. */
export interface SamState {
  /** Image embeddings `[1, 256, 32, 32]` from the EfficientSAM-Ti encoder. */
  imageEmbeddings: Float32Array;
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
 * SAM call is in flight at a time.
 *
 * @param fn - Async factory that performs one SAM operation.
 * @returns Promise resolving to `fn`'s return value.
 */
export declare function samSerialize<T>(fn: () => Promise<T>): Promise<T>;
/**
 * Lazily load and compile the EfficientSAM-Ti encoder and decoder via LiteRT,
 * preferring WebGPU and automatically falling back to WASM.
 *
 * @returns Compiled encoder and decoder models.
 */
export declare function getSam(): Promise<SamModels>;
/** Test hook: reset the cached SAM models and pending promise. */
export declare function resetSamForTesting(): void;
/**
 * Convert an RGBA snapshot into a planar `Float32Array` of shape
 * `[1, 3, targetSize, targetSize]` normalized to `[0, 1]`. Uses bilinear
 * sampling when the snapshot dimensions differ from `targetSize`.
 *
 * @param snapshot - Raw RGBA image buffer and dimensions.
 * @param targetSize - Output square resolution (defaults to `512`).
 * @returns Planar RGB `Float32Array` in `[0, 1]`.
 */
export declare function snapshotToPlanarFloat32(snapshot: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}, targetSize?: number): Float32Array;
/**
 * Build the `[1, maxPoints, 2]` point coordinates and `[1, maxPoints]` prompt
 * labels for a normalised 2-D bounding box:
 * - Slot 0: bbox centre `(cx, cy)` with label `1.0` (foreground point)
 * - Slot 1: top-left `(x1, y1)` with label `2.0` (box top-left)
 * - Slot 2: bottom-right `(x2, y2)` with label `3.0` (box bottom-right)
 * - Remaining slots: `(-1, -1)` with label `-1.0` (padding)
 *
 * @param box2d - Normalised 2-D bounding box in `[0, 1]`.
 * @param imgSize - Encoder image resolution (defaults to `512`).
 * @param maxPoints - Prompt slot count (defaults to `6`).
 * @returns `{points, labels}` Float32Arrays.
 */
export declare function buildBboxPrompt(box2d: {
  min: {
    x: number;
    y: number;
  };
  max: {
    x: number;
    y: number;
  };
}, imgSize?: number, maxPoints?: number): {
  points: Float32Array;
  labels: Float32Array;
};
/**
 * Select the highest-scoring candidate mask (`containment + 0.05 * iou`) and
 * bilinearly upsample its `lowRes × lowRes` logits to `outWidth × outHeight`.
 *
 * @param masksLogits - Raw mask logits of shape `[1, C, lowRes, lowRes]`.
 * @param ious - Predicted IoU scores of shape `[1, C]`.
 * @param box2d - Normalised 2-D bounding box in `[0, 1]`.
 * @param outWidth - Target mask width in pixels.
 * @param outHeight - Target mask height in pixels.
 * @param lowRes - Decoder logit spatial resolution (defaults to `128`).
 * @returns `SamMaskResult` with foreground pixels set to `0` (`< 128`) and
 *   background pixels set to `255`.
 */
export declare function decodeMaskLogits(masksLogits: Float32Array, ious: Float32Array | undefined, box2d: {
  min: {
    x: number;
    y: number;
  };
  max: {
    x: number;
    y: number;
  };
}, outWidth: number, outHeight: number, lowRes?: number): SamMaskResult;
/**
 * Run the EfficientSAM-Ti encoder on a snapshot `ImageData` (once per detect
 * press). Subsequent per-detection mask requests reuse the returned `SamState`.
 *
 * @param snapshot - Raw camera snapshot to encode.
 * @param run - Optional `runModel` override for unit testing.
 * @returns Encoder state containing the image embedding and snapshot dimensions.
 */
export declare function samEncodeSnapshot(snapshot: ImageData, run?: RunModelFn): Promise<SamState>;
/**
 * Decode a single object mask from the EfficientSAM-Ti encoder state using a
 * 2D bbox prompt. Returns a mask in the same shape that
 * {@link sampleDepthInMask} already accepts from the MediaPipe segmenter.
 *
 * @param samState - Encoder state from {@link samEncodeSnapshot}.
 * @param box2d - Normalised 2-D bounding box (`[0, 1]` range).
 * @param run - Optional `runModel` override for unit testing.
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
}, run?: RunModelFn): Promise<SamMaskResult>;
//#endregion