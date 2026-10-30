import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as xb from 'xrblocks';

import {PlanarVST} from './PlanarVST';

vi.mock('xrblocks', async () => {
  const THREE = await import('three');
  return {
    Script: THREE.Object3D,
    core: {
      camera: new THREE.PerspectiveCamera(),
      deviceCamera: {texture: new THREE.Texture(), targetDevice: 'aura'},
      renderer: {xr: {getCamera: () => ({cameras: [{}]})}},
    },
    getCameraParametersSnapshot: vi.fn(() => ({
      clipFromView: new THREE.Matrix4(),
      viewFromClip: new THREE.Matrix4(),
      worldFromView: new THREE.Matrix4(),
      worldFromClip: new THREE.Matrix4(),
    })),
    getDeviceCameraClipFromView: vi.fn(() => new THREE.Matrix4()),
    getDeviceCameraWorldFromView: vi.fn(() => new THREE.Matrix4()),
    resolveDeviceCameraTarget: vi.fn(() => 'galaxyxr'),
  };
});

/** The profiles passed to every device-camera lookup since the last clear. */
function profilesUsed() {
  return [
    ...vi.mocked(xb.getCameraParametersSnapshot).mock.calls.map((c) => c[3]),
    ...vi.mocked(xb.getDeviceCameraClipFromView).mock.calls.map((c) => c[2]),
    ...vi.mocked(xb.getDeviceCameraWorldFromView).mock.calls.map((c) => c[3]),
  ];
}

describe('PlanarVST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('follows the device camera profile unless one is assigned', () => {
    const vst = new PlanarVST();
    vst.init();
    vst.update();
    expect(profilesUsed()).not.toHaveLength(0);
    expect(new Set(profilesUsed())).toEqual(new Set(['aura']));

    vi.clearAllMocks();
    vst.targetDevice = 'quest3';
    vst.update();
    expect(new Set(profilesUsed())).toEqual(new Set(['quest3']));
    expect(vst.targetDevice).toBe('quest3');
    vst.dispose();
  });
});
