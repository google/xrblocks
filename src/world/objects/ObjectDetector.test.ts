import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Depth} from '../../depth/Depth';
import {WorldOptions} from '../WorldOptions';

import {DetectedObject} from './DetectedObject';
import {ObjectDetector} from './ObjectDetector';

vi.mock('../../camera/CameraUtils', () => ({
  getCameraParametersSnapshot: vi.fn().mockReturnValue({}),
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

  beforeEach(() => {
    vi.restoreAllMocks();

    options = new WorldOptions();
    options.objects.enable();
    const ai = {} as unknown as AI;
    const aiOptions = {} as unknown as AIOptions;
    const deviceCamera = {} as unknown as XRDeviceCamera;
    const depth = {
      depthMesh: new THREE.Mesh(new THREE.BoxGeometry()),
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
      run: vi.fn().mockResolvedValue([createDetectedObject('chair')]),
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

  it('supports one-off runs when not started, and reuses the ongoing promise', async () => {
    const promise1 = detector.runDetection();
    expect(promise1).not.toBeNull();
    expect(
      (detector as unknown as PrivateObjectDetector).currentDetectionPromise
    ).toBe(promise1);

    const promise2 = detector.runDetection();
    expect(promise2).toBe(promise1);

    const results = await promise1;
    expect(results.map((obj) => obj.label)).toEqual(['chair']);
    expect(detector.detectedObjects).toEqual([]);
    expect(detector.get().map((obj) => obj.label)).toEqual(['chair']);
    expect(mockBackend.run).toHaveBeenCalledTimes(1);
    expect(
      (detector as unknown as PrivateObjectDetector).currentDetectionPromise
    ).toBeNull();
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

  it('reuses an in-flight one-off detection when a client starts', async () => {
    const promise = detector.runDetection();

    detector.start({});

    expect(
      (detector as unknown as PrivateObjectDetector).currentDetectionPromise
    ).toBe(promise);

    await promise;
    expect(mockBackend.run).toHaveBeenCalledTimes(1);
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
