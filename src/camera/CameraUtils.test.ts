import * as THREE from 'three';
import {describe, it, expect} from 'vitest';

import {XRDeviceCamera} from './XRDeviceCamera';
import {
  DEVICE_CAMERA_PARAMETERS,
  getCameraParametersSnapshot,
  getDeviceCameraClipFromView,
  getDeviceCameraWorldFromView,
  isDeviceCameraPoseAvailable,
} from './CameraUtils';

function makeXrCameras(count: number): THREE.WebXRArrayCamera {
  return {
    cameras: new Array(count).fill({}),
  } as unknown as THREE.WebXRArrayCamera;
}

function makeDeviceCamera(withSimulatorCamera: boolean): XRDeviceCamera {
  return {
    simulatorCamera: withSimulatorCamera
      ? new THREE.PerspectiveCamera()
      : undefined,
  } as unknown as XRDeviceCamera;
}

/** A device camera that captured intrinsics/pose off the WebXR view. */
function makeXrParamsDeviceCamera(): XRDeviceCamera {
  return {
    simulatorCamera: undefined,
    hasXRCameraParams: true,
    xrCameraClipFromView: new THREE.Matrix4().makeScale(2, 3, 4),
    xrCameraWorldFromView: new THREE.Matrix4().makeTranslation(1, 2, 3),
  } as unknown as XRDeviceCamera;
}

describe('isDeviceCameraPoseAvailable', () => {
  it('is false with no device camera and no XR cameras', () => {
    expect(isDeviceCameraPoseAvailable(undefined, null)).toBe(false);
  });

  it('is false when the XR array camera has no cameras yet', () => {
    expect(isDeviceCameraPoseAvailable(undefined, makeXrCameras(0))).toBe(
      false
    );
  });

  it('is true once the simulator camera is registered', () => {
    expect(isDeviceCameraPoseAvailable(makeDeviceCamera(true), null)).toBe(
      true
    );
  });

  it('is true once the XR session exposes cameras', () => {
    expect(isDeviceCameraPoseAvailable(undefined, makeXrCameras(2))).toBe(true);
  });

  it('is true once WebXR camera params are captured', () => {
    expect(isDeviceCameraPoseAvailable(makeXrParamsDeviceCamera(), null)).toBe(
      true
    );
  });
});

describe('getDeviceCameraClipFromView', () => {
  const renderCamera = new THREE.PerspectiveCamera();

  it('prefers the intrinsics captured off the WebXR view', () => {
    const deviceCamera = makeXrParamsDeviceCamera();
    expect(
      getDeviceCameraClipFromView(renderCamera, deviceCamera, 'galaxyxr')
    ).toBe(deviceCamera.xrCameraClipFromView);
  });

  it('falls back to the per-device table without WebXR params', () => {
    const deviceCamera = makeDeviceCamera(false);
    expect(
      getDeviceCameraClipFromView(renderCamera, deviceCamera, 'galaxyxr')
    ).toBe(DEVICE_CAMERA_PARAMETERS['galaxyxr'].projectionMatrix);
  });
});

describe('getDeviceCameraWorldFromView', () => {
  const renderCamera = new THREE.PerspectiveCamera();

  it('returns a clone of the pose captured off the WebXR view', () => {
    const deviceCamera = makeXrParamsDeviceCamera();
    const result = getDeviceCameraWorldFromView(
      renderCamera,
      null,
      deviceCamera,
      'galaxyxr'
    );
    expect(result.equals(deviceCamera.xrCameraWorldFromView!)).toBe(true);
    // A clone, so callers can't mutate the live matrix.
    expect(result).not.toBe(deviceCamera.xrCameraWorldFromView);
  });
});

describe('getCameraParametersSnapshot', () => {
  const renderCamera = new THREE.PerspectiveCamera(75, 1.5, 0.1, 100);
  renderCamera.updateMatrixWorld();

  it('returns null while no camera pose is available', () => {
    const snapshot = getCameraParametersSnapshot(
      renderCamera,
      null,
      makeDeviceCamera(false),
      'galaxyxr'
    );
    expect(snapshot).toBeNull();
  });

  it('returns a full snapshot once the simulator camera is available', () => {
    const snapshot = getCameraParametersSnapshot(
      renderCamera,
      null,
      makeDeviceCamera(true),
      'galaxyxr'
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot!.clipFromView).toBeInstanceOf(THREE.Matrix4);
    expect(snapshot!.viewFromClip).toBeInstanceOf(THREE.Matrix4);
    expect(snapshot!.worldFromView).toBeInstanceOf(THREE.Matrix4);
    expect(snapshot!.worldFromClip).toBeInstanceOf(THREE.Matrix4);
  });
});
