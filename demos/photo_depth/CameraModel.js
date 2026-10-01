/**
 * The device-camera model used to place a photo back into the world: the
 * SDK's per-device estimate (intrinsics + camera-to-eye extrinsics), with an
 * optional 6-DOF extrinsic correction recovered by the ArUco addon's
 * self-calibration (the same `{rotation, translation}` the objects_3d demo
 * applies). The correction post-multiplies the SDK pose in the camera's own
 * frame: worldFromCamera = worldFromView_SDK · T(translation) · R(rotation).
 */
import * as xb from 'xrblocks';
import {loadPersistedArucoCalibration} from 'xrblocks/addons/aruco/index.js';
import {PoseRing} from 'xrblocks/addons/objects3d/geometry/PoseRing.js';

import {correctionFromCalibration, describeCorrection} from './correction.js';

export class CameraModel {
  /** Per-device profile of the SDK camera model (`'galaxyxr'`, `'quest3'`). */
  targetDevice = xb.detectDeviceCameraTarget();
  /** Extrinsic correction, or `null` for the plain SDK model. */
  correction = null;
  /** Human-readable source of {@link correction}. */
  source = 'SDK estimate';
  /** The last applied correction, kept so the SDK/ArUco toggle can restore it. */
  lastCorrection = null;
  lastSource = '';
  poseRing = new PoseRing(120);

  constructor(deviceCamera) {
    this.deviceCamera = deviceCamera;
  }

  /** The SDK camera snapshot right now, or `null` before a pose exists. */
  snapshot() {
    return xb.getCameraParametersSnapshot(
      xb.core.camera,
      xb.core.renderer.xr.getCamera(),
      this.deviceCamera,
      this.targetDevice
    );
  }

  /** Call every frame: remembers poses so a photo gets its capture-time pose. */
  record() {
    const snapshot = this.deviceCamera ? this.snapshot() : null;
    if (snapshot) this.poseRing.push(performance.now(), snapshot.worldFromView);
    return snapshot;
  }

  /**
   * The camera for a frame captured at `captureTime` (performance.now()
   * timebase): corrected camera-to-world pose, projection, and how well the
   * pose matched the frame time. `null` before a camera pose exists.
   */
  cameraAt(captureTime) {
    const snapshot = this.snapshot();
    if (!snapshot) return null;
    let worldFromView = snapshot.worldFromView;
    let poseMatchMs = null;
    // The simulator camera has no capture latency and no pose history to
    // speak of; on device, pair the pixels with the pose they were taken at.
    if (captureTime != null && !this.deviceCamera.simulatorCamera) {
      const recorded = this.poseRing.lookup(captureTime);
      if (recorded) {
        worldFromView = recorded;
        poseMatchMs = this.poseRing.matchErrorMs(captureTime);
      }
    }
    worldFromView = worldFromView.clone();
    if (this.correction) worldFromView.multiply(this.correction);
    return {
      worldFromView,
      clipFromView: snapshot.clipFromView.clone(),
      poseMatchMs,
    };
  }

  /** Applies an ArUco calibration (`null` returns to the SDK estimate). */
  setCalibration(calibration, source) {
    if (!calibration) {
      this.correction = null;
      this.source = 'SDK estimate';
      return;
    }
    this.correction = correctionFromCalibration(calibration);
    this.source = source;
    this.lastCorrection = this.correction;
    this.lastSource = source;
  }

  /**
   * Applies the calibration the ArUco tracker persisted for this device, if
   * any. The simulator camera is exact, so it never uses one.
   * @returns Whether a stored calibration was applied.
   */
  useStoredCalibration() {
    if (this.deviceCamera?.simulatorCamera) return false;
    const stored = loadPersistedArucoCalibration(this.targetDevice);
    if (!stored) return false;
    this.setCalibration(stored, 'ArUco (stored)');
    return true;
  }

  /** Switches between the SDK estimate and the last ArUco calibration. */
  toggleCalibration() {
    if (this.correction) {
      this.correction = null;
      this.source = 'SDK estimate';
    } else if (this.lastCorrection) {
      this.correction = this.lastCorrection;
      this.source = this.lastSource;
    } else {
      this.useStoredCalibration();
    }
  }

  /**
   * The camera model actually in use: the simulator camera ignores
   * {@link targetDevice} (its intrinsics come from the render camera's field
   * of view, its pose is the render camera's), so it is labeled as such.
   */
  get profile() {
    return this.deviceCamera?.simulatorCamera ? 'simulator' : this.targetDevice;
  }

  /** One-line description for the status panel (ASCII: panel font). */
  describe() {
    if (!this.correction) return `camera: SDK estimate (${this.profile})`;
    const {rotationDeg, translationCm} = describeCorrection(this.correction);
    return (
      `camera: ${this.source} (${this.profile}) | ` +
      `${rotationDeg.toFixed(1)} deg / ${translationCm.toFixed(1)} cm`
    );
  }
}
