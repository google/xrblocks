import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {getCameraParametersSnapshot} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Depth} from '../../depth/Depth';
import {WorldOptions} from '../WorldOptions';

import {DetectedObject} from './DetectedObject';
import {ObjectDetector} from './ObjectDetector';

vi.mock('../../camera/CameraUtils', () => ({
  getCameraParametersSnapshot: vi.fn(),
}));

interface PrivateObjectDetector {
  currentDetectionPromise: Promise<DetectedObject<unknown>[]> | null;
  getOrCreateDetectorBackend: (
    activeBackend: string,
    context: unknown
  ) => Promise<unknown>;
}

function createDetectedObject(label: string) {
  return new DetectedObject(
    label,
    null,
    new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(1, 1)),
    null
  );
}

describe('ObjectDetector Multi-Client API', () => {
  let detector: ObjectDetector;
  let mockBackend: {run: ReturnType<typeof vi.fn>};
  let options: WorldOptions;
  let depthMesh: THREE.Mesh;

  const imageData: ImageData = {
    width: 1,
    height: 1,
    data: new Uint8ClampedArray(4),
    colorSpace: 'srgb',
  };
  const snapshot = {
    base64: 'data:image/jpeg;base64,c25hcHNob3Q=',
    imageData,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getCameraParametersSnapshot).mockClear().mockReturnValue({
      clipFromView: new THREE.Matrix4(),
      viewFromClip: new THREE.Matrix4(),
      worldFromView: new THREE.Matrix4(),
      worldFromClip: new THREE.Matrix4(),
    });

    options = new WorldOptions();
    options.objects.enable();
    const ai = {} as unknown as AI;
    const aiOptions = {} as unknown as AIOptions;
    const deviceCamera = {} as unknown as XRDeviceCamera;
    depthMesh = new THREE.Mesh(new THREE.BoxGeometry());
    const depth = {
      depthMesh,
      options: {
        depthMesh: {
          updateFullResolutionGeometry: false,
        },
      },
    } as unknown as Depth;
    const camera = new THREE.PerspectiveCamera();
    const renderer = {
      xr: {
        getCamera: () => new THREE.PerspectiveCamera(),
      },
    } as unknown as THREE.WebGLRenderer;

    detector = new ObjectDetector();
    detector.init({
      options,
      ai,
      aiOptions,
      deviceCamera,
      depth,
      camera,
      renderer,
    });

    mockBackend = {
      run: vi
        .fn()
        .mockImplementation(async () => [createDetectedObject('chair')]),
    };
    vi.spyOn(
      detector as unknown as PrivateObjectDetector,
      'getOrCreateDetectorBackend'
    ).mockResolvedValue(mockBackend);
  });

  it('starts continuous detection for clients and caches results to detectedObjects', async () => {
    const client = {};
    detector.start(client);

    const promise = (detector as unknown as PrivateObjectDetector)
      .currentDetectionPromise;
    expect(promise).not.toBeNull();

    const results = await promise;
    expect(results?.map((obj) => obj.label)).toEqual(['chair']);
    expect(detector.detectedObjects.map((obj) => obj.label)).toEqual(['chair']);
    expect(detector.get().map((obj) => obj.label)).toEqual(['chair']);
    expect(
      (detector as unknown as PrivateObjectDetector).currentDetectionPromise
    ).toBeNull();

    detector.update();
    const promise2 = (detector as unknown as PrivateObjectDetector)
      .currentDetectionPromise;
    expect(promise2).not.toBeNull();
    await promise2;
  });

  it('respects pollingIntervalMs for continuous detection', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    options.objects.pollingIntervalMs = 100;

    detector.start({});
    await (detector as unknown as PrivateObjectDetector)
      .currentDetectionPromise;

    detector.update();
    expect(
      (detector as unknown as PrivateObjectDetector).currentDetectionPromise
    ).toBeNull();

    now = 1099;
    detector.update();
    expect(
      (detector as unknown as PrivateObjectDetector).currentDetectionPromise
    ).toBeNull();

    now = 1100;
    detector.update();
    const promise = (detector as unknown as PrivateObjectDetector)
      .currentDetectionPromise;
    expect(promise).not.toBeNull();
    await promise;
    expect(mockBackend.run).toHaveBeenCalledTimes(2);
  });

  it('stops continuous detection when all clients stop', async () => {
    const client1 = {};
    const client2 = {};

    detector.start(client1);
    detector.start(client2);

    const promise = (detector as unknown as PrivateObjectDetector)
      .currentDetectionPromise;
    expect(promise).not.toBeNull();
    await promise;

    detector.stop(client1);
    detector.update();
    expect(
      (detector as unknown as PrivateObjectDetector).currentDetectionPromise
    ).not.toBeNull();
    await (detector as unknown as PrivateObjectDetector)
      .currentDetectionPromise;

    detector.stop(client2);
    detector.update();
    expect(
      (detector as unknown as PrivateObjectDetector).currentDetectionPromise
    ).toBeNull();
  });

  it('returns the ongoing promise for concurrent runDetection calls when started', async () => {
    const client = {};
    detector.start(client);

    const continuousPromise = (detector as unknown as PrivateObjectDetector)
      .currentDetectionPromise;
    expect(continuousPromise).not.toBeNull();

    const runPromise = detector.runDetection();
    expect(runPromise).toBe(continuousPromise);

    await runPromise;
    expect(mockBackend.run).toHaveBeenCalledTimes(1);
  });

  it('shares a one-off run when no overrides are supplied', async () => {
    const first = detector.runDetection();

    expect(detector.runDetection()).toBe(first);
    expect(detector.runDetection({})).toBe(first);
    await first;
    expect(mockBackend.run).toHaveBeenCalledTimes(1);
  });

  it('uses a per-call backend and snapshot without changing the default', async () => {
    const results = await detector.runDetection({
      backend: 'mediapipe',
      snapshot,
    });

    expect(results.map((object) => object.label)).toEqual(['chair']);
    expect(
      (detector as unknown as PrivateObjectDetector).getOrCreateDetectorBackend
    ).toHaveBeenCalledWith('mediapipe', expect.any(Object));
    expect(mockBackend.run).toHaveBeenCalledWith(
      expect.any(THREE.Mesh),
      expect.any(Object),
      snapshot
    );
    expect(options.objects.backendConfig.activeBackend).toBe('gemini');
  });

  it('uses the configured backend for a snapshot-only request', async () => {
    await detector.runDetection({snapshot});

    expect(
      (detector as unknown as PrivateObjectDetector).getOrCreateDetectorBackend
    ).toHaveBeenCalledWith('gemini', expect.any(Object));
    expect(mockBackend.run.mock.calls[0][2]).toEqual(snapshot);
  });

  it('queues explicit requests in order while ordinary calls share the active run', async () => {
    const pending = Promise.withResolvers<DetectedObject<unknown>[]>();
    mockBackend.run.mockReturnValueOnce(pending.promise);
    const first = detector.runDetection();
    await Promise.resolve();

    const second = detector.runDetection({
      backend: 'mediapipe',
      snapshot,
    });
    const thirdSnapshot = {base64: 'data:image/jpeg;base64,dGhpcmQ='};
    const third = detector.runDetection({
      backend: 'gemini',
      snapshot: thirdSnapshot,
    });

    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
    expect(detector.runDetection()).toBe(first);
    detector.update();
    expect(mockBackend.run).toHaveBeenCalledTimes(1);

    pending.resolve([createDetectedObject('first')]);
    await first;
    await second;
    await third;

    const factory = vi.mocked(
      (detector as unknown as PrivateObjectDetector).getOrCreateDetectorBackend
    );
    expect(factory.mock.calls.map(([backend]) => backend)).toEqual([
      'gemini',
      'mediapipe',
      'gemini',
    ]);
    expect(mockBackend.run.mock.calls.map((call) => call[2])).toEqual([
      undefined,
      snapshot,
      thirdSnapshot,
    ]);
    expect(options.objects.backendConfig.activeBackend).toBe('gemini');
  });

  it('continues queued requests after an earlier run rejects', async () => {
    const pending = Promise.withResolvers<DetectedObject<unknown>[]>();
    mockBackend.run.mockReturnValueOnce(pending.promise);
    const first = detector.runDetection();
    const firstFailure = expect(first).rejects.toThrow('first failed');
    const second = detector.runDetection({backend: 'mediapipe'});

    pending.reject(new Error('first failed'));

    await firstFailure;
    await expect(second).resolves.toHaveLength(1);
    await detector.runDetection();
    expect(mockBackend.run).toHaveBeenCalledTimes(3);
  });

  it('does not let continuous detection overtake a queued request', async () => {
    const pending = Promise.withResolvers<DetectedObject<unknown>[]>();
    mockBackend.run.mockReturnValueOnce(pending.promise);
    const first = detector.runDetection();
    const resumed = first.then(() => {
      detector.start({});
      detector.update();
    });
    const second = detector.runDetection({backend: 'mediapipe'});

    pending.resolve([]);
    await resumed;
    await second;

    const factory = vi.mocked(
      (detector as unknown as PrivateObjectDetector).getOrCreateDetectorBackend
    );
    expect(factory.mock.calls.map(([backend]) => backend)).toEqual([
      'gemini',
      'mediapipe',
    ]);
  });

  it('preserves the submitted frame pose and depth while a snapshot waits', async () => {
    const pending = Promise.withResolvers<DetectedObject<unknown>[]>();
    mockBackend.run.mockReturnValueOnce(pending.promise);
    const first = detector.runDetection();
    await Promise.resolve();

    const cameraSnapshot = {
      clipFromView: new THREE.Matrix4(),
      viewFromClip: new THREE.Matrix4(),
      worldFromView: new THREE.Matrix4().makeTranslation(1, 2, 3),
      worldFromClip: new THREE.Matrix4(),
    };
    vi.mocked(getCameraParametersSnapshot).mockReturnValueOnce(cameraSnapshot);
    const capturedGeometry = depthMesh.geometry.clone();
    vi.spyOn(depthMesh.geometry, 'clone').mockReturnValueOnce(capturedGeometry);
    const disposeGeometry = vi.spyOn(capturedGeometry, 'dispose');
    const second = detector.runDetection({snapshot});

    depthMesh.position.set(10, 20, 30);
    depthMesh.geometry.translate(10, 20, 30);
    pending.resolve([]);
    await first;
    await second;

    const [frozenMesh, frozenCamera] = mockBackend.run.mock.calls[1];
    expect(frozenCamera).toBe(cameraSnapshot);
    expect(frozenMesh.position).toEqual(new THREE.Vector3());
    expect(frozenMesh.geometry).toBe(capturedGeometry);
    expect(capturedGeometry.boundingBox?.max.x).toBe(0.5);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
  });

  it('captures request settings before callers change them while queued', async () => {
    const pending = Promise.withResolvers<DetectedObject<unknown>[]>();
    mockBackend.run.mockReturnValueOnce(pending.promise);
    const first = detector.runDetection();
    const submittedSnapshot = {...snapshot};
    const second = detector.runDetection({snapshot: submittedSnapshot});

    submittedSnapshot.base64 = 'a later frame';
    options.objects.backendConfig.activeBackend = 'mediapipe';
    pending.resolve([]);
    await first;
    await second;

    expect(
      (detector as unknown as PrivateObjectDetector).getOrCreateDetectorBackend
    ).toHaveBeenLastCalledWith('gemini', expect.any(Object));
    expect(mockBackend.run.mock.calls[1][2]).toEqual(snapshot);
    expect(options.objects.backendConfig.activeBackend).toBe('mediapipe');
  });

  it('does not re-ground a queued snapshot if its original camera pose was unavailable', async () => {
    const pending = Promise.withResolvers<DetectedObject<unknown>[]>();
    mockBackend.run.mockReturnValueOnce(pending.promise);
    const first = detector.runDetection();
    vi.mocked(getCameraParametersSnapshot).mockReturnValueOnce(null);
    const second = detector.runDetection({snapshot});

    pending.resolve([]);
    await first;
    await expect(second).resolves.toEqual([]);
    expect(mockBackend.run).toHaveBeenCalledTimes(1);
    expect(getCameraParametersSnapshot).toHaveBeenCalledTimes(2);
  });

  it('does not change continuous detection defaults after an explicit request', async () => {
    detector.start({});
    await detector.runDetection();
    await detector.runDetection({backend: 'mediapipe'});

    detector.update();
    await detector.runDetection();

    const factory = vi.mocked(
      (detector as unknown as PrivateObjectDetector).getOrCreateDetectorBackend
    );
    expect(factory.mock.calls.map(([backend]) => backend)).toEqual([
      'gemini',
      'mediapipe',
      'gemini',
    ]);
    expect(detector.detectedObjects).toHaveLength(1);
  });

  it.each([
    {backend: 'gemini', snapshot: {imageData}, field: 'base64'},
    {
      backend: 'mediapipe',
      snapshot: {base64: snapshot.base64},
      field: 'imageData',
    },
    {backend: 'gemini', snapshot: {}, field: 'base64'},
  ] as const)(
    'rejects a $backend snapshot missing $field rather than capturing another frame',
    async ({backend, snapshot, field}) => {
      await expect(detector.runDetection({backend, snapshot})).rejects.toThrow(
        field
      );

      expect(mockBackend.run).not.toHaveBeenCalled();
      expect(getCameraParametersSnapshot).not.toHaveBeenCalled();
      await expect(detector.runDetection()).resolves.toHaveLength(1);
    }
  );

  it('keeps simulator ground truth authoritative when it is installed', async () => {
    const source = {detect: vi.fn().mockReturnValue([])};
    detector.setSimulatorSource(source);

    await detector.runDetection({backend: 'mediapipe', snapshot});

    expect(source.detect).toHaveBeenCalledTimes(1);
    expect(mockBackend.run).not.toHaveBeenCalled();
    expect(getCameraParametersSnapshot).not.toHaveBeenCalled();
  });

  it('rejects unsupported per-call backend names', async () => {
    await expect(
      // @ts-expect-error Exercise input validation for JavaScript callers.
      detector.runDetection({backend: 'unsupported'})
    ).rejects.toThrow("backend 'unsupported' is not supported");
    expect(mockBackend.run).not.toHaveBeenCalled();
  });

  it('releases a supplied frame when its backend rejects and allows another request', async () => {
    const capturedGeometry = depthMesh.geometry.clone();
    vi.spyOn(depthMesh.geometry, 'clone').mockReturnValueOnce(capturedGeometry);
    const disposeGeometry = vi.spyOn(capturedGeometry, 'dispose');
    mockBackend.run.mockRejectedValueOnce(new Error('backend failed'));
    const first = detector.runDetection({snapshot});
    const firstFailure = expect(first).rejects.toThrow('backend failed');
    const second = detector.runDetection({backend: 'mediapipe'});

    await firstFailure;
    await expect(second).resolves.toHaveLength(1);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
  });

  it('does not capture another frame for requests made after disposal', async () => {
    detector.dispose();

    await expect(detector.runDetection({snapshot})).rejects.toThrow('disposed');
    expect(getCameraParametersSnapshot).not.toHaveBeenCalled();
    expect(mockBackend.run).not.toHaveBeenCalled();
  });

  it('releases queued frame resources and rejects the request after disposal', async () => {
    const pending = Promise.withResolvers<DetectedObject<unknown>[]>();
    mockBackend.run.mockReturnValueOnce(pending.promise);
    const first = detector.runDetection();
    await Promise.resolve();

    const capturedGeometry = depthMesh.geometry.clone();
    vi.spyOn(depthMesh.geometry, 'clone').mockReturnValueOnce(capturedGeometry);
    const disposeGeometry = vi.spyOn(capturedGeometry, 'dispose');
    const second = detector.runDetection({snapshot});
    const secondFailure = expect(second).rejects.toThrow('disposed');

    detector.dispose();
    pending.resolve([]);
    await first;
    await secondFailure;

    expect(mockBackend.run).toHaveBeenCalledTimes(1);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
  });

  it('disposes temporary depth mesh snapshots after detection', async () => {
    const geometryDispose = vi.fn();
    const materialDispose = vi.fn();

    mockBackend.run.mockImplementation(
      async (depthMeshSnapshot: THREE.Mesh) => {
        vi.spyOn(depthMeshSnapshot.geometry, 'dispose').mockImplementation(
          geometryDispose
        );
        const material = depthMeshSnapshot.material as THREE.Material;
        vi.spyOn(material, 'dispose').mockImplementation(materialDispose);
        return [];
      }
    );

    await detector.runDetection();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('clears public results, tracked objects, and scene children', async () => {
    detector.start({});
    await (detector as unknown as PrivateObjectDetector)
      .currentDetectionPromise;
    expect(detector.detectedObjects).toHaveLength(1);
    expect(detector.get()).toHaveLength(1);
    expect(detector.children).toHaveLength(1);

    detector.clear();

    expect(detector.detectedObjects).toEqual([]);
    expect(detector.get()).toEqual([]);
    expect(detector.children).toHaveLength(0);
  });
});
