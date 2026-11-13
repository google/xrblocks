import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {DeviceCameraOptions} from './CameraOptions';
import {XRDeviceCamera} from './XRDeviceCamera';
import {
  DEVICE_CAMERA_PARAMETERS,
  getCameraParametersSnapshot,
  resolveDeviceCameraTarget,
} from './CameraUtils';
import {SimulatorCamera} from '../simulator/SimulatorCamera';
afterEach(() => {
  window.history.replaceState(null, '', '/');
  delete DEVICE_CAMERA_PARAMETERS.testRig;
  vi.restoreAllMocks();
});
it('uses explicit calibration and returns detached camera matrices', () => {
  const projection = new THREE.PerspectiveCamera(62, 0.7, 0.2, 30)
    .projectionMatrix;
  DEVICE_CAMERA_PARAMETERS.testRig = {
    projectionMatrix: projection,
    getCameraPose: (camera, _eyes, target) =>
      target
        .copy(camera.matrixWorld)
        .multiply(new THREE.Matrix4().makeTranslation(0.1, -0.2, 0.3)),
  };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1, 2, 3);
  camera.updateMatrixWorld(true);
  const device = new XRDeviceCamera(
    new DeviceCameraOptions({targetDevice: 'testRig'})
  );
  try {
    const snapshot = getCameraParametersSnapshot(
      camera,
      new THREE.ArrayCamera([camera]) as THREE.WebXRArrayCamera,
      device,
      device.targetDevice
    )!;
    expect(
      new THREE.Vector3()
        .setFromMatrixPosition(snapshot.worldFromView)
        .toArray()
    ).toEqual([1.1, 1.8, 3.3]);
    expect(snapshot.clipFromView).toEqual(projection);
    snapshot.clipFromView.identity();
    expect(projection.equals(new THREE.Matrix4())).toBe(false);
  } finally {
    device.dispose();
  }
});
it('crops the simulator projection to a square while retaining its world pose', () => {
  const camera = new THREE.PerspectiveCamera(90, 0.5, 0.1, 20);
  camera.position.set(1, 2, 3);
  camera.updateMatrixWorld(true);
  const device = new XRDeviceCamera(new DeviceCameraOptions());
  device.simulatorCamera = new SimulatorCamera({
    domElement: document.createElement('canvas'),
  } as never);
  try {
    const snapshot = getCameraParametersSnapshot(
      camera,
      null,
      device,
      device.targetDevice
    )!;
    const edge = new THREE.Vector3(0.5, 0, -1).applyMatrix4(
      snapshot.clipFromView
    );
    expect(edge.x).toBeCloseTo(1);
    expect(snapshot.worldFromView).toEqual(camera.matrixWorld);
  } finally {
    device.dispose();
  }
});
it('lets the page select a camera profile over the configured one', () => {
  window.history.replaceState(null, '', '/?camera=%20Quest3%20');
  expect(resolveDeviceCameraTarget('aura')).toBe('quest3');
});
