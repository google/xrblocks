import * as THREE from 'three';
import {afterEach, describe, it, expect, vi} from 'vitest';

import {XRDeviceCamera} from './XRDeviceCamera';
import {
  DEVICE_CAMERA_PARAMETERS,
  detectDeviceCameraTarget,
  getCameraParametersSnapshot,
  isDeviceCameraPoseAvailable,
  resolveDeviceCameraTarget,
} from './CameraUtils';

const QUEST_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) OculusBrowser/40.0 Chrome/136.0 VR Safari/537.36';

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

describe('detectDeviceCameraTarget', () => {
  it('picks the Quest profile in the Meta Quest browser', () => {
    expect(
      detectDeviceCameraTarget(
        'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) OculusBrowser/40.0 Chrome/136.0 VR Safari/537.36'
      )
    ).toBe('quest3');
  });

  it('defaults to the Galaxy XR profile', () => {
    expect(
      detectDeviceCameraTarget(
        'Mozilla/5.0 (Linux; Android 14; SM-I610) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/136.0 Mobile Safari/537.36'
      )
    ).toBe('galaxyxr');
    expect(detectDeviceCameraTarget('')).toBe('galaxyxr');
  });
});

describe('resolveDeviceCameraTarget', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  function setSearch(search: string) {
    window.history.replaceState(null, '', `/${search}`);
  }

  it('detects the profile from the user agent when none is chosen', () => {
    expect(resolveDeviceCameraTarget()).toBe('galaxyxr');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(QUEST_USER_AGENT);
    expect(resolveDeviceCameraTarget()).toBe('quest3');
  });

  it('prefers the configured profile over the user agent', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(QUEST_USER_AGENT);
    expect(resolveDeviceCameraTarget('aura')).toBe('aura');
  });

  it('lets ?camera= override the configured profile in any case', () => {
    setSearch('?camera=%20Quest3%20');
    expect(resolveDeviceCameraTarget('aura')).toBe('quest3');
  });

  it.each(['hololens', 'constructor'])(
    'ignores ?camera=%s with a warning',
    (name) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setSearch(`?camera=${name}`);
      expect(resolveDeviceCameraTarget('aura')).toBe('aura');
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toContain(`"${name}"`);
      expect(warn.mock.calls[0][0]).toContain('galaxyxr, aura, quest3');
    }
  );

  it('treats an empty ?camera= as absent', () => {
    const warn = vi.spyOn(console, 'warn');
    setSearch('?camera=');
    expect(resolveDeviceCameraTarget('aura')).toBe('aura');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['Aura', 'constructor'])(
    'needs an exact key in code and warns about %s',
    (name) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(resolveDeviceCameraTarget(name)).toBe('galaxyxr');
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toContain(`"${name}"`);
    }
  );

  it('accepts profiles added to DEVICE_CAMERA_PARAMETERS', () => {
    DEVICE_CAMERA_PARAMETERS.testRig = DEVICE_CAMERA_PARAMETERS.galaxyxr;
    try {
      expect(resolveDeviceCameraTarget('testRig')).toBe('testRig');
      setSearch('?camera=TESTRIG');
      expect(resolveDeviceCameraTarget('aura')).toBe('testRig');
    } finally {
      delete DEVICE_CAMERA_PARAMETERS.testRig;
    }
  });
});

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

  it('resolves the Aura camera profile from the render camera pose', () => {
    const xrCameras = {
      cameras: [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()],
    } as unknown as THREE.WebXRArrayCamera;
    const snapshot = getCameraParametersSnapshot(
      renderCamera,
      xrCameras,
      makeDeviceCamera(false),
      'aura'
    );
    expect(snapshot).not.toBeNull();
    const pos = new THREE.Vector3().setFromMatrixPosition(
      snapshot!.worldFromView
    );
    expect(pos.x).toBeCloseTo(0);
    expect(pos.y).toBeCloseTo(0);
    expect(pos.z).toBeCloseTo(-0.06);
  });

  it('copies the projection so changing a snapshot leaves the table intact', () => {
    const xrCameras = {
      cameras: [new THREE.PerspectiveCamera(), new THREE.PerspectiveCamera()],
    } as unknown as THREE.WebXRArrayCamera;
    const table = DEVICE_CAMERA_PARAMETERS.galaxyxr.projectionMatrix;
    const saved = table.toArray();
    try {
      const snapshot = getCameraParametersSnapshot(
        renderCamera,
        xrCameras,
        makeDeviceCamera(false),
        'galaxyxr'
      )!;
      expect(snapshot.clipFromView).not.toBe(table);
      snapshot.clipFromView.identity();
      expect(table.toArray()).toEqual(saved);
    } finally {
      table.fromArray(saved);
    }
  });
});
