import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {clamp} from '../utils/utils';

import {DepthMesh} from './DepthMesh';
import {DepthOptions, xrDepthMeshVisualizationOptions} from './DepthOptions';
import {DepthTextures} from './DepthTextures';

function createMockDepthData(
  width: number,
  height: number,
  transformMatrix?: Float32Array
): XRCPUDepthInformation {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      data[y * width + x] = 1.5 + 0.5 * (x / width) + 0.25 * (y / height);
    }
  }
  return {
    width,
    height,
    data: data.buffer,
    rawValueToMeters: 1.0,
    normDepthBufferFromNormView: transformMatrix
      ? ({matrix: transformMatrix} as unknown as XRRigidTransform)
      : undefined,
    getDepthInMeters: () => 0,
  };
}

describe('DepthMeshGeometry', () => {
  it('computes vertex positions matching Matrix4 unprojection and UV transform', () => {
    const options = new DepthOptions(xrDepthMeshVisualizationOptions);
    options.depthMesh.depthFullResolution = 16;
    options.depthMesh.ignoreEdgePixels = 1;
    options.depthMesh.updateFullResolutionGeometry = true;
    options.depthMesh.updateVertexNormals = true;

    const depthMesh = new DepthMesh(options, 16, 16);
    const camera = new THREE.PerspectiveCamera(70, 1.0, 0.05, 50);
    camera.updateProjectionMatrix();
    const projInv = camera.projectionMatrixInverse.clone();

    const uvTransform = new THREE.Matrix4()
      .makeRotationZ(0.15)
      .setPosition(0.05, -0.02, 0);
    const depthData = createMockDepthData(
      16,
      16,
      new Float32Array(uvTransform.elements)
    );

    depthMesh.updateDepth(depthData, projInv, 'float32');

    const posArray = depthMesh.geometry.attributes.position
      .array as Float32Array;
    const uvArray = depthMesh.geometry.attributes.uv.array as Float32Array;
    const depthArray = new Float32Array(depthData.data);
    const vertexPosition = new THREE.Vector3();
    const normViewCoord = new THREE.Vector3();

    for (let i = 0; i < depthMesh.geometry.attributes.position.count; ++i) {
      const u = uvArray[2 * i];
      const v = uvArray[2 * i + 1];
      normViewCoord.set(u, 1.0 - v, 0).applyMatrix4(uvTransform);
      const depthX = Math.round(clamp(normViewCoord.x * 15, 0, 15));
      const depthY = Math.round(clamp(normViewCoord.y * 15, 0, 15));
      const depth = depthArray[depthY * 16 + depthX];

      vertexPosition
        .set(2.0 * (u - 0.5), 2.0 * (v - 0.5), -1)
        .applyMatrix4(projInv)
        .multiplyScalar(-depth / vertexPosition.z);

      expect(posArray[3 * i]).toBeCloseTo(vertexPosition.x, 5);
      expect(posArray[3 * i + 1]).toBeCloseTo(vertexPosition.y, 5);
      expect(posArray[3 * i + 2]).toBeCloseTo(vertexPosition.z, 5);
    }

    // Verify grid vertex normals are normalized and facing +Z
    const normArray = depthMesh.geometry.attributes.normal
      .array as Float32Array;
    for (let i = 0; i < depthMesh.geometry.attributes.normal.count; ++i) {
      const nx = normArray[3 * i];
      const ny = normArray[3 * i + 1];
      const nz = normArray[3 * i + 2];
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1.0, 5);
      expect(nz).toBeGreaterThan(0.5);
    }
  });

  it('recomputes unprojection rays when projectionMatrixInverse changes', () => {
    const options = new DepthOptions(xrDepthMeshVisualizationOptions);
    options.depthMesh.depthFullResolution = 10;
    options.depthMesh.ignoreEdgePixels = 1;
    const depthTextures = {
      get: () => new THREE.Texture(),
      depthData: [{rawValueToMeters: 1.0}],
    } as unknown as DepthTextures;

    const depthMesh = new DepthMesh(options, 8, 8, depthTextures);
    const depthData = createMockDepthData(8, 8);

    const cam1 = new THREE.PerspectiveCamera(60, 1.0, 0.1, 20);
    cam1.updateProjectionMatrix();
    depthMesh.updateDepth(depthData, cam1.projectionMatrixInverse, 'float32');
    const firstX = depthMesh.geometry.attributes.position.array[0];

    const cam2 = new THREE.PerspectiveCamera(90, 1.0, 0.1, 20);
    cam2.updateProjectionMatrix();
    depthMesh.updateDepth(depthData, cam2.projectionMatrixInverse, 'float32');
    const secondX = depthMesh.geometry.attributes.position.array[0];

    expect(Math.abs(secondX)).toBeGreaterThan(Math.abs(firstX));
    expect(depthMesh.depthTextureUniforms?.uUseDerivativeNormals.value).toBe(
      false
    );
  });
});
