/**
 * MoGe-2 (monocular geometry) on LiteRT.js: model constants, input
 * preprocessing and output decoding. Pure functions; the model is run through
 * an injected `runModel` so this file has no LiteRT dependency.
 *
 * Adapted from demos/photo_to_3d/moge.js; this demo keeps its own copy so it
 * does not depend on another demo. Differences: `preprocess` also returns the
 * letterbox geometry (needed to map model pixels back to camera pixels) and
 * `resolveOutputs` also returns the normal map.
 *
 * Model I/O (see the conversion notes on the model card,
 * https://huggingface.co/litert-community/MoGe-2-LiteRT):
 *   input : [1, 3, 448, 448] float32, RGB in [0, 1] (no ImageNet norm)
 *   outputs (order not guaranteed in the .tflite — resolved by shape/content):
 *     points [1,448,448,3] · normal [1,448,448,3] · mask(sigmoid) [1,448,448,1]
 *     · metric scale [1,1,1,1]
 *   `points` is MoGe's *affine* point map in OpenCV camera axes (x right,
 *   y down, z forward): true up to a global scale and a shift along z. The
 *   z-shift is recovered from the camera focal length (see depthmap.js), then
 *   `scale` turns the shifted map into meters.
 */

const HF =
  'https://huggingface.co/litert-community/MoGe-2-LiteRT/resolve/main/';

/**
 * fp16 weights halve the download and run slightly faster on WebGPU with
 * outputs equal to fp32 up to the weight cast. XNNPACK declines the fp16 graph
 * on wasm (reference kernels, ~31x slower), so the wasm path keeps fp32.
 */
export const MOGE_MODEL_URLS = {
  webgpu: HF + 'moge_fp16.tflite',
  wasm: HF + 'moge.tflite',
};
export const MOGE_MODEL_SIZES_MB = {webgpu: 71, wasm: 136};
export const MOGE_SIZE = 448;
export const MOGE_MASK_THRESHOLD = 0.5;

/**
 * Where a `sourceWidth`×`sourceHeight` photo lands inside the 448² model
 * input when contain-fitted: model pixel = offset + photo pixel · scale.
 */
export function letterboxParams(sourceWidth, sourceHeight) {
  const scale = Math.min(MOGE_SIZE / sourceWidth, MOGE_SIZE / sourceHeight);
  const drawW = Math.round(sourceWidth * scale);
  const drawH = Math.round(sourceHeight * scale);
  return {
    scale,
    // Per-axis scales after rounding, exact for mapping pixel edges.
    scaleX: drawW / sourceWidth,
    scaleY: drawH / sourceHeight,
    drawW,
    drawH,
    offX: Math.floor((MOGE_SIZE - drawW) / 2),
    offY: Math.floor((MOGE_SIZE - drawH) / 2),
  };
}

/**
 * Contain-fits (letterboxes) `source` into a 448×448 canvas and returns the
 * NCHW float input, the RGBA pixels (for colors), a per-pixel flag marking
 * photo pixels versus padding, and the letterbox geometry.
 * @param source - Any `CanvasImageSource` (ImageBitmap, canvas, video).
 * @param ctx - A 2D context of a `MOGE_SIZE`² canvas (`willReadFrequently`).
 */
export function preprocess(source, sourceWidth, sourceHeight, ctx) {
  const SIZE = MOGE_SIZE;
  const letterbox = letterboxParams(sourceWidth, sourceHeight);
  const {drawW, drawH, offX, offY} = letterbox;
  // Neutral gray pad so MoGe sees a plausible background rather than a hard
  // black frame.
  ctx.fillStyle = '#7f7f7f';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(
    source,
    0,
    0,
    sourceWidth,
    sourceHeight,
    offX,
    offY,
    drawW,
    drawH
  );
  const {data} = ctx.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE;
  const nchw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    nchw[i] = data[i * 4] / 255;
    nchw[plane + i] = data[i * 4 + 1] / 255;
    nchw[2 * plane + i] = data[i * 4 + 2] / 255;
  }
  const valid = new Uint8Array(plane);
  for (let y = offY; y < offY + drawH; y++) {
    for (let x = offX; x < offX + drawW; x++) valid[y * SIZE + x] = 1;
  }
  return {nchw, rgba: data, valid, letterbox};
}

/**
 * Mean |‖v‖ − 1| over ~5000 sampled pixels of an [h,w,3] map: ≈0 for a
 * normal map, anything else for a point map. Sampling whole pixels (not a
 * fixed float stride, which can land on one component only) keeps this
 * independent of the scene's scale.
 */
function unitLengthError(map) {
  const pixels = map.length / 3;
  const step = Math.max(1, Math.floor(pixels / 5000));
  let sum = 0;
  let n = 0;
  for (let p = 0; p < pixels; p += step) {
    const x = map[p * 3];
    const y = map[p * 3 + 1];
    const z = map[p * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (!Number.isFinite(len)) continue;
    sum += Math.abs(len - 1);
    n++;
  }
  return n ? sum / n : Infinity;
}

/**
 * The .tflite output order is not guaranteed; identify the tensors by size
 * and content: of the two [h,w,3] maps, the normal map is the one made of
 * unit vectors, so the other is the point map. (A range threshold is not
 * safe: a close-range scene keeps the affine coordinates below ±1.)
 */
export function resolveOutputs(buffers) {
  const plane = MOGE_SIZE * MOGE_SIZE;
  const big = buffers.filter((b) => b.length === plane * 3);
  const mask = buffers.find((b) => b.length === plane);
  const scale = buffers.find((b) => b.length === 1);
  if (big.length !== 2 || !mask || !scale) {
    throw new Error('unexpected model outputs');
  }
  const [points, normals] =
    unitLengthError(big[0]) >= unitLengthError(big[1])
      ? [big[0], big[1]]
      : [big[1], big[0]];
  return {points, normals, mask, scale: scale[0]};
}

/**
 * Runs one MoGe inference.
 * @param model - The compiled model.
 * @param nchw - `[1,3,448,448]` float input from {@link preprocess}.
 * @param runModel - `runModel` from the litert addon (or a test double).
 */
export async function inferMoge(model, nchw, runModel) {
  const start = performance.now();
  const buffers = await runModel(model, [
    {data: nchw, shape: [1, 3, MOGE_SIZE, MOGE_SIZE]},
  ]);
  const elapsed = performance.now() - start;
  return {...resolveOutputs(buffers), elapsed};
}
