/**
 * MoGe-2 (monocular geometry) on LiteRT.js: image → per-pixel point map →
 * colored point cloud. Pure functions; the model is run through an injected
 * `runModel` so this file has no LiteRT dependency.
 *
 * Model I/O (see the conversion notes on the model card,
 * https://huggingface.co/litert-community/MoGe-2-LiteRT):
 *   input : [1, 3, 448, 448] float32, RGB in [0, 1] (no ImageNet norm)
 *   outputs (order not guaranteed in the .tflite — resolved by shape/range):
 *     points [1,448,448,3] · normal [1,448,448,3] · mask(sigmoid) [1,448,448,1]
 *     · metric scale [1,1,1,1]
 */
import * as THREE from 'three';

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
 * Contain-fits (letterboxes) `source` into a 448×448 canvas and returns the
 * NCHW float input, the RGBA pixels (for point colors) and a per-pixel flag
 * marking photo pixels versus padding. The whole photo survives so the
 * subject is never cut off; the padding is dropped from the cloud later.
 * @param source - Any `CanvasImageSource` (ImageBitmap, canvas, video).
 * @param ctx - A 2D context of a `MOGE_SIZE`² canvas (`willReadFrequently`).
 */
export function preprocess(source, sourceWidth, sourceHeight, ctx) {
  const SIZE = MOGE_SIZE;
  const scale = Math.min(SIZE / sourceWidth, SIZE / sourceHeight);
  const drawW = Math.round(sourceWidth * scale);
  const drawH = Math.round(sourceHeight * scale);
  const offX = Math.floor((SIZE - drawW) / 2);
  const offY = Math.floor((SIZE - drawH) / 2);
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
  return {nchw, rgba: data, valid};
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
 * and content (the same strategy as the reference Android app): of the two
 * [h,w,3] maps, the normal map is the one made of unit vectors, so the other
 * is the point map. A range threshold is not safe here: a close-range scene
 * keeps the affine point coordinates small, below the normals' ±1.
 */
export function resolveOutputs(buffers) {
  const plane = MOGE_SIZE * MOGE_SIZE;
  const big = buffers.filter((b) => b.length === plane * 3);
  const mask = buffers.find((b) => b.length === plane);
  const scale = buffers.find((b) => b.length === 1);
  if (big.length !== 2 || !mask || !scale) {
    throw new Error('unexpected model outputs');
  }
  const points =
    unitLengthError(big[0]) >= unitLengthError(big[1]) ? big[0] : big[1];
  return {points, mask, scale: scale[0]};
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

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * Builds a colored `THREE.Points` from the point map, sized as a miniature:
 * the photo's robust (2–98%) width or height, whichever is larger, becomes
 * `targetSize` meters, keeping true proportions.
 *
 * MoGe's camera frame is x right, y down, z forward; the cloud is returned in
 * three.js orientation (y up, -z forward) so its photographed side faces +z.
 * `points.raycast` is disabled: loose points otherwise win every ray test and
 * steal hover and selection from the viewer's own hit surfaces.
 */
export function buildCloud(
  points,
  mask,
  rgba,
  valid,
  {targetSize = 0.4, border = 2} = {}
) {
  const SIZE = MOGE_SIZE;
  const plane = SIZE * SIZE;
  const positions = [];
  const colors = [];
  let candidates = 0;
  let confident = 0;
  let nonFinite = 0;
  for (let i = 0; i < plane; i++) {
    if (!valid[i]) continue; // letterbox padding — not part of the photo
    const px = i % SIZE;
    const py = (i / SIZE) | 0;
    // Skip pixels next to padding and the outer rim (ambiguous depth smears).
    if (
      !valid[i - 1] ||
      !valid[i + 1] ||
      !valid[i - SIZE] ||
      !valid[i + SIZE] ||
      px < border ||
      px >= SIZE - border ||
      py < border ||
      py >= SIZE - border
    ) {
      continue;
    }
    candidates++;
    if (mask[i] <= MOGE_MASK_THRESHOLD) continue;
    confident++;
    const x = points[i * 3];
    const y = points[i * 3 + 1];
    const z = points[i * 3 + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      nonFinite++;
      continue;
    }
    positions.push(x, -y, -z);
    colors.push(
      rgba[i * 4] / 255,
      rgba[i * 4 + 1] / 255,
      rgba[i * 4 + 2] / 255
    );
  }
  if (positions.length === 0) {
    // Say why: a black frame reads as "0 confident", a GPU numeric failure
    // as "N non-finite".
    throw new Error(
      `no confident points in this photo (${confident} of ${candidates} ` +
        `pixels confident, ${nonFinite} non-finite)`
    );
  }

  // Trim the far tail (deep background shells dwarf the subject) and the
  // near lip (front-edge streaks) relative to the median depth.
  const count = positions.length / 3;
  const depthSample = [];
  const step = Math.max(1, Math.floor(count / 20000));
  for (let i = 0; i < count; i += step) depthSample.push(-positions[i * 3 + 2]);
  const medianDepth = Math.max(median(depthSample), 1e-6);
  const maxDepth = medianDepth * 3.5;
  const minDepth = medianDepth * 0.45;

  const kept = [];
  const keptColors = [];
  const xs = [];
  const ys = [];
  for (let i = 0; i < count; i++) {
    const depth = -positions[i * 3 + 2];
    if (depth > maxDepth || depth < minDepth) continue;
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    kept.push(x, y, positions[i * 3 + 2]);
    keptColors.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    xs.push(x);
    ys.push(y);
  }
  if (kept.length === 0) {
    throw new Error(
      `no confident points in this photo (all ${count} fell outside the ` +
        `depth trim around median ${medianDepth.toPrecision(3)})`
    );
  }

  // Robust extent from percentiles so stray points do not shrink the subject.
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const width = percentile(xs, 0.98) - percentile(xs, 0.02);
  const height = percentile(ys, 0.98) - percentile(ys, 0.02);
  const extent = Math.max(width, height, 1e-6);
  const fit = targetSize / extent;
  for (let i = 0; i < kept.length; i++) kept[i] *= fit;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(keptColors, 3)
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // A few times the sample spacing so the surface reads as solid.
  const pointSize = 2.5 * (targetSize / SIZE);
  const material = new THREE.PointsMaterial({
    size: pointSize,
    vertexColors: true,
    sizeAttenuation: true,
  });
  const cloud = new THREE.Points(geometry, material);
  cloud.name = 'MoGePointCloud';
  cloud.raycast = () => {};
  cloud.userData.basePointSize = pointSize;
  cloud.userData.count = kept.length / 3;
  cloud.userData.medianDepth = medianDepth;
  return cloud;
}

/** Releases the GPU resources of a cloud made by {@link buildCloud}. */
export function disposeCloud(cloud) {
  cloud?.geometry.dispose();
  cloud?.material.dispose();
}
