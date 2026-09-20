import {describe, it, expect, vi} from 'vitest';
import {Depth} from './Depth';

describe('Depth GPU readback dimensions', () => {
  it.each([
    [3, 2],
    [1, 2],
  ])(
    'replaces the cached CPU array when readback changes to %sx%s',
    (width, height) => {
      Depth.instance = undefined;
      const depth = new Depth();
      depth.options.depthMesh.enabled = true;
      depth.options.depthTexture.enabled = false;
      vi.spyOn(
        depth as unknown as {updateDepthMatrices(): void},
        'updateDepthMatrices'
      ).mockImplementation(() => {});
      const convertGPUToCPU = vi
        .fn()
        .mockReturnValueOnce({
          width: 2,
          height: 2,
          data: new Float32Array([1, 2, 3, 4]).buffer,
          rawValueToMeters: 1,
        })
        .mockReturnValueOnce({
          width,
          height,
          data: new Float32Array(width * height).fill(7).buffer,
          rawValueToMeters: 1,
        });
      (
        depth as unknown as {
          gpuDepthConverter: {convertGPUToCPU: typeof convertGPUToCPU};
        }
      ).gpuDepthConverter = {convertGPUToCPU};
      const frame = {width: 2, height: 2} as XRWebGLDepthInformation;

      depth.updateGPUDepthData(frame, 0);
      depth.updateGPUDepthData({...frame, width, height}, 0);

      expect([depth.width, depth.height]).toEqual([width, height]);
      expect(depth.depthArray[0]).toBeInstanceOf(Float32Array);
      expect(Array.from(depth.depthArray[0])).toEqual(
        Array(width * height).fill(7)
      );
      expect(depth.getDepth(1, 0)).toBe(7);
    }
  );
});
