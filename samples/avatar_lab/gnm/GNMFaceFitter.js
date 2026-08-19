/**
 * GNMFaceFitter.js — drives the GNM head from a photo or a live webcam.
 *
 * Two entry points over one pipeline:
 *
 *   fitImage()    one still frame. Solves identity — who this face is — then
 *                 one pass of expression and head pose, so a dropped portrait
 *                 lands with its own expression rather than a neutral stare.
 *   startCamera() the same retarget every frame, identity held fixed. Fit
 *                 identity from a still (or from a neutral webcam frame)
 *                 first, or the subject's own face shape is read as a
 *                 permanent expression.
 *
 * The solve itself lives in FaceFit.js; this module owns the plumbing —
 * lazily loading a 3.7 MB landmarker only when a fit is first asked for,
 * throttling to the camera's frame rate, drawing the preview, and handing
 * results to the scene.
 *
 * Two constraints shaped it:
 *
 * - **Ticked by the scene, not by requestAnimationFrame.** window.rAF does not
 *   fire inside an immersive WebXR session, so a self-driven loop would stop
 *   the moment the user entered XR. `GNMScene.update` runs in both.
 * - **Only 20 expression components are solved.** Measured on this model,
 *   `setExpressionVector` costs ~2 ms at 20 non-zero coefficients and ~20 ms at
 *   237, because it re-accumulates a 53,463-float displacement per component.
 *   The eye regions are capped hardest, and lose least: geometric eyelid
 *   tracking is weak regardless — the honest fix is the ARKit blendshapes,
 *   which are surfaced in the readout but not yet mapped onto this basis.
 */

import {FaceRetargeter, fitIdentity} from './FaceFit.js';
import {
  closeCamera,
  decodeImage,
  FaceTracker,
  openCamera,
} from './FaceTracking.js';

/** A 960px render of the C2RMF scan; the 7479px original is 94 MB. */
export const SAMPLE_IMAGE = {
  name: 'Mona Lisa',
  url:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/' +
    'Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/' +
    '960px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg',
  credit: 'Leonardo da Vinci, C2RMF retouched scan — Wikimedia Commons',
};

/**
 * Per-region component budgets for the live solve. See the module comment for
 * the measurement; `lower_face_region: 4` is upstream's, and is a conditioning
 * limit rather than a performance one.
 */
const LIVE_REGION_BUDGET = {
  left_eye_region: 8,
  right_eye_region: 8,
  lower_face_region: 4,
  // Neither is observable from a face landmarker, and both cost the same per
  // frame as anything else.
  tongue: 0,
  pupils: 0,
};

/** Largest eye rotation the tracked gaze may command, in radians. */
const MAX_GAZE_ANGLE = 0.5;

export class GNMFaceFitter {
  /**
   * @param {!GNMHeadModel} model The loaded head model.
   * @param {!GNMScene} scene The scene to drive.
   */
  constructor(model, scene) {
    this.model = model;
    this.scene = scene;
    this.tracker = null;
    this.retargeter = null;

    this.options = {
      fitIdentity: true,
      trackExpression: true,
      trackHead: true,
      trackGaze: true,
      mirrorPreview: true,
    };

    /** Called with a status string. */
    this.onStatus = null;
    /** Called with a result record after each fit or tracked frame. */
    this.onResult = null;

    this.identity = null;
    this.source = null; // {kind: 'image'|'camera', bitmap|video, width, height}
    this.tracking = false;
    this._previewCanvas = null;
    this._previewContext = null;
    this._lastVideoTime = -1;
    this._lastFrame = null;
    this._loading = null;
    this._smoothedGaze = {x: 0, y: 0};
  }

  _status(text) {
    this.onStatus?.(text);
  }

  /** Loads the landmarker once; concurrent callers share the same promise. */
  async ensureTracker() {
    if (this.tracker) return this.tracker;
    if (!this._loading) {
      this._loading = FaceTracker.create((text) => this._status(text))
        .then((tracker) => {
          this.tracker = tracker;
          return tracker;
        })
        .catch((error) => {
          this._loading = null;
          throw error;
        });
    }
    return await this._loading;
  }

  _ensureRetargeter() {
    if (!this.retargeter) {
      this.retargeter = new FaceRetargeter(this.model, {
        regionBudget: LIVE_REGION_BUDGET,
      });
    }
    return this.retargeter;
  }

  /** Attaches the canvas the preview and landmark overlay are drawn into. */
  setPreviewCanvas(canvas) {
    this._previewCanvas = canvas;
    this._previewContext = canvas?.getContext('2d') ?? null;
  }

  // ------------------------------------------------------------------ still --

  /**
   * Fits the head to a single image.
   *
   * @param {!Blob|string|!ImageBitmap} source A dropped file, a URL, or an
   *     already-decoded bitmap.
   * @param {string=} label Name to show in the status line.
   * @return {!Promise<!Object>} The fit result.
   */
  async fitImage(source, label = 'image') {
    await this.ensureTracker();
    this._status(`Reading ${label}…`);

    const bitmap =
      typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap
        ? source
        : await decodeImage(source);

    this.stopCamera({keepIdentity: true});
    this.source = {
      kind: 'image',
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
    };

    this._status(`Detecting face in ${label}…`);
    const frame = await this.tracker.detectImage(
      bitmap,
      bitmap.width,
      bitmap.height
    );
    if (!frame) {
      this._drawPreview(null);
      throw new Error(`No face found in ${label}.`);
    }
    this._lastFrame = frame;

    const result = {source: label, width: bitmap.width, height: bitmap.height};

    if (this.options.fitIdentity) {
      const fit = fitIdentity(this.model, frame.landmarks, frame.aspect);
      this.identity = fit.identity;
      this._ensureRetargeter().setIdentity(fit.identity);
      this.scene.applyFittedIdentity(fit.identity, true);
      Object.assign(result, {
        points: fit.points,
        components: fit.components,
        rmsBefore: fit.rmsBefore,
        rmsAfter: fit.rmsAfter,
        peak: fit.peak,
      });
    }

    // One retarget pass, so the portrait arrives wearing its own expression.
    const retargeter = this._ensureRetargeter();
    retargeter.reset();
    const solution = retargeter.solve(frame.landmarks, frame.aspect);
    this._applySolution(solution, frame);
    result.expressionRms = solution.rms;
    result.blendshapes = frame.blendshapes;

    this._drawPreview(frame);
    this._status(
      this.options.fitIdentity
        ? `Fitted ${label}: ${result.rmsBefore.toFixed(1)} → ` +
            `${result.rmsAfter.toFixed(1)} mm over ${result.points} points.`
        : `Retargeted ${label}: ${solution.rms.toFixed(1)} mm.`
    );
    this.onResult?.(result);
    return result;
  }

  /** Fits the head to the bundled sample portrait. */
  async fitSampleImage() {
    return await this.fitImage(SAMPLE_IMAGE.url, SAMPLE_IMAGE.name);
  }

  // ----------------------------------------------------------------- camera --

  /**
   * Opens the webcam and begins per-frame retargeting.
   *
   * @return {!Promise<void>} Resolves once frames are being solved.
   */
  async startCamera() {
    if (this.tracking) return;
    await this.ensureTracker();
    this._status('Requesting camera…');
    const video = await openCamera();
    await this.tracker.beginVideo();

    this.source = {
      kind: 'camera',
      video,
      width: video.videoWidth,
      height: video.videoHeight,
    };
    this._ensureRetargeter().reset();
    this._lastVideoTime = -1;
    this._smoothedGaze = {x: 0, y: 0};
    this.tracking = true;
    this.scene.beginFaceTracking();
    this._status('Tracking — hold a neutral face and press Fit identity.');
  }

  /**
   * Stops the webcam and hands the head back to the scene's own animation.
   *
   * @param {{keepIdentity: (boolean|undefined)}=} options Retain the fitted
   *     identity (the default) or reset the face entirely.
   */
  stopCamera({keepIdentity = true} = {}) {
    if (this.source?.kind === 'camera') {
      closeCamera(this.source.video);
      this.source = null;
    }
    if (!this.tracking) return;
    this.tracking = false;
    this.scene.endFaceTracking();
    if (!keepIdentity) {
      this.identity = null;
      this.scene.resetToNeutral();
    }
    this._status('Camera stopped.');
  }

  /**
   * Fits identity from the current webcam frame.
   *
   * @return {!Object} The fit result.
   */
  fitIdentityFromCamera() {
    const frame = this._lastFrame;
    if (!frame) throw new Error('No tracked face yet.');
    const fit = fitIdentity(this.model, frame.landmarks, frame.aspect);
    this.identity = fit.identity;
    this._ensureRetargeter().setIdentity(fit.identity);
    this.scene.applyFittedIdentity(fit.identity, true);
    this._status(
      `Fitted identity: ${fit.rmsBefore.toFixed(1)} → ` +
        `${fit.rmsAfter.toFixed(1)} mm over ${fit.points} points.`
    );
    const result = {
      source: 'camera',
      points: fit.points,
      components: fit.components,
      rmsBefore: fit.rmsBefore,
      rmsAfter: fit.rmsAfter,
      peak: fit.peak,
      blendshapes: frame.blendshapes,
    };
    this.onResult?.(result);
    return result;
  }

  /** Clears the fitted identity and returns the head to the template face. */
  clearIdentity() {
    this.identity = null;
    this._ensureRetargeter().setIdentity(
      new Float32Array(this.model.identityDim)
    );
    this.scene.applyFittedIdentity(
      new Float32Array(this.model.identityDim),
      true
    );
    this._status('Identity reset to the template face.');
  }

  // ------------------------------------------------------------------- tick --

  /**
   * Solves one camera frame. Called from `GNMScene.update`, so it keeps running
   * inside an immersive session where window.requestAnimationFrame does not
   * fire.
   */
  tick() {
    if (!this.tracking || this.source?.kind !== 'camera') return;
    const video = this.source.video;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    // The camera runs at ~30 fps and the page renders at 60+, so solving per
    // rendered frame would do half its work on landmarks that had not changed.
    if (video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = video.currentTime;

    this.source.width = video.videoWidth;
    this.source.height = video.videoHeight;

    let frame = null;
    try {
      frame = this.tracker.detectVideo(video, performance.now());
    } catch (error) {
      console.warn('[gnm] face detection failed', error);
      return;
    }
    if (frame) {
      this._lastFrame = frame;
      const solution = this._ensureRetargeter().solve(
        frame.landmarks,
        frame.aspect
      );
      this._applySolution(solution, frame);
      this.onResult?.({
        source: 'camera',
        expressionRms: solution.rms,
        headRotation: solution.headRotation,
        blendshapes: frame.blendshapes,
        width: frame.width,
        height: frame.height,
      });
    }
    this._drawPreview(frame);
  }

  /** Pushes a solved frame onto the scene, honouring the per-channel toggles. */
  _applySolution(solution, frame) {
    const gaze = this.options.trackGaze ? this._trackedGaze(frame) : null;
    this.scene.applyTrackedFace({
      expression: this.options.trackExpression ? solution.expression : null,
      headRotation: this.options.trackHead ? solution.headRotation : null,
      gaze,
    });
  }

  /**
   * Averages the two eyes' iris offsets into one gaze direction.
   *
   * Per-eye vergence is below the landmarker's noise floor at webcam
   * resolution, and splitting it makes the eyes disagree visibly, so both eyes
   * are given the same direction.
   */
  _trackedGaze(frame) {
    if (!frame?.gaze) return null;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const x = clamp((frame.gaze.left.x + frame.gaze.right.x) / 2);
    const y = clamp((frame.gaze.left.y + frame.gaze.right.y) / 2);
    // Gaze is the jitteriest signal here — a few pixels of iris centre is a
    // large fraction of an eye half-width — so it is smoothed harder than the
    // expression solve is.
    const alpha = 0.25;
    this._smoothedGaze.x += (x - this._smoothedGaze.x) * alpha;
    this._smoothedGaze.y += (y - this._smoothedGaze.y) * alpha;
    return {
      x: this._smoothedGaze.x * MAX_GAZE_ANGLE,
      y: this._smoothedGaze.y * MAX_GAZE_ANGLE,
    };
  }

  // ---------------------------------------------------------------- preview --

  /**
   * Draws the current source with its tracked landmarks.
   *
   * The preview is mirrored by transforming the canvas, never the frame handed
   * to the landmarker: MediaPipe reports ARKit blendshape names from the
   * subject's point of view, so mirroring the input would swap every Left/Right
   * label and every landmark index with it.
   */
  _drawPreview(frame) {
    const canvas = this._previewCanvas;
    const context = this._previewContext;
    const source = this.source;
    if (!canvas || !context || !source) return;

    const width = source.width || 1;
    const height = source.height || 1;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.save();
    context.clearRect(0, 0, width, height);
    if (this.options.mirrorPreview && source.kind === 'camera') {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    const image = source.kind === 'camera' ? source.video : source.bitmap;
    if (image) context.drawImage(image, 0, 0, width, height);

    if (frame) {
      const radius = Math.max(1, Math.round(Math.min(width, height) / 400));
      context.fillStyle = 'rgba(120, 220, 255, 0.85)';
      for (const landmark of frame.landmarks) {
        context.beginPath();
        context.arc(
          landmark.x * width,
          landmark.y * height,
          radius,
          0,
          Math.PI * 2
        );
        context.fill();
      }
    }
    context.restore();
  }

  dispose() {
    this.stopCamera();
    this.tracker?.close();
    this.tracker = null;
    this.retargeter = null;
  }
}
