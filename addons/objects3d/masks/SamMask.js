import { defaultNumThreads, loadLiteRtRuntime } from "../../litert/LiteRtRuntime.js";
import { fetchCachedModel } from "../../litert/fetchCachedModel.js";
import { compileModel, runModel } from "../../litert/compileModel.js";
import "../../litert/index.js";
//#region src/addons/objects3d/masks/SamMask.ts
/** Hosted LiteRT `.tflite` encoder for EfficientSAM-Ti (512×512 input). */
const EFFICIENTSAM_TI_ENCODER_URL = "https://rawcdn.githack.com/xrblocks/proprietary-assets/15e67828b08e0b05160cc8d497106bd600312517/tflite_models/efficientsam/efficientsam_ti_encoder.tflite";
/** Hosted LiteRT `.tflite` decoder for EfficientSAM-Ti (up to 6 prompt points). */
const EFFICIENTSAM_TI_DECODER_URL = "https://rawcdn.githack.com/xrblocks/proprietary-assets/15e67828b08e0b05160cc8d497106bd600312517/tflite_models/efficientsam/efficientsam_ti_decoder.tflite";
/** Encoder input spatial resolution (`512×512`). */
const SAM_IMG_SIZE = 512;
/** Low-resolution mask logit grid output by the decoder (`128×128`). */
const SAM_MASK_LOW_RES = 128;
/** Encoder output channel count (`[1, 256, 32, 32]`). */
const SAM_EMBED_DIM = 256;
/** Encoder output spatial grid size (`512 / 16 = 32`). */
const SAM_EMBED_GRID = 32;
/** Static prompt point capacity of the exported decoder (`[1, 6, 2]`). */
const SAM_MAX_POINTS = 6;
let _samModels = null;
let _samPromise = null;
let _samQueue = Promise.resolve();
/**
* Enqueue `fn` behind the SAM serialisation queue. Ensures that at most one
* SAM call is in flight at a time.
*
* @param fn - Async factory that performs one SAM operation.
* @returns Promise resolving to `fn`'s return value.
*/
function samSerialize(fn) {
	const next = _samQueue.then(fn, fn);
	_samQueue = next.catch(() => {});
	return next;
}
/**
* Lazily load and compile the EfficientSAM-Ti encoder and decoder via LiteRT,
* preferring WebGPU and automatically falling back to WASM.
*
* @returns Compiled encoder and decoder models.
*/
function getSam() {
	if (_samModels) return Promise.resolve(_samModels);
	if (_samPromise) return _samPromise;
	const pending = (async () => {
		const runtime = await loadLiteRtRuntime();
		const [encBytes, decBytes] = await Promise.all([fetchCachedModel(EFFICIENTSAM_TI_ENCODER_URL), fetchCachedModel(EFFICIENTSAM_TI_DECODER_URL)]);
		const cpuOptions = { numThreads: defaultNumThreads() };
		const encHandle = await compileModel(encBytes, {
			accelerator: runtime.accelerator,
			fallbackToWasm: true,
			cpuOptions
		});
		const decHandle = await compileModel(decBytes, {
			accelerator: runtime.accelerator,
			fallbackToWasm: true,
			cpuOptions
		});
		_samModels = {
			encoder: encHandle.model,
			decoder: decHandle.model,
			encoderAccelerator: encHandle.accelerator,
			decoderAccelerator: decHandle.accelerator
		};
		return _samModels;
	})();
	_samPromise = pending;
	pending.catch(() => {
		if (_samPromise === pending) _samPromise = null;
	});
	return pending;
}
/** Test hook: reset the cached SAM models and pending promise. */
function resetSamForTesting() {
	_samModels = null;
	_samPromise = null;
	_samQueue = Promise.resolve();
}
/**
* Convert an RGBA snapshot into a planar `Float32Array` of shape
* `[1, 3, targetSize, targetSize]` normalized to `[0, 1]`. Uses bilinear
* sampling when the snapshot dimensions differ from `targetSize`.
*
* @param snapshot - Raw RGBA image buffer and dimensions.
* @param targetSize - Output square resolution (defaults to `512`).
* @returns Planar RGB `Float32Array` in `[0, 1]`.
*/
function snapshotToPlanarFloat32(snapshot, targetSize = 512) {
	const { data, width: srcW, height: srcH } = snapshot;
	const hw = targetSize * targetSize;
	const out = new Float32Array(3 * hw);
	const inv255 = 1 / 255;
	if (srcW === targetSize && srcH === targetSize) {
		for (let i = 0; i < hw; i++) {
			const idx = i * 4;
			out[i] = data[idx] * inv255;
			out[hw + i] = data[idx + 1] * inv255;
			out[2 * hw + i] = data[idx + 2] * inv255;
		}
		return out;
	}
	const scaleX = srcW / targetSize;
	const scaleY = srcH / targetSize;
	for (let y = 0; y < targetSize; y++) {
		const sy = Math.max(0, (y + .5) * scaleY - .5);
		const y0 = Math.min(srcH - 1, Math.floor(sy));
		const y1 = Math.min(srcH - 1, y0 + 1);
		const wy = sy - y0;
		const row0 = y0 * srcW;
		const row1 = y1 * srcW;
		const dstRow = y * targetSize;
		for (let x = 0; x < targetSize; x++) {
			const sx = Math.max(0, (x + .5) * scaleX - .5);
			const x0 = Math.min(srcW - 1, Math.floor(sx));
			const x1 = Math.min(srcW - 1, x0 + 1);
			const wx = sx - x0;
			const i00 = (row0 + x0) * 4;
			const i01 = (row0 + x1) * 4;
			const i10 = (row1 + x0) * 4;
			const i11 = (row1 + x1) * 4;
			const w00 = (1 - wy) * (1 - wx) * inv255;
			const w01 = (1 - wy) * wx * inv255;
			const w10 = wy * (1 - wx) * inv255;
			const w11 = wy * wx * inv255;
			const dstIdx = dstRow + x;
			out[dstIdx] = data[i00] * w00 + data[i01] * w01 + data[i10] * w10 + data[i11] * w11;
			out[hw + dstIdx] = data[i00 + 1] * w00 + data[i01 + 1] * w01 + data[i10 + 1] * w10 + data[i11 + 1] * w11;
			out[2 * hw + dstIdx] = data[i00 + 2] * w00 + data[i01 + 2] * w01 + data[i10 + 2] * w10 + data[i11 + 2] * w11;
		}
	}
	return out;
}
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
function buildBboxPrompt(box2d, imgSize = 512, maxPoints = 6) {
	const x1 = box2d.min.x * imgSize;
	const y1 = box2d.min.y * imgSize;
	const x2 = box2d.max.x * imgSize;
	const y2 = box2d.max.y * imgSize;
	const cx = (x1 + x2) * .5;
	const cy = (y1 + y2) * .5;
	const points = new Float32Array(maxPoints * 2).fill(-1);
	const labels = new Float32Array(maxPoints).fill(-1);
	points[0] = cx;
	points[1] = cy;
	labels[0] = 1;
	points[2] = x1;
	points[3] = y1;
	labels[1] = 2;
	points[4] = x2;
	points[5] = y2;
	labels[2] = 3;
	return {
		points,
		labels
	};
}
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
function decodeMaskLogits(masksLogits, ious, box2d, outWidth, outHeight, lowRes = 128) {
	const planeStride = lowRes * lowRes;
	const numChannels = Math.max(1, Math.floor(masksLogits.length / planeStride));
	const bx1 = Math.max(0, Math.floor(box2d.min.x * lowRes));
	const by1 = Math.max(0, Math.floor(box2d.min.y * lowRes));
	const bx2 = Math.min(lowRes, Math.ceil(box2d.max.x * lowRes));
	const by2 = Math.min(lowRes, Math.ceil(box2d.max.y * lowRes));
	let best = 0;
	let bestScore = -Infinity;
	for (let c = 0; c < numChannels; c++) {
		const off = c * planeStride;
		let inside = 0;
		let total = 0;
		for (let y = 0; y < lowRes; y++) {
			const row = off + y * lowRes;
			const yIn = y >= by1 && y < by2;
			for (let x = 0; x < lowRes; x++) if (masksLogits[row + x] >= 0) {
				total++;
				if (yIn && x >= bx1 && x < bx2) inside++;
			}
		}
		if (total === 0) continue;
		const score = inside / total + .05 * (ious ? ious[c] : 0);
		if (score > bestScore) {
			bestScore = score;
			best = c;
		}
	}
	const maskOffset = best * planeStride;
	const buf = new Uint8Array(outWidth * outHeight);
	const scaleX = lowRes / outWidth;
	const scaleY = lowRes / outHeight;
	for (let y = 0; y < outHeight; y++) {
		const sy = (y + .5) * scaleY - .5;
		const y0 = Math.max(0, Math.min(lowRes - 1, Math.floor(sy)));
		const y1 = Math.max(0, Math.min(lowRes - 1, y0 + 1));
		const wy = sy - y0;
		const row0 = maskOffset + y0 * lowRes;
		const row1 = maskOffset + y1 * lowRes;
		const dstRow = y * outWidth;
		for (let x = 0; x < outWidth; x++) {
			const sx = (x + .5) * scaleX - .5;
			const x0 = Math.max(0, Math.min(lowRes - 1, Math.floor(sx)));
			const x1 = Math.max(0, Math.min(lowRes - 1, x0 + 1));
			const wx = sx - x0;
			const v00 = masksLogits[row0 + x0];
			const v01 = masksLogits[row0 + x1];
			const v10 = masksLogits[row1 + x0];
			const v11 = masksLogits[row1 + x1];
			const val = (1 - wy) * ((1 - wx) * v00 + wx * v01) + wy * ((1 - wx) * v10 + wx * v11);
			buf[dstRow + x] = val >= 0 ? 0 : 255;
		}
	}
	return {
		width: outWidth,
		height: outHeight,
		getAsUint8Array: () => buf,
		close: () => {}
	};
}
/**
* Run the EfficientSAM-Ti encoder on a snapshot `ImageData` (once per detect
* press). Subsequent per-detection mask requests reuse the returned `SamState`.
*
* @param snapshot - Raw camera snapshot to encode.
* @param run - Optional `runModel` override for unit testing.
* @returns Encoder state containing the image embedding and snapshot dimensions.
*/
async function samEncodeSnapshot(snapshot, run = runModel) {
	return samSerialize(async () => {
		const { encoder } = await getSam();
		const [embOut] = await run(encoder, [{
			data: snapshotToPlanarFloat32(snapshot, 512),
			shape: [
				1,
				3,
				512,
				512
			]
		}]);
		return {
			imageEmbeddings: embOut instanceof Float32Array ? new Float32Array(embOut) : new Float32Array(embOut.buffer, embOut.byteOffset, embOut.byteLength / 4),
			width: snapshot.width,
			height: snapshot.height
		};
	});
}
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
async function samMaskFromBbox(samState, box2d, run = runModel) {
	return samSerialize(async () => {
		const { decoder } = await getSam();
		const { points, labels } = buildBboxPrompt(box2d, 512, 6);
		const outputs = await run(decoder, [
			{
				data: samState.imageEmbeddings,
				shape: [
					1,
					256,
					32,
					32
				]
			},
			{
				data: points,
				shape: [
					1,
					6,
					2
				]
			},
			{
				data: labels,
				shape: [1, 6]
			}
		]);
		const asFloat32 = (arr) => arr instanceof Float32Array ? arr : new Float32Array(arr.buffer, arr.byteOffset, arr.byteLength / 4);
		const out0 = asFloat32(outputs[0]);
		const out1 = outputs[1] ? asFloat32(outputs[1]) : void 0;
		const [masksLogits, ious] = out1 && out0.length < out1.length ? [out1, out0] : [out0, out1];
		return decodeMaskLogits(masksLogits, ious, box2d, samState.width, samState.height, 128);
	});
}
//#endregion
export { EFFICIENTSAM_TI_DECODER_URL, EFFICIENTSAM_TI_ENCODER_URL, SAM_EMBED_DIM, SAM_EMBED_GRID, SAM_IMG_SIZE, SAM_MASK_LOW_RES, SAM_MAX_POINTS, buildBboxPrompt, decodeMaskLogits, getSam, resetSamForTesting, samEncodeSnapshot, samMaskFromBbox, samSerialize, snapshotToPlanarFloat32 };
