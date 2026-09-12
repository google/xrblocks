import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {
  cropImage,
  transformRgbUvToWorld,
  type CameraParametersSnapshot,
} from '../../camera/CameraUtils';
import {WorldOptions} from '../WorldOptions';
import type {CameraSnapshot} from './ObjectDetector';
import {
  BaseDetectorBackend,
  type DetectorBackendContext,
} from './ObjectDetectorBackend';

vi.mock('../../camera/CameraUtils', () => ({
  cropImage: vi.fn(),
  transformRgbUvToWorld: vi.fn(),
}));

class SnapshotBackend extends BaseDetectorBackend<null> {
  isAvailable = vi.fn().mockResolvedValue(true);
  getSnapshot = vi.fn().mockResolvedValue({base64: 'live-frame'});
  detect = vi
    .fn()
    .mockResolvedValue([
      {xmin: 0, ymin: 0, xmax: 1, ymax: 1, objectName: 'chair'},
    ]);
  visualize = vi.fn();
}

describe('Object detector backend snapshots', () => {
  let backend: SnapshotBackend;
  let options: WorldOptions;
  const depthMesh = new THREE.Mesh(new THREE.BoxGeometry());
  const cameraSnapshot: CameraParametersSnapshot = {
    clipFromView: new THREE.Matrix4(),
    viewFromClip: new THREE.Matrix4(),
    worldFromView: new THREE.Matrix4(),
    worldFromClip: new THREE.Matrix4(),
  };
  const snapshots: CameraSnapshot[] = [
    {base64: 'provided-frame'},
    {
      imageData: {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray(4),
        colorSpace: 'srgb',
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cropImage).mockResolvedValue('cropped-frame');
    vi.mocked(transformRgbUvToWorld).mockReturnValue({
      worldPosition: new THREE.Vector3(1, 2, 3),
      worldNormal: new THREE.Vector3(0, 1, 0),
      depthInMeters: 4,
    });
    options = new WorldOptions();
    backend = new SnapshotBackend({options} as DetectorBackendContext);
  });

  it('captures a live frame when no snapshot is supplied', async () => {
    await backend.run(depthMesh, cameraSnapshot);

    expect(backend.getSnapshot).toHaveBeenCalledTimes(1);
    expect(backend.detect).toHaveBeenCalledWith({base64: 'live-frame'});
    expect(cropImage).toHaveBeenCalledWith(
      'live-frame',
      expect.any(THREE.Box2)
    );
  });

  it.each(snapshots)(
    'uses the supplied snapshot for detection, crops, and visualization (%#)',
    async (snapshot) => {
      options.objects.showDebugVisualizations = true;

      const objects = await backend.run(depthMesh, cameraSnapshot, snapshot);

      expect(backend.getSnapshot).not.toHaveBeenCalled();
      expect(backend.detect).toHaveBeenCalledWith(snapshot);
      expect(cropImage).toHaveBeenCalledWith(
        snapshot.imageData ?? snapshot.base64,
        expect.any(THREE.Box2)
      );
      expect(backend.visualize).toHaveBeenCalledWith(
        snapshot,
        expect.any(Array)
      );
      expect(objects[0].position).toEqual(new THREE.Vector3(1, 2, 3));
    }
  );
});
