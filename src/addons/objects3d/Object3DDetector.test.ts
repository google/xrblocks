import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  runDetection: vi.fn(),
  getSnapshot: vi.fn(),
}));

vi.mock('xrblocks', async () => {
  const THREE = await import('three');
  return {
    Script: THREE.Object3D,
    enableAcceleratedRaycast: vi.fn().mockResolvedValue(false),
    // No device-camera model in this environment: the detector falls back to
    // the render-camera frustum (see _buildRenderFrozenCamera).
    getCameraParametersSnapshot: vi.fn().mockReturnValue(null),
    getDeviceCameraWorldFromView: vi.fn().mockReturnValue(null),
    core: {
      camera: new THREE.PerspectiveCamera(),
      renderer: {xr: {getCamera: () => new THREE.ArrayCamera([])}},
      deviceCamera: Object.freeze({getSnapshot: mocks.getSnapshot}),
      depth: {
        depthMesh: new THREE.Mesh(new THREE.BoxGeometry()),
        // detect() forces a rebuild of the full-resolution mesh before
        // cloning it; the box above is already "current" here.
        updateFullResolutionDepthMesh: vi.fn(),
        normDepthBufferFromNormViewMatrices: [],
        depthCameraRotations: [],
      },
      world: {
        objects: {runDetection: mocks.runDetection},
        options: {
          objects: {
            backendConfig: Object.freeze({activeBackend: 'gemini'}),
          },
        },
      },
    },
  };
});

vi.mock('./masks/SamMask', () => ({
  getSam: vi.fn(),
  samEncodeSnapshot: vi.fn(),
  samMaskFromBbox: vi.fn(),
}));

vi.mock('./masks/SegmenterMask', () => ({
  segmenterMaskFromSnapshot: vi.fn(),
}));

import {Object3DDetector} from './Object3DDetector';

describe('Object3DDetector per-call inputs', () => {
  const imageData: ImageData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray(4),
    colorSpace: 'srgb',
  };
  const base64 = 'data:image/jpeg;base64,c25hcHNob3Q=';

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.getSnapshot.mockReturnValue(imageData);
    mocks.runDetection.mockResolvedValue([]);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: vi.fn(),
    } as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(base64);
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it.each(['gemini', 'mediapipe'] as const)(
    'passes the captured frame to %s without mutating shared state',
    async (backend) => {
      const detector = new Object3DDetector({
        detectBackend: backend,
        maskBackend: 'mediapipe',
      });

      await detector.detect();

      expect(mocks.getSnapshot).toHaveBeenCalledTimes(1);
      expect(mocks.runDetection).toHaveBeenCalledExactlyOnceWith({
        backend,
        snapshot: {base64, imageData},
      });
    }
  );

  it('reuses the same snapshot across both backend requests', async () => {
    const pending = Promise.withResolvers<[]>();
    mocks.runDetection.mockReturnValueOnce(pending.promise);
    const detector = new Object3DDetector({
      detectBackend: 'both',
      maskBackend: 'mediapipe',
    });

    const detection = detector.detect();
    // detect() awaits a fresh video frame and the BVH readiness probe before
    // it reaches the backends, so wait for both requests rather than for one
    // microtask.
    await vi.waitFor(() => expect(mocks.runDetection).toHaveBeenCalledTimes(2));

    expect(mocks.getSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.runDetection).toHaveBeenNthCalledWith(1, {
      backend: 'mediapipe',
      snapshot: {base64, imageData},
    });
    expect(mocks.runDetection).toHaveBeenNthCalledWith(2, {
      backend: 'gemini',
      snapshot: {base64, imageData},
    });
    pending.resolve([]);
    await detection;
  });

  it('can run again after a per-call request fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.runDetection.mockRejectedValueOnce(new Error('detection failed'));
    const detector = new Object3DDetector({maskBackend: 'mediapipe'});

    await detector.detect();
    await detector.detect();

    expect(mocks.runDetection).toHaveBeenCalledTimes(2);
    expect(mocks.getSnapshot).toHaveBeenCalledTimes(2);
  });
});
