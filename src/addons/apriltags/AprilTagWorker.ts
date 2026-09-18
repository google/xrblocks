import type {
  AprilTagCameraIntrinsics,
  AprilTagDetection,
} from './AprilTagTypes';
import createAprilTagWasm from './wasm/apriltag_wasm.js';

type DetectMessage = {
  type: 'detect';
  requestId: number;
  imageBuffer: ArrayBuffer;
  width: number;
  height: number;
  intrinsics: AprilTagCameraIntrinsics;
  tagSizeMeters: number;
};

type WorkerMessage = {type: 'initialize'} | DetectMessage | {type: 'dispose'};

// Addon declarations target the normal browser DOM library rather than the
// separate `webworker` library. Keep the worker surface explicit so this entry
// can be type-checked with the same configuration as the rest of XRBlocks.
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
};

let modulePromise: Promise<
  Awaited<ReturnType<typeof createAprilTagWasm>>
> | null = null;

function getModule() {
  if (!modulePromise) {
    modulePromise = createAprilTagWasm({
      locateFile: (file) => new URL(`./wasm/${file}`, import.meta.url).href,
      // The reference pose estimator prints a benign "more than one new
      // minimum found" diagnostic to stderr whenever the planar pose
      // ambiguity is strong (small or near-frontal tags). Emscripten routes
      // stderr to console.error by default, which reads like a crash in
      // remote inspectors — keep the output, but at debug level.
      printErr: (text) => console.debug('[apriltag]', text),
    }).then((wasm) => {
      if (wasm._atag_init() !== 0) {
        throw new Error('The tag25h9 AprilTag detector could not initialize.');
      }
      // A balanced detector setting for real-time, hand-held XR use.
      wasm._atag_set_quad_decimate(1.5);
      return wasm;
    });
  }
  return modulePromise;
}

function toGrayscale(imageBuffer: ArrayBuffer): Uint8Array {
  const rgba = new Uint8ClampedArray(imageBuffer);
  const grayscale = new Uint8Array(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    // Integer BT.601 luma avoids a large number of floating point operations.
    grayscale[target++] =
      (77 * rgba[source] + 150 * rgba[source + 1] + 29 * rgba[source + 2]) >> 8;
  }
  return grayscale;
}

async function detect(message: DetectMessage): Promise<AprilTagDetection[]> {
  const wasm = await getModule();
  const grayscale = toGrayscale(message.imageBuffer);
  const imagePtr = wasm._atag_set_image_size(message.width, message.height);
  if (!imagePtr) {
    throw new Error('Could not allocate detector image memory.');
  }
  wasm.HEAPU8.set(grayscale, imagePtr);

  const count = wasm._atag_detect(
    message.intrinsics.fx,
    message.intrinsics.fy,
    message.intrinsics.cx,
    message.intrinsics.cy,
    message.tagSizeMeters
  );
  const stride = wasm._atag_result_stride();
  const base = wasm._atag_results_ptr() / Float64Array.BYTES_PER_ELEMENT;
  const results: AprilTagDetection[] = [];
  for (let index = 0; index < count; index++) {
    const offset = base + index * stride;
    results.push({
      id: wasm.HEAPF64[offset],
      hamming: wasm.HEAPF64[offset + 1],
      decisionMargin: wasm.HEAPF64[offset + 2],
      reprojectionError: wasm.HEAPF64[offset + 3],
      rotation: Array.from(wasm.HEAPF64.slice(offset + 4, offset + 13)),
      translation: [
        wasm.HEAPF64[offset + 13],
        wasm.HEAPF64[offset + 14],
        wasm.HEAPF64[offset + 15],
      ],
    });
  }
  return results;
}

worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === 'dispose') {
    void getModule()
      .then((wasm) => wasm._atag_destroy())
      .finally(() => worker.close());
    return;
  }

  if (message.type === 'initialize') {
    void getModule()
      .then(() => worker.postMessage({type: 'ready'}))
      .catch((error: unknown) =>
        worker.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      );
    return;
  }

  void detect(message)
    .then((detections) =>
      worker.postMessage({
        type: 'detections',
        requestId: message.requestId,
        detections,
      })
    )
    .catch((error: unknown) =>
      worker.postMessage({
        type: 'error',
        requestId: message.requestId,
        message: error instanceof Error ? error.message : String(error),
      })
    );
};
