import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {PlanarVST} from './PlanarVST';
import * as xb from 'xrblocks';

vi.mock('xrblocks', async () => {
  const THREE = await import('three');
  return {
    Script: THREE.Object3D,
    core: {
      camera: new THREE.PerspectiveCamera(),
      deviceCamera: {texture: new THREE.Texture()},
      renderer: {xr: {getCamera: () => ({cameras: [{}]})}},
    },
    getDeviceCameraClipFromView: vi.fn(),
    getDeviceCameraWorldFromView: vi.fn(() => new THREE.Matrix4()),
  };
});

describe('PlanarVST', () => {
  it.each([
    ['asymmetric', -0.05, 0.075, 0.05, -0.03888888888888889],
    ['symmetric', -0.05, 0.05, 0.05, -0.05],
  ] as const)(
    'fills the image for a %s perspective frustum',
    (_, left, right, top, bottom) => {
      const projection = new THREE.Matrix4().makePerspective(
        left,
        right,
        top,
        bottom,
        0.1,
        100
      );
      vi.mocked(xb.getDeviceCameraClipFromView).mockReturnValue(projection);
      const vst = new PlanarVST();
      vst.init();
      vst.update();
      const mesh = vst.children[0];
      mesh.updateMatrix();
      for (const [x, y] of [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
        [0, 0],
      ]) {
        const projected = new THREE.Vector3(x / 2, y / 2, 0)
          .applyMatrix4(mesh.matrix)
          .applyMatrix4(projection);
        expect(projected.x).toBeCloseTo(x);
        expect(projected.y).toBeCloseTo(y);
      }
      expect(mesh.position.z).toBe(-2);
      vst.dispose();
    }
  );
});
