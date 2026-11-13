import * as THREE from 'three';
import {expect, it} from 'vitest';
import {DepthMesh} from './DepthMesh';
import {DepthOptions} from './DepthOptions';
it('unprojects measured depth and refreshes geometry when camera projection changes', () => {
  const options = new DepthOptions({
    depthMesh: {
      updateFullResolutionGeometry: true,
      useDownsampledGeometry: false,
      depthFullResolution: 4,
      ignoreEdgePixels: 0,
    },
  });
  const mesh = new DepthMesh(options, 4, 4),
    camera = new THREE.PerspectiveCamera(90, 1, 0.1, 10);
  const data = {
    width: 4,
    height: 4,
    rawValueToMeters: 0.01,
    data: new Float32Array(16).fill(200).buffer,
  } as XRCPUDepthInformation;
  try {
    mesh.updateDepth(data, camera.projectionMatrixInverse, 'float32');
    const positions = mesh.geometry.getAttribute('position'),
      uv = mesh.geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getX(i)).toBeCloseTo((uv.getX(i) * 2 - 1) * 2);
      expect(positions.getY(i)).toBeCloseTo((uv.getY(i) * 2 - 1) * 2);
      expect(positions.getZ(i)).toBeCloseTo(-2);
    }
    const firstX = positions.getX(0);
    camera.fov = 60;
    camera.updateProjectionMatrix();
    mesh.updateDepth(data, camera.projectionMatrixInverse, 'float32');
    expect(positions.getX(0)).toBeCloseTo(firstX / Math.sqrt(3));
  } finally {
    mesh.disposeResources();
  }
});
