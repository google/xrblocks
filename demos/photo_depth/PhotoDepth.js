import * as xb from 'xrblocks';
import {
  compileModel,
  describeError,
  fetchCachedModel,
  loadLiteRtRuntime,
  runModel,
} from 'xrblocks/addons/litert/index.js';

import {ArucoCalibration} from './ArucoCalibration.js';
import {CameraModel} from './CameraModel.js';
import {compareDepth, floorScale, freezeSensedDepth} from './depthcompare.js';
import {
  buildDepthMap,
  depthMapToCloud,
  depthRange,
  disposeObject,
  horizontalFov,
  intrinsicsFromFov,
  intrinsicsFromProjection,
  intrinsicsToLetterbox,
  samplePointMap,
  solveFocalShift,
  solveShift,
} from './depthmap.js';
import {
  MOGE_MODEL_SIZES_MB,
  MOGE_MODEL_URLS,
  MOGE_SIZE,
  inferMoge,
  preprocess,
} from './moge.js';

const CACHE_NAME = 'xrblocks-photo-depth-v1';
const CAMERA_STATE_LABELS = {
  initializing: 'Starting camera...',
  no_devices_found: 'No camera found - capture is unavailable.',
  error: 'Camera failed to start.',
};

const percent = (value) => `${(value * 100).toFixed(1)}%`;
/** Manual depth-scale steps; nearer and farther undo each other. */
const SCALE_NUDGES = [
  {label: 'Nearer 5%', icon: 'keyboard_double_arrow_down', factor: 1 / 1.05},
  {label: '1%', icon: 'keyboard_arrow_down', factor: 1 / 1.01},
  {label: '1%', icon: 'keyboard_arrow_up', factor: 1.01},
  {label: 'Farther 5%', icon: 'keyboard_double_arrow_up', factor: 1.05},
];

/**
 * Photo -> world-aligned metric depth. Captures a device-camera photo, runs
 * MoGe-2 on it, recovers metric depth with the camera's focal length, and
 * places the result back where the camera saw it, as a colored point cloud
 * overlaying the real scene. Where the headset senses depth, the photo depth
 * is compared against it; "Fit to sensed" / "Snap floor" correct the scale.
 *
 * Panel text is ASCII only: the uikit font lacks glyphs such as the middle
 * dot or the degree sign.
 */
export class PhotoDepth extends xb.Script {
  static dependencies = {deviceCamera: xb.XRDeviceCamera};

  params = new URLSearchParams(location.search);
  model = null;
  accelerator = 'wasm';
  runtime = null;
  readyLabel = '';
  ready = false;
  busy = false;
  disposed = false;
  bootStage = 'runtime';
  cropContext = null;
  /** Last capture: model outputs, camera and sensed depth. */
  result = null;
  depthMap = null;
  comparison = null;
  cloud = null;
  cloudVisible = true;
  /** User scale correction on top of MoGe's metric scale. */
  userScale = 1;
  scaleNote = '';

  init({deviceCamera}) {
    this.deviceCamera = deviceCamera;
    this.cameraModel = new CameraModel(deviceCamera);
    if (this.params.get('cal') !== 'sdk') {
      this.cameraModel.useStoredCalibration();
    }
    this.calibration = new ArucoCalibration({
      onFreeze: (calibration, converged) => {
        this.cameraModel.setCalibration(
          calibration,
          converged ? 'ArUco (converged)' : 'ArUco (NOT converged)'
        );
        this.refreshButtons();
        this.status(`${this.cameraModel.describe()}\nCapture again to use it.`);
      },
      onClose: () => this.refreshButtons(),
    });

    this.statusText = new xb.UIText({
      text: 'Loading LiteRT runtime...',
      style: {fontSize: 14, lineHeight: 1.35, whiteSpace: 'pre-line'},
    });
    const button = (label, icon, onClick, disabled = false) =>
      new xb.UIButton({
        label,
        icon,
        disabled,
        style: {flexGrow: 1},
        onClick,
      });
    const row = (...children) =>
      new xb.UIPanel({style: {flexDirection: 'row', gap: 8}, children});

    this.captureButton = button(
      'Capture',
      'photo_camera',
      () => void this.capture(),
      true
    );
    this.clearButton = button('Clear', 'delete', () => this.clear(), true);
    this.fitButton = button(
      'Fit to sensed',
      'straighten',
      () => this.fitToSensed(),
      true
    );
    this.floorButton = button(
      'Snap floor',
      'vertical_align_bottom',
      () => this.snapFloor(),
      true
    );
    this.resetScaleButton = button(
      'Reset scale',
      'restart_alt',
      () => this.setUserScale(1, ''),
      true
    );
    // Manual depth nudges: MoGe's metric scale is its weakest output (the
    // shape is usually right to a few percent), so a single factor about the
    // capture point, which slides every point along its own camera ray and
    // keeps the photo aligned, fixes most of the visible offset.
    this.nudgeButtons = SCALE_NUDGES.map(({label, icon, factor}) =>
      button(label, icon, () => this.nudgeScale(factor), true)
    );
    this.cameraButton = button('Camera: SDK', 'photo_camera_front', () =>
      this.toggleCamera()
    );
    this.calibrateButton = button('Calibrate', 'qr_code_2', () =>
      this.toggleCalibration()
    );
    this.cloudButton = button(
      'Hide cloud',
      'visibility_off',
      () => this.toggleCloud(),
      true
    );

    const card = new xb.UICard({
      size: {width: 0.62, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 10, padding: 18},
      children: [
        new xb.UIText({
          text: 'Photo Depth',
          style: {fontSize: 26, fontWeight: 'bold'},
        }),
        new xb.UIText({
          text:
            'MoGe-2 on-device via LiteRT.js turns one camera photo into ' +
            'metric depth, placed back where the camera saw it.',
          style: {fontSize: 13, lineHeight: 1.35, opacity: 0.8},
        }),
        this.statusText,
        row(this.captureButton, this.clearButton, this.cloudButton),
        new xb.UIText({
          text: 'Adjust depth until the points sit on the real surfaces:',
          style: {fontSize: 13, opacity: 0.8},
        }),
        row(...this.nudgeButtons),
        row(this.fitButton, this.floorButton, this.resetScaleButton),
        row(this.cameraButton, this.calibrateButton),
      ],
    });
    card.position.set(0.45, xb.user.height + 0.05, -1.1);
    card.rotation.y = -0.35;
    this.add(card);

    this.onCameraState = (event) => this.updateCameraState(event.state);
    this.deviceCamera?.addEventListener('statechange', this.onCameraState);

    this.refreshButtons();
    void this.boot();
  }

  update() {
    this.cameraModel.record();
    this.calibration.update();
  }

  status(text) {
    if (this.disposed) return;
    this.statusText.text = text;
  }

  /** Aborts an async step that finished after {@link dispose}. */
  throwIfDisposed() {
    if (this.disposed) throw new Error('PhotoDepth was disposed');
  }

  updateCameraState(state) {
    if (this.busy || !this.ready || this.result) return;
    const label = CAMERA_STATE_LABELS[state];
    if (label) this.status(label);
    else if (state === 'streaming') this.status(this.idleStatus());
  }

  idleStatus() {
    return `${this.readyLabel}\n${this.cameraModel.describe()}`;
  }

  refreshButtons() {
    const hasResult = !!this.result;
    const idle = !this.busy;
    this.captureButton.disabled = !idle || this.calibration.isOpen;
    this.clearButton.disabled = !hasResult || !idle;
    this.cloudButton.disabled = !hasResult;
    this.cloudButton.label = this.cloudVisible ? 'Hide cloud' : 'Show cloud';
    this.fitButton.disabled = !idle || !this.comparison;
    this.floorButton.disabled = !idle || !hasResult;
    this.resetScaleButton.disabled = !idle || this.userScale === 1;
    for (const nudge of this.nudgeButtons) nudge.disabled = !idle || !hasResult;
    this.cameraButton.label = this.cameraModel.correction
      ? 'Camera: ArUco'
      : 'Camera: SDK';
    this.calibrateButton.label = this.calibration.isOpen
      ? 'Close calibration'
      : 'Calibrate';
  }

  async boot() {
    this.ready = false;
    this.refreshButtons();
    this.captureButton.disabled = true;
    try {
      this.bootStage = 'runtime';
      this.status('Loading LiteRT runtime...');
      const requested = this.params.get('backend'); // ?backend=wasm|webgpu
      this.runtime = await loadLiteRtRuntime();
      this.throwIfDisposed();
      const accelerator =
        requested === 'wasm' || requested === 'webgpu'
          ? requested
          : this.runtime.accelerator;
      try {
        await this.compileAndWarm(accelerator);
      } catch (error) {
        // WebGPU exists on paper in more browsers than it works in.
        if (accelerator !== 'webgpu') throw error;
        this.status(
          `WebGPU failed (${describeError(error)}) - retrying on wasm...`
        );
        await this.compileAndWarm('wasm');
      }
      this.ready = true;
      this.refreshButtons();
      this.status(this.idleStatus());

      const testUrl = this.params.get('img');
      if (testUrl) {
        this.bootStage = 'test image';
        const response = await fetch(testUrl);
        if (!response.ok) {
          throw new Error(`${testUrl} -> HTTP ${response.status}`);
        }
        const bitmap = await createImageBitmap(await response.blob());
        this.throwIfDisposed();
        // No device camera took this photo: MoGe estimates the focal length
        // and the result is placed in front of the current camera pose.
        await this.runOnImage(bitmap, {
          camera: this.cameraModel.cameraAt(null),
          sensed: null,
          knownIntrinsics: false,
        });
      }
    } catch (error) {
      if (this.disposed) return;
      this.status(
        `Failed to start (${this.bootStage}): ${describeError(error)}\n` +
          'Press Capture to retry.'
      );
      this.captureButton.disabled = false;
    }
  }

  /**
   * Downloads, compiles and warms up the model. The first run after compile
   * carries shader/kernel warm-up and must never land on a user photo.
   */
  async compileAndWarm(accelerator) {
    this.bootStage = `download ${accelerator}`;
    const sizeMb = MOGE_MODEL_SIZES_MB[accelerator];
    const bytes = await fetchCachedModel(MOGE_MODEL_URLS[accelerator], {
      cacheName: CACHE_NAME,
      onProgress: (received, total) => {
        if (total && received >= total) {
          this.status('Model ready - compiling...');
        } else {
          const mb = (received / 1048576).toFixed(0);
          this.status(`Downloading MoGe-2 (one-time)... ${mb} / ${sizeMb} MB`);
        }
      },
    });
    this.throwIfDisposed();

    this.bootStage = `compile ${accelerator}`;
    this.status(
      `Compiling for ${accelerator === 'webgpu' ? 'WebGPU' : 'wasm'}...`
    );
    const handle = await compileModel(bytes, {
      accelerator,
      // A wasm fallback must use the fp32 model; handled by the caller.
      fallbackToWasm: false,
    });
    if (this.disposed) {
      handle.model.delete();
      this.throwIfDisposed();
    }
    this.releaseModel();
    this.model = handle.model;
    this.accelerator = handle.accelerator;

    this.bootStage = `warm-up ${accelerator}`;
    this.status('Warming up (one throwaway run)...');
    const gray = new Float32Array(3 * MOGE_SIZE * MOGE_SIZE).fill(0.5);
    const start = performance.now();
    await inferMoge(this.model, gray, runModel);
    this.throwIfDisposed();
    const warmSeconds = (performance.now() - start) / 1000;
    const threads = this.runtime.threads ? 'wasm' : 'wasm 1-thread';
    this.readyLabel =
      `Ready | MoGe-2 ${accelerator === 'webgpu' ? 'fp16 webgpu' : `fp32 ${threads}`}` +
      ` | warm-up ${warmSeconds.toFixed(1)} s`;
  }

  async capture() {
    if (this.busy) return;
    if (!this.ready) {
      void this.boot();
      return;
    }
    const deviceCamera = this.deviceCamera;
    if (!deviceCamera) {
      this.status('Device camera is not enabled.');
      return;
    }
    this.busy = true;
    this.refreshButtons();
    // The marker tracker grabs frames too; keep it off this one.
    this.calibration.setPaused(true);
    try {
      // The hidden video element is throttled inside an immersive session;
      // wait for a fresh frame so the snapshot is not stale, and pair it with
      // the head pose at the frame's capture time.
      const frame = await deviceCamera.waitForFreshFrame?.();
      const captureTime =
        frame?.captureTime ?? frame?.receiveTime ?? frame?.presentationTime;
      const camera = this.cameraModel.cameraAt(captureTime ?? null);
      // The sensed depth of (about) the same moment, for the comparison.
      const sensed = freezeSensedDepth(xb.core.depth);
      const imageData = await deviceCamera.captureSnapshot({
        outputFormat: 'imageData',
      });
      if (this.disposed) return;
      if (!imageData) {
        this.status(
          deviceCamera.isUsingXRCameraAccess
            ? 'No camera frame arrived - is the XR session running?'
            : `Camera not ready (${CAMERA_STATE_LABELS[deviceCamera.state] ?? deviceCamera.state}).`
        );
        return;
      }
      if (!camera) {
        this.status('No camera pose yet - try again in a moment.');
        return;
      }
      await this.runOnImage(await createImageBitmap(imageData), {
        camera,
        sensed,
        knownIntrinsics: true,
      });
    } catch (error) {
      this.status(`Capture failed: ${describeError(error)}`);
    } finally {
      this.busy = false;
      this.calibration.setPaused(false);
      this.refreshButtons();
    }
  }

  /**
   * Runs MoGe on `source` and aligns the result with `camera`.
   * @param camera - From {@link CameraModel.cameraAt}.
   * @param sensed - From {@link freezeSensedDepth}, or null.
   * @param knownIntrinsics - Whether `camera` took the photo (so its focal
   *   length applies); otherwise MoGe's own focal estimate is used.
   */
  async runOnImage(source, {camera, sensed, knownIntrinsics}) {
    if (!this.model || this.disposed) {
      source.close?.();
      return;
    }
    const wasBusy = this.busy;
    this.busy = true;
    this.refreshButtons();
    this.status('Running MoGe-2...');
    try {
      const width = source.width;
      const height = source.height;
      const {nchw, rgba, valid, letterbox} = preprocess(
        source,
        width,
        height,
        this.getCropContext()
      );
      const {points, normals, mask, scale, elapsed} = await inferMoge(
        this.model,
        nchw,
        runModel
      );
      this.throwIfDisposed();

      const sample = samplePointMap(points, mask, valid);
      // MoGe's own focal estimate: the fallback without a known camera, and
      // a diagnostic against the device camera model otherwise.
      const own = solveFocalShift(sample, {
        cx: letterbox.offX + letterbox.drawW / 2,
        cy: letterbox.offY + letterbox.drawH / 2,
      });
      const mogeFov = horizontalFov(own.focal / letterbox.scaleX, width);

      const fovParam = parseFloat(this.params.get('fov') ?? '');
      let photoK = null;
      let intrinsicsSource = 'MoGe estimate';
      if (Number.isFinite(fovParam)) {
        photoK = intrinsicsFromFov(fovParam, width, height);
        intrinsicsSource = `?fov=${fovParam}`;
      } else if (
        knownIntrinsics &&
        camera &&
        this.params.get('fov') !== 'auto'
      ) {
        photoK = intrinsicsFromProjection(camera.clipFromView, width, height);
        intrinsicsSource = 'camera model';
      }
      // Rays come from the real camera so every depth pixel lands on the
      // surface it was photographed on. The depth values come from MoGe's
      // self-consistent focal+shift solution by default: forcing the camera
      // focal into the shift solve (MoGe's known-FOV path, ?shift=camera)
      // degenerates when MoGe disagrees with the camera's field of view
      // (simulator: 69 vs 90 deg gave a pinned shift and 8.8% shape error
      // after a scale fit, against 3.5% this way; equal when they agree).
      let K;
      let shift = own.shift;
      let rmsPx = own.rmsPx;
      let shiftSource = 'MoGe';
      if (photoK) {
        K = intrinsicsToLetterbox(photoK, letterbox);
        if (this.params.get('shift') === 'camera') {
          ({shift, rmsPx} = solveShift(sample, K));
          shiftSource = 'camera';
        }
      } else {
        K = {
          fx: own.focal,
          fy: own.focal,
          cx: letterbox.offX + letterbox.drawW / 2,
          cy: letterbox.offY + letterbox.drawH / 2,
        };
      }

      if (!camera) throw new Error('no camera pose to place the photo at');
      this.result = {
        points,
        normals,
        mask,
        valid,
        rgba,
        K,
        shift,
        shiftSource,
        scale,
        rmsPx,
        elapsed,
        intrinsicsSource,
        knownIntrinsics,
        photoFov: horizontalFov(K.fx / letterbox.scaleX, width),
        mogeFov,
        photoSize: `${width}x${height}`,
        worldFromView: camera.worldFromView,
        poseMatchMs: camera.poseMatchMs,
        cameraLabel: this.cameraModel.describe(),
        sensed,
      };
      this.userScale = 1;
      this.scaleNote = '';
      this.rebuild();

      const auto = this.params.get('autoScale');
      if (auto === 'sensed' && this.comparison) this.fitToSensed();
      else if (auto === 'floor') this.snapFloor();
    } catch (error) {
      this.status(`Failed: ${describeError(error)}`);
    } finally {
      if (typeof source.close === 'function') source.close();
      this.busy = wasBusy;
      this.refreshButtons();
    }
  }

  /** Rebuilds depth map, cloud and comparison from {@link result}. */
  rebuild() {
    const r = this.result;
    if (!r) return;
    this.depthMap = buildDepthMap(r, r.K, r.shift, r.scale * this.userScale);
    const cloud = depthMapToCloud(this.depthMap, r.rgba, {
      stride: Math.max(1, xb.getUrlParamInt('stride', 1)),
    });
    // World-anchored: the cloud sits exactly where the camera saw it.
    cloud.matrixAutoUpdate = false;
    cloud.matrix.copy(r.worldFromView);
    cloud.visible = this.cloudVisible;
    this.setCloud(cloud);
    this.comparison = compareDepth(this.depthMap, r.worldFromView, r.sensed);
    this.status(this.resultStatus());
    this.refreshButtons();
  }

  resultStatus() {
    const r = this.result;
    const range = depthRange(this.depthMap);
    const pose =
      r.poseMatchMs == null ? '' : ` | pose ${r.poseMatchMs.toFixed(0)} ms`;
    const lines = [
      `Aligned | ${r.elapsed.toFixed(0)} ms | ${(this.cloud.userData.count / 1000).toFixed(0)}k pts` +
        ` | depth ${range.near.toFixed(2)}-${range.far.toFixed(2)} m`,
      r.cameraLabel + pose,
      `hFOV: rays ${r.photoFov.toFixed(0)} deg (${r.intrinsicsSource}) | MoGe ${r.mogeFov.toFixed(0)} deg` +
        ` | shift ${r.shift.toFixed(3)} (${r.shiftSource}) | reproj ${r.rmsPx.toFixed(1)} px`,
      `metric scale ${r.scale.toFixed(3)} x user ${this.userScale.toFixed(3)}${this.scaleNote}`,
    ];
    const c = this.comparison;
    if (c) {
      lines.push(
        `vs sensed: ${percent(c.medianAbsRel)} median, ${percent(c.p90AbsRel)} p90,` +
          ` ${(c.medianAbsMeters * 100).toFixed(1)} cm median (n ${c.n})`,
        `fit x${c.scaleFit.toFixed(3)} would leave ${percent(c.fitMedianAbsRel)} median`
      );
    } else if (r.sensed) {
      lines.push('vs sensed: no overlap with the sensed depth frame');
    } else if (!r.knownIntrinsics) {
      lines.push('vs sensed: n/a (test image)');
    } else {
      lines.push(
        xb.core.depth?.enabled
          ? 'vs sensed: no sensed depth frame yet'
          : 'vs sensed: off (?sensedDepth=0)'
      );
    }
    lines.push(`photo ${r.photoSize} | ${this.readyLabel}`);
    return lines.join('\n');
  }

  setUserScale(scale, note) {
    if (!this.result) return;
    this.userScale = scale;
    this.scaleNote = note;
    this.rebuild();
  }

  /** Multiplies the depth scale by `factor` (the manual adjustment). */
  nudgeScale(factor) {
    if (!this.result) return;
    const note = this.scaleNote.includes('manual')
      ? this.scaleNote
      : this.scaleNote
        ? `${this.scaleNote.slice(0, -1)} + manual)`
        : ' (manual)';
    this.setUserScale(this.userScale * factor, note);
  }

  fitToSensed() {
    if (!this.comparison) return;
    this.setUserScale(
      this.userScale * this.comparison.scaleFit,
      ' (fit to sensed)'
    );
  }

  snapFloor() {
    if (!this.result || !this.depthMap) return;
    const floor = floorScale(
      this.depthMap,
      this.result.normals,
      this.result.worldFromView,
      {floorY: xb.getUrlParamFloat('floorY', 0)}
    );
    if (!floor) {
      this.status(
        `${this.resultStatus()}\nSnap floor: no floor found in the photo.`
      );
      return;
    }
    this.setUserScale(this.userScale * floor.k, ' (floor snap)');
  }

  toggleCamera() {
    this.cameraModel.toggleCalibration();
    this.refreshButtons();
    const note = this.cameraModel.correction
      ? ''
      : this.cameraModel.lastCorrection ||
          this.cameraModel.deviceCamera?.simulatorCamera
        ? ''
        : '\nNo ArUco calibration stored - press Calibrate.';
    this.status(
      `${this.cameraModel.describe()}${note}\nApplies to the next capture.`
    );
  }

  toggleCalibration() {
    if (this.calibration.isOpen) {
      this.calibration.close();
    } else {
      this.calibration.open(this);
    }
    this.refreshButtons();
  }

  toggleCloud() {
    this.cloudVisible = !this.cloudVisible;
    if (this.cloud) this.cloud.visible = this.cloudVisible;
    this.refreshButtons();
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
    if (this.cloud) {
      this.cloud.removeFromParent();
      disposeObject(this.cloud);
    }
    this.cloud = cloud;
    if (cloud) this.add(cloud);
  }

  clear() {
    this.setCloud(null);
    this.result = null;
    this.depthMap = null;
    this.comparison = null;
    this.userScale = 1;
    this.refreshButtons();
    if (this.ready && !this.busy) this.status(this.idleStatus());
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
    this.calibration?.close();
    this.setCloud(null);
    this.releaseModel();
    super.dispose();
  }
}
