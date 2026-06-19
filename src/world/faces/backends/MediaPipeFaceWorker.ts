// Source code for the MediaPipe FaceLandmarker web worker. Inlined as a
// string and instantiated via Blob URL so the SDK ships in one bundle
// without the rollup pipeline having to know about worker entry points.
//
// The worker dynamically imports `@mediapipe/tasks-vision` from a CDN URL
// (workers don't share the host page's importmap), loads the
// FaceLandmarker model once on `init`, then runs synchronous
// `detect(imageBitmap)` calls per request. ImageBitmaps are transferable
// so the snapshot pixel buffer doesn't get cloned across the worker
// boundary.
//
// Wire protocol (all messages carry a numeric `id` so the main thread can
// correlate request/response pairs):
//   { id, type: 'init', config: { mediapipeModuleUrl, wasmFilesUrl,
//                                  modelAssetPath, numFaces, ... } }
//   { id, type: 'detect', imageBitmap: ImageBitmap }           // transfer the bitmap
// Replies:
//   { id, ok: true }
//   { id, ok: true, result: FaceLandmarkerResult }
//   { id, ok: false, error: string }
//
// The result object is a structured-clonable subset of MediaPipe's
// FaceLandmarkerResult (plain landmarks, blendshape categories, transform
// matrix data arrays). Float32Arrays inside `facialTransformationMatrixes`
// clone cheaply, no transfer list needed.
export const MEDIA_PIPE_FACE_WORKER_SOURCE = /* js */ `
let landmarker = null;

async function init(config) {
  const mod = await import(config.mediapipeModuleUrl);
  const { FilesetResolver, FaceLandmarker } = mod;
  const vision = await FilesetResolver.forVisionTasks(config.wasmFilesUrl);
  landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: config.modelAssetPath,
      // CPU delegate in the worker. GPU would need an OffscreenCanvas
      // surface and MediaPipe's wasm pipeline only spins one up when it
      // finds a real DOM canvas, which workers don't have.
      delegate: 'CPU',
    },
    runningMode: 'IMAGE',
    numFaces: config.numFaces,
    minFaceDetectionConfidence: config.minFaceDetectionConfidence,
    minFacePresenceConfidence: config.minFacePresenceConfidence,
    minTrackingConfidence: config.minTrackingConfidence,
    outputFaceBlendshapes: config.outputFaceBlendshapes,
    outputFacialTransformationMatrixes: config.outputFacialTransformationMatrixes,
  });
}

self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === 'init') {
      await init(event.data.config);
      self.postMessage({ id, ok: true });
    } else if (type === 'detect') {
      if (!landmarker) throw new Error('worker not initialized');
      const bitmap = event.data.imageBitmap;
      const result = landmarker.detect(bitmap);
      bitmap.close();
      self.postMessage({ id, ok: true, result });
    } else {
      throw new Error('unknown message type: ' + type);
    }
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: (err && err.message) || String(err),
    });
  }
};
`;
