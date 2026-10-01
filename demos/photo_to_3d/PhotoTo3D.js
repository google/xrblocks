import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  compileModel,
  describeError,
  fetchCachedModel,
  loadLiteRtRuntime,
  runModel,
} from 'xrblocks/addons/litert/index.js';

import {
  MOGE_MODEL_SIZES_MB,
  MOGE_MODEL_URLS,
  MOGE_SIZE,
  buildCloud,
  disposeCloud,
  inferMoge,
  preprocess,
} from './moge.js';

const CACHE_NAME = 'xrblocks-photo-to-3d-v1';
const CAMERA_STATE_LABELS = {
  initializing: 'Starting camera…',
  no_devices_found: 'No camera found — capture is unavailable.',
  error: 'Camera failed to start.',
};

/**
 * Captures a photo with the device camera, runs MoGe-2 on it through the
 * litert addon and presents the resulting point cloud as a miniature on a
 * `ModelViewer` platform (move, rotate, scale).
 */
export class PhotoTo3D extends xb.Script {
  static dependencies = {deviceCamera: xb.XRDeviceCamera};

  model = null;
  accelerator = 'wasm';
  runtime = null;
  cloud = null;
  ready = false;
  busy = false;
  disposed = false;
  bootStage = 'runtime';
  cropContext = null;
  cropTexture = null;
  worldScale = new THREE.Vector3();
  debug = new URLSearchParams(location.search).has('debug');

  init({deviceCamera}) {
    this.deviceCamera = deviceCamera;

    this.statusText = new xb.UIText({
      text: 'Loading LiteRT runtime…',
      style: {fontSize: 16, lineHeight: 1.35, whiteSpace: 'pre-line'},
    });
    this.captureButton = new xb.UIButton({
      label: 'Capture',
      icon: 'photo_camera',
      disabled: true,
      style: {flexGrow: 1},
      onClick: () => void this.capture(),
    });
    this.clearButton = new xb.UIButton({
      label: 'Clear',
      icon: 'delete',
      disabled: true,
      style: {flexGrow: 1},
      onClick: () => this.clear(),
    });
    const card = new xb.UICard({
      size: {width: 0.5, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 12, padding: 18},
      children: [
        new xb.UIText({
          text: 'Photo to 3D',
          style: {fontSize: 26, fontWeight: 'bold'},
        }),
        new xb.UIText({
          text: 'MoGe-2 on-device via LiteRT.js. Point the camera at a subject and press Capture; grab the platform to move, rotate or scale the miniature.',
          style: {fontSize: 14, lineHeight: 1.35, opacity: 0.8},
        }),
        this.statusText,
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 10},
          children: [this.captureButton, this.clearButton],
        }),
        // ?debug=1: show the letterboxed 448² input exactly as the model
        // saw it, to tell a camera problem from a model problem.
        ...(this.debug ? [this.createDebugThumbnail()] : []),
      ],
    });
    card.position.set(0.4, xb.user.height + 0.05, -1.1);
    card.rotation.y = -0.35;
    this.add(card);

    this.viewer = new xb.ModelViewer({
      origin: 'bottom-center',
      manipulation: true,
      occlusion: false,
    });
    this.viewer.position.set(-0.2, xb.user.height - 0.45, -0.9);
    this.add(this.viewer);

    this.onCameraState = (event) => this.updateCameraState(event.state);
    this.deviceCamera?.addEventListener('statechange', this.onCameraState);

    void this.boot();
  }

  update() {
    // PointsMaterial.size is in world units and ignores object scale, so a
    // scaled-up miniature would turn sparse: track the viewer's scale.
    if (!this.cloud) return;
    this.viewer.getWorldScale(this.worldScale);
    this.cloud.material.size =
      this.cloud.userData.basePointSize * this.worldScale.x;
  }

  status(text) {
    if (this.disposed) return;
    this.statusText.text = text;
  }

  /** Aborts an async step that finished after {@link dispose}. */
  throwIfDisposed() {
    if (this.disposed) throw new Error('PhotoTo3D was disposed');
  }

  updateCameraState(state) {
    if (this.busy || !this.ready) return;
    const label = CAMERA_STATE_LABELS[state];
    if (label) this.status(label);
    else if (state === 'streaming') this.status(this.readyLabel);
  }

  async boot() {
    this.ready = false;
    this.captureButton.disabled = true;
    try {
      this.bootStage = 'runtime';
      this.status('Loading LiteRT runtime…');
      const params = new URLSearchParams(location.search);
      const requested = params.get('backend'); // ?backend=wasm|webgpu
      this.runtime = await loadLiteRtRuntime();
      this.throwIfDisposed();
      const accelerator =
        requested === 'wasm' || requested === 'webgpu'
          ? requested
          : this.runtime.accelerator;
      if (accelerator === 'wasm' && this.runtime.accelerator === 'webgpu') {
        this.status('Using wasm as requested.');
      } else if (accelerator === 'wasm') {
        this.status('WebGPU unavailable — using wasm (slower).');
      }

      try {
        await this.compileAndWarm(accelerator);
      } catch (error) {
        // WebGPU exists on paper in more browsers than it works in — fall
        // back to the fp32 wasm model instead of dying.
        if (accelerator !== 'webgpu') throw error;
        this.status(
          `WebGPU failed (${describeError(error)}) — retrying on wasm…`
        );
        await this.compileAndWarm('wasm');
      }

      this.ready = true;
      this.captureButton.disabled = false;
      this.status(this.readyLabel);

      const testUrl = params.get('img');
      if (testUrl) {
        this.bootStage = 'test image';
        const response = await fetch(testUrl);
        if (!response.ok) {
          throw new Error(`${testUrl} → HTTP ${response.status}`);
        }
        const blob = await response.blob();
        this.throwIfDisposed();
        await this.runOnImage(await createImageBitmap(blob));
      }
    } catch (error) {
      if (this.disposed) return;
      this.status(
        `Failed to start (${this.bootStage}): ${describeError(error)}\nPress Capture to retry.`
      );
      // Let the button retry the boot instead of a capture.
      this.captureButton.disabled = false;
    }
  }

  /**
   * Downloads, compiles and warms up the model for `accelerator`. The first
   * run after compile carries shader/kernel warm-up (seconds on WebGPU) and
   * must never land on a user photo or in the latency display.
   */
  async compileAndWarm(accelerator) {
    this.bootStage = `download ${accelerator}`;
    const sizeMb = MOGE_MODEL_SIZES_MB[accelerator];
    const bytes = await fetchCachedModel(MOGE_MODEL_URLS[accelerator], {
      cacheName: CACHE_NAME,
      onProgress: (received, total) => {
        const mb = (received / 1048576).toFixed(0);
        if (total && received >= total) {
          this.status('Model ready — compiling…');
        } else {
          const percent = total
            ? ` (${Math.round((100 * received) / total)}%)`
            : '';
          this.status(
            `Downloading MoGe-2 (one-time)… ${mb} / ${sizeMb} MB${percent}`
          );
        }
      },
    });
    this.throwIfDisposed();

    this.bootStage = `compile ${accelerator}`;
    this.status(
      `Compiling for ${accelerator === 'webgpu' ? 'WebGPU' : 'wasm'}…`
    );
    const handle = await compileModel(bytes, {
      accelerator,
      // A wasm fallback must use the fp32 model; handled by the caller.
      fallbackToWasm: false,
    });
    if (this.disposed) {
      // Torn down while compiling: never adopt the model, just free it.
      handle.model.delete();
      this.throwIfDisposed();
    }
    this.releaseModel();
    this.model = handle.model;
    this.accelerator = handle.accelerator;

    this.bootStage = `warm-up ${accelerator}`;
    this.status('Warming up (one throwaway run)…');
    const gray = new Float32Array(3 * MOGE_SIZE * MOGE_SIZE).fill(0.5);
    const start = performance.now();
    await inferMoge(this.model, gray, runModel);
    this.throwIfDisposed();
    const warmSeconds = (performance.now() - start) / 1000;
    const threads = this.runtime.threads ? 'wasm' : 'wasm·1-thread';
    this.readyLabel =
      `Ready · MoGe-2 ${accelerator === 'webgpu' ? 'fp16 · webgpu' : `fp32 · ${threads}`}` +
      ` · warm-up ${warmSeconds.toFixed(1)} s`;
  }

  async capture() {
    if (this.busy) return;
    if (!this.ready) {
      void this.boot();
      return;
    }
    const camera = this.deviceCamera;
    if (!camera) {
      this.status('Device camera is not enabled.');
      return;
    }
    this.busy = true;
    try {
      // The hidden video element is throttled inside an immersive session;
      // wait for a fresh frame so the snapshot is not stale.
      await camera.waitForFreshFrame?.();
      // captureSnapshot also serves the WebXR raw-camera-access fallback,
      // where the frame is read back from the GPU on the next XR frame.
      const imageData = await camera.captureSnapshot({
        outputFormat: 'imageData',
      });
      if (this.disposed) return;
      if (!imageData) {
        this.status(
          camera.isUsingXRCameraAccess
            ? 'No camera frame arrived — is the XR session running?'
            : `Camera not ready (${CAMERA_STATE_LABELS[camera.state] ?? camera.state}).`
        );
        return;
      }
      await this.runOnImage(await createImageBitmap(imageData));
    } catch (error) {
      this.status(`Capture failed: ${describeError(error)}`);
    } finally {
      this.busy = false;
    }
  }

  async runOnImage(source) {
    if (!this.model || this.disposed) {
      source.close?.();
      return;
    }
    const wasBusy = this.busy;
    this.busy = true;
    this.captureButton.disabled = true;
    this.status('Running MoGe-2…');
    let photoInfo = '';
    try {
      const {nchw, rgba, valid} = preprocess(
        source,
        source.width,
        source.height,
        this.getCropContext()
      );
      if (this.cropTexture) this.cropTexture.needsUpdate = true;
      photoInfo =
        `photo ${source.width}×${source.height}` +
        ` · mean ${PhotoTo3D.meanBrightness(rgba, valid).toFixed(0)}/255`;
      const {points, mask, elapsed} = await inferMoge(
        this.model,
        nchw,
        runModel
      );
      const cloud = buildCloud(points, mask, rgba, valid);
      this.setCloud(cloud);
      this.status(
        `Done · ${elapsed.toFixed(0)} ms · ${(cloud.userData.count / 1000).toFixed(0)}k points\n${this.readyLabel}`
      );
    } catch (error) {
      this.status(`Failed: ${describeError(error)}\n${photoInfo}`);
    } finally {
      if (typeof source.close === 'function') source.close();
      this.captureButton.disabled = false;
      this.busy = wasBusy;
    }
  }

  createDebugThumbnail() {
    this.cropTexture = new THREE.CanvasTexture(this.getCropContext().canvas);
    this.cropTexture.colorSpace = THREE.SRGBColorSpace;
    return new xb.UIImage({
      src: this.cropTexture,
      ariaLabel: 'Model input',
      style: {width: 224, height: 224, borderRadius: 12, alignSelf: 'center'},
    });
  }

  /** Mean 8-bit brightness of the photo pixels (padding excluded). */
  static meanBrightness(rgba, valid) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < valid.length; i++) {
      if (!valid[i]) continue;
      sum += rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2];
      n += 3;
    }
    return n ? sum / n : 0;
  }

  getCropContext() {
    if (!this.cropContext) {
      const canvas = document.createElement('canvas');
      canvas.width = MOGE_SIZE;
      canvas.height = MOGE_SIZE;
      this.cropContext = canvas.getContext('2d', {willReadFrequently: true});
    }
    return this.cropContext;
  }

  setCloud(cloud) {
    disposeCloud(this.cloud);
    this.cloud = cloud;
    // setContent replaces the previous presentation; the caller owns and has
    // just disposed the previous cloud's resources.
    this.viewer.setContent(cloud);
    this.clearButton.disabled = false;
  }

  clear() {
    if (!this.cloud) return;
    disposeCloud(this.cloud);
    this.cloud = null;
    this.viewer.setContent(new THREE.Group());
    this.clearButton.disabled = true;
    if (this.ready && !this.busy) this.status(this.readyLabel);
  }

  releaseModel() {
    try {
      this.model?.delete();
    } catch {
      // Already deleted.
    }
    this.model = null;
  }

  dispose() {
    this.disposed = true;
    this.deviceCamera?.removeEventListener('statechange', this.onCameraState);
    disposeCloud(this.cloud);
    this.cloud = null;
    this.cropTexture?.dispose();
    this.releaseModel();
    super.dispose();
  }
}
