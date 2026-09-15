import * as THREE from 'three';
import {describe, it, expect} from 'vitest';

import {XRDeviceCamera} from './XRDeviceCamera';
import {
  getCameraParametersSnapshot,
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

describe('isDeviceCameraPoseAvailable', () => {
  it('is false before either camera source is ready', () => {
    expect(isDeviceCameraPoseAvailable(undefined, null)).toBe(false);
    expect(isDeviceCameraPoseAvailable(undefined, makeXrCameras(0))).toBe(
      false
    );
  });

  it('is true when the simulator or XR camera is ready', () => {
    expect(isDeviceCameraPoseAvailable(makeDeviceCamera(true), null)).toBe(
      true
    );
    expect(isDeviceCameraPoseAvailable(undefined, makeXrCameras(2))).toBe(true);
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
