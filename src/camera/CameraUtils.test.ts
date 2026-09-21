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
    xrCameraClipFromView: new THREE.Matrix4().makePerspective(
      -0.05,
      0.075,
      0.05,
      -0.03888888888888889,
      0.1,
      100
    ),
    xrCameraReferenceFromView: new THREE.Matrix4().makeTranslation(1, 2, 3),
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

  it.each([0.5, 2])(
    'preserves the simulator square crop for aspect %s',
    (aspect) => {
      const camera = new THREE.PerspectiveCamera(90, aspect, 0.1, 100);
      const deviceCamera = makeDeviceCamera(true);
      const projection = getDeviceCameraClipFromView(
        camera,
        deviceCamera,
        'galaxyxr'
      );
      expect(projection.elements[0]).toBeCloseTo(1 / Math.min(aspect, 1));
      expect(projection.elements[5]).toBeCloseTo(1 / Math.min(aspect, 1));
      expect(projection.elements[8]).toBe(0);
      expect(projection.elements[9]).toBe(0);
    }
  );
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
    expect(result.equals(deviceCamera.xrCameraReferenceFromView!)).toBe(true);
    // A clone, so callers can't mutate the live matrix.
    expect(result).not.toBe(deviceCamera.xrCameraReferenceFromView);
  });

  it('converts the reference-space pose through a translated render rig', () => {
    const camera = new THREE.PerspectiveCamera();
    const rig = new THREE.Group();
    rig.add(camera);
    rig.position.set(10, 0, 0);
    const result = getDeviceCameraWorldFromView(
      camera,
      null,
      makeXrParamsDeviceCamera(),
      'galaxyxr'
    );
    expect(new THREE.Vector3().setFromMatrixPosition(result).toArray()).toEqual(
      [11, 2, 3]
    );
  });

  it('updates ancestor transforms and rotates both the pose and off-axis ray', () => {
    const camera = new THREE.PerspectiveCamera();
    const rig = new THREE.Group();
    const parent = new THREE.Group();
    parent.add(rig);
    rig.add(camera);
    parent.position.set(10, 0, 0);
    rig.rotation.y = Math.PI / 2;
    const snapshot = getCameraParametersSnapshot(
      camera,
      null,
      makeXrParamsDeviceCamera(),
      'galaxyxr'
    )!;
    const origin = new THREE.Vector3().setFromMatrixPosition(
      snapshot.worldFromView
    );
    expect(origin.x).toBeCloseTo(13);
    expect(origin.y).toBeCloseTo(2);
    expect(origin.z).toBeCloseTo(-1);
    const direction = new THREE.Vector3(0, 0, -1)
      .applyMatrix4(snapshot.worldFromClip)
      .sub(origin)
      .normalize();
    const expected = new THREE.Vector3(-1, 1 / 18, -0.125).normalize();
    expect(direction.distanceTo(expected)).toBeLessThan(1e-10);
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
