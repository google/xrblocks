/**
 * FaceTracking.js — MediaPipe FaceLandmarker, wrapped so the rest of the demo
 * never sees the SDK.
 *
 * One landmarker serves both entry points, switching running mode on demand:
 * a dropped still image is a one-shot `IMAGE` detect, the webcam is a `VIDEO`
 * stream. Loading two would mean two copies of a 3.7 MB model in memory for no
 * benefit.
 *
 * All three outputs are requested, because they fail in different ways:
 *
 *   landmarks    478 points, including the two 5-point iris rings. Geometric,
 *                so gaze reads straight off them.
 *   blendshapes  52 ARKit-style scores from a trained classifier. Far more
 *                reliable than eyelid geometry, which is what defeats blink
 *                tracking in a purely geometric solve.
 *   transform    a 4x4 head pose, reported here for the readout only — the
 *                retargeter derives its own from the rigid landmarks, which
 *                stays consistent with the cloud it fits.
 */

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/' +
  'face_landmarker/float16/1/face_landmarker.task';

/** Landmark indices of the two iris rings and the eye corners they sit in. */
export const EYE_LANDMARKS = {
  left: {iris: 468, outer: 33, inner: 133},
  right: {iris: 473, outer: 263, inner: 362},
};

/**
 * Derives a gaze direction for one eye from iris and corner landmarks.
 *
 * Normalising by the eye's own width is what makes this survive the head moving
 * towards or away from the camera: both the offset and the width scale
 * together, so the ratio does not.
 *
 * @param {!Array<{x: number, y: number}>} landmarks One frame.
 * @param {{iris: number, outer: number, inner: number}} indices Eye indices.
 * @return {{x: number, y: number}} Offset in eye half-widths; +x is towards the
 *     image's right.
 */
function eyeGaze(landmarks, indices) {
  const iris = landmarks[indices.iris];
  const outer = landmarks[indices.outer];
  const inner = landmarks[indices.inner];
  if (!iris || !outer || !inner) return {x: 0, y: 0};
  const midX = (outer.x + inner.x) / 2;
  const midY = (outer.y + inner.y) / 2;
  const halfWidth = Math.hypot(outer.x - inner.x, outer.y - inner.y) / 2;
  const scale = halfWidth > 1e-6 ? halfWidth : 1;
  return {
    x: (iris.x - midX) / scale,
    // The eye is far shorter than it is wide, so the same normaliser would make
    // vertical gaze read as enormous. Halving it keeps the axes comparable.
    y: (iris.y - midY) / (scale * 0.5),
  };
}

/** Packs a MediaPipe result into the shape the rest of the demo consumes. */
function toFrame(result, width, height) {
  const landmarks = result?.faceLandmarks?.[0];
  if (!landmarks || landmarks.length === 0) return null;

  const blendshapes = new Map();
  for (const category of result.faceBlendshapes?.[0]?.categories ?? []) {
    blendshapes.set(category.categoryName, category.score);
  }
  const matrix = result.facialTransformationMatrixes?.[0];

  return {
    landmarks,
    blendshapes,
    width,
    height,
    aspect: height > 0 ? width / height : 1,
    transform: matrix ? Float32Array.from(matrix.data) : null,
    gaze: {
      left: eyeGaze(landmarks, EYE_LANDMARKS.left),
      right: eyeGaze(landmarks, EYE_LANDMARKS.right),
    },
  };
}

export class FaceTracker {
  constructor(landmarker) {
    this._landmarker = landmarker;
    this._mode = 'IMAGE';
    this._lastTimestamp = -1;
  }

  /**
   * Loads the WASM runtime and the landmarker model.
   *
   * @param {function(string)=} onProgress Called with status strings.
   * @return {!Promise<!FaceTracker>} The ready tracker.
   */
  static async create(onProgress) {
    onProgress?.('Loading MediaPipe runtime…');
    const {FaceLandmarker, FilesetResolver} = await import(
      '@mediapipe/tasks-vision'
    );
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    onProgress?.('Loading face landmarker (3.7 MB)…');
    const landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {modelAssetPath: MODEL_URL, delegate: 'GPU'},
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    return new FaceTracker(landmarker);
  }

  async _setMode(mode) {
    if (this._mode === mode) return;
    await this._landmarker.setOptions({runningMode: mode});
    this._mode = mode;
    this._lastTimestamp = -1;
  }

  /**
   * Detects a face in a still image.
   *
   * @param {!CanvasImageSource} source An ImageBitmap, canvas or image element.
   * @param {number} width Source width in pixels.
   * @param {number} height Source height in pixels.
   * @return {!Promise<?Object>} The frame, or null if no face was found.
   */
  async detectImage(source, width, height) {
    await this._setMode('IMAGE');
    return toFrame(this._landmarker.detect(source), width, height);
  }

  /**
   * Detects a face in the current video frame.
   *
   * @param {!HTMLVideoElement} video A playing video element.
   * @param {number} timestampMs Monotonically increasing frame timestamp.
   * @return {?Object} The frame, or null if none was found or the timestamp did
   *     not advance.
   */
  detectVideo(video, timestampMs) {
    // MediaPipe's video mode rejects a timestamp that does not advance, which
    // happens whenever the render loop outruns the camera's frame rate.
    if (this._mode !== 'VIDEO' || timestampMs <= this._lastTimestamp) {
      return null;
    }
    this._lastTimestamp = timestampMs;
    return toFrame(
      this._landmarker.detectForVideo(video, timestampMs),
      video.videoWidth,
      video.videoHeight
    );
  }

  /** Switches to video mode; await before the first `detectVideo` call. */
  async beginVideo() {
    await this._setMode('VIDEO');
  }

  close() {
    this._landmarker?.close();
    this._landmarker = null;
  }
}

/**
 * Opens the user-facing camera.
 *
 * @param {number=} width Ideal capture width.
 * @param {number=} height Ideal capture height.
 * @return {!Promise<!HTMLVideoElement>} A playing, muted video element.
 */
export async function openCamera(width = 1280, height = 720) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {width: {ideal: width}, height: {ideal: height}, facingMode: 'user'},
    audio: false,
  });
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  await new Promise((resolve) => {
    video.onloadedmetadata = resolve;
  });
  await video.play();
  return video;
}

/** Stops every track behind a video element and detaches the stream. */
export function closeCamera(video) {
  const stream = video?.srcObject;
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
  video.srcObject = null;
}

/**
 * Decodes an image file or URL into a bitmap.
 *
 * Cross-origin URLs are fetched rather than assigned to an <img>, so a CORS
 * failure surfaces here as a clear error instead of as a tainted canvas the
 * landmarker silently cannot read.
 *
 * @param {!Blob|string} source A File/Blob, or a URL to fetch.
 * @return {!Promise<!ImageBitmap>} The decoded bitmap.
 */
export async function decodeImage(source) {
  let blob = source;
  if (typeof source === 'string') {
    const response = await fetch(source, {mode: 'cors'});
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    blob = await response.blob();
  }
  return await createImageBitmap(blob);
}
