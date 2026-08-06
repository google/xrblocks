import {describe, it, expect, vi} from 'vitest';
import * as THREE from 'three';

import {Depth} from './Depth';

describe('Depth', () => {
  /**
   * Creates a fresh Depth instance, clearing the singleton so each test
   * gets its own state.
   */
  function createDepth(): Depth {
    // Reset singleton between tests.
    Depth.instance = undefined;
    return new Depth();
  }

  describe('getDepth with normDepthBufferFromNormView', () => {
    it('returns 0 when no depth data is available', () => {
      const depth = createDepth();
      expect(depth.getDepth(0.5, 0.5)).toBe(0);
    });

    it('reads depth without transform when matrix array is empty', () => {
      const depth = createDepth();
      // Set up a 2x2 depth buffer with known values.
      depth.width = 2;
      depth.height = 2;
      // Row-major: [top-left, top-right, bottom-left, bottom-right]
      // Note: getDepth uses (1-v) for Y, so v=0 maps to last row.
      depth.depthArray[0] = new Float32Array([10, 20, 30, 40]);
      depth.cpuDepthData[0] = {rawValueToMeters: 0.1} as XRCPUDepthInformation;

      // u=0, v=1 should map to depthX=0, depthY=0 -> value 10
      expect(depth.getDepth(0, 1)).toBeCloseTo(1.0);
      // u=1, v=0 should map to depthX=1 (round(1*1)=1), depthY=1 -> value 40
      // Actually: depthX = round(1*2) clamped to 1, depthY = round(1*2) clamped to 1
      // -> index = 1*2+1 = 3 -> value 40
      expect(depth.getDepth(1, 0)).toBeCloseTo(4.0);
    });

    it('applies normDepthBufferFromNormView transform to coordinates', () => {
      const depth = createDepth();
      depth.width = 2;
      depth.height = 2;
      depth.depthArray[0] = new Float32Array([10, 20, 30, 40]);
      depth.cpuDepthData[0] = {rawValueToMeters: 0.1} as XRCPUDepthInformation;

      // Set up a transform that swaps u and v (simulating a 90-degree rotation
      // between view and depth buffer coordinate systems).
      const swapMatrix = new THREE.Matrix4().set(
        0,
        1,
        0,
        0, // new_x = old_y
        1,
        0,
        0,
        0, // new_y = old_x
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1
      );
      depth.normDepthBufferFromNormViewMatrices[0] = swapMatrix;

      // Without the transform, getDepth(0, 1) would read (u=0, v=1).
      // With the swap, it becomes (u=1, v=0), reading the opposite corner.
      const withTransform = depth.getDepth(0, 1);
      // u=1,v=0 -> depthX=round(1*2) clamped 1, depthY=round(1*2) clamped 1
      // -> index 3 -> value 40 * 0.1 = 4.0
      expect(withTransform).toBeCloseTo(4.0);
    });
  });

  describe('getVertex with normDepthBufferFromNormView', () => {
    it('returns null when no depth data is available', () => {
      const depth = createDepth();
      expect(depth.getVertex(0.5, 0.5)).toBeNull();
    });

    it('applies transform before looking up depth', () => {
      const depth = createDepth();
      depth.width = 2;
      depth.height = 2;
      depth.depthArray[0] = new Float32Array([10, 20, 30, 40]);
      depth.cpuDepthData[0] = {rawValueToMeters: 0.1} as XRCPUDepthInformation;
      depth.depthProjectionInverseMatrices[0] = new THREE.Matrix4(); // identity

      // Identity transform — result should be the same as no transform.
      depth.normDepthBufferFromNormViewMatrices[0] = new THREE.Matrix4();
      const vertex = depth.getVertex(0, 1);
      expect(vertex).not.toBeNull();
    });
  });

  describe('shouldUpdateDepthMesh throttling', () => {
    it('throttles updates until the configured interval has passed', () => {
      const depth = createDepth();
      depth.options.depthMesh.depthMeshUpdateFps = 10; // 100ms between updates

      const shouldUpdate = (depth as unknown as Record<string, () => boolean>)[
        'shouldUpdateDepthMesh'
      ];

      // First call should always succeed.
      expect(shouldUpdate.call(depth)).toBe(true);

      // Immediate second call should be throttled.
      expect(shouldUpdate.call(depth)).toBe(false);

      // Fast-forward time by 150ms.
      vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 150);
      expect(shouldUpdate.call(depth)).toBe(true);

      vi.restoreAllMocks();
    });
  });
});
