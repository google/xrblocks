// Webcam fallback for desktop / simulator mode.
//
// The SDK reads frames from `xb.core.deviceCamera.getSnapshot()`, which on a
// real Quest returns frames from the passthrough cameras. On desktop the
// simulator renders the 3D scene as the "camera" feed, which is fine for
// world-facing tasks (plane detection, object recognition of the simulated
// living-room) but useless for face detection because the simulator never
// renders a human face.
//
// This module replaces `deviceCamera.getSnapshot` with one that pulls from
// a getUserMedia() webcam stream when the page is running in the simulator
// (no `immersive-ar` WebXR session active). Real-headset path is untouched
// because the simulator addon never initialises when the device supports
// WebXR.
//
// Permission flow: we call `getUserMedia()` directly. Chrome shows its
// native permission prompt with the site URL and a one-click allow / deny.
// If the user denies, the SDK keeps using the original `getSnapshot`
// (which returns blank/scene frames) and the demo degrades to "no face
// detected" without crashing.

const VIDEO_W = 640;
const VIDEO_H = 480;

let _videoEl = null;
let _canvasEl = null;
let _canvasCtx = null;
let _origGetSnapshot = null;

function shouldUseWebcamFallback() {
  // Only activate when the simulator addon is in charge (i.e. we're not in
  // an immersive WebXR session). On a real Quest this returns false and the
  // SDK's normal getSnapshot path runs untouched.
  const renderer = window.xb?.core?.renderer;
  return !renderer?.xr?.isPresenting;
}

async function requestWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: {ideal: VIDEO_W},
        height: {ideal: VIDEO_H},
        facingMode: 'user',
      },
      audio: false,
    });
    _videoEl = document.createElement('video');
    _videoEl.autoplay = true;
    _videoEl.playsInline = true;
    _videoEl.muted = true;
    _videoEl.srcObject = stream;
    await new Promise((resolve) => {
      _videoEl.onloadedmetadata = resolve;
    });
    await _videoEl.play();
    _canvasEl = document.createElement('canvas');
    _canvasEl.width = _videoEl.videoWidth || VIDEO_W;
    _canvasEl.height = _videoEl.videoHeight || VIDEO_H;
    _canvasCtx = _canvasEl.getContext('2d', {willReadFrequently: true});
    return true;
  } catch (err) {
    if (err && err.name === 'NotAllowedError') {
      console.info(
        '[face_mirror] webcam permission denied; staying on simulator camera.'
      );
    } else {
      console.warn(
        '[face_mirror] webcam unavailable; staying on simulator camera.',
        err
      );
    }
    return false;
  }
}

export async function installWebcamFallback(xb) {
  if (!shouldUseWebcamFallback()) {
    return;
  }
  const ok = await requestWebcam();
  if (!ok) return;

  _origGetSnapshot = xb.core.deviceCamera.getSnapshot.bind(
    xb.core.deviceCamera
  );
  // Route ImageData requests through a freshly-drawn frame from the webcam
  // video element. Other output formats (base64, blob, texture) fall back
  // to the original getter so we don't break any consumer we haven't
  // explicitly thought about.
  //
  // IMPORTANT: do NOT mirror the canvas when feeding MediaPipe. The
  // FaceLandmarker emits ARKit-style blendshape names from the SUBJECT'S
  // point of view (`eyeBlinkLeft` is the subject's left eye, which in a
  // non-mirrored selfie image appears on the right side of the frame).
  // Mirroring the input swaps every Left/Right blendshape (and every
  // landmark index). We mirror only the preview thumbnail via CSS so the
  // user still sees a selfie-correct view of themselves; the landmarker
  // gets the raw frame and the labels stay accurate.
  xb.core.deviceCamera.getSnapshot = async (opts = {}) => {
    if (opts.outputFormat !== 'imageData' || !_videoEl || !_canvasCtx) {
      return _origGetSnapshot(opts);
    }
    if (_videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return _origGetSnapshot(opts);
    }
    _canvasCtx.drawImage(_videoEl, 0, 0, _canvasEl.width, _canvasEl.height);
    return _canvasCtx.getImageData(0, 0, _canvasEl.width, _canvasEl.height);
  };

  // Small picture-in-picture preview so the user can see what the
  // landmarker sees. Useful for debugging head position. Mirror only the
  // visual preview (CSS scaleX(-1)) so the user gets a selfie-correct
  // view while MediaPipe gets the un-mirrored frame above.
  const preview = document.createElement('div');
  preview.style.cssText = `
    position: fixed; bottom: 12px; right: 12px; width: 160px; height: 120px;
    background: #000; border: 1px solid #444; border-radius: 6px;
    overflow: hidden; z-index: 100;
  `;
  _videoEl.style.cssText =
    'width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1);';
  preview.appendChild(_videoEl);
  document.body.appendChild(preview);

  console.log('[face_mirror] webcam fallback installed.');
}
