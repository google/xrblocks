import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Depth} from '../../depth/Depth';
import {WorldOptions} from '../WorldOptions';

import {DetectedFace} from './DetectedFace';
import {FaceRecognizer} from './FaceRecognizer';

vi.mock('../../camera/CameraUtils', () => ({
  getCameraParametersSnapshot: vi.fn().mockReturnValue({}),
}));

interface PrivateFaceRecognizer {
  currentDetectionPromise: Promise<DetectedFace[]> | null;
  getOrCreateBackend: (
    activeBackend: string,
    context: unknown
  ) => Promise<unknown>;
}

function createDetectedFace(faceId: number) {
  return new DetectedFace(
    faceId,
    [],
    new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(1, 1))
  );
}

describe('FaceRecognizer Multi-Client API', () => {
  let recognizer: FaceRecognizer;
  let mockBackend: {run: ReturnType<typeof vi.fn>};
  let options: WorldOptions;

  beforeEach(() => {
    vi.restoreAllMocks();

    options = new WorldOptions();
    options.faces.enable();
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

    recognizer = new FaceRecognizer();
    recognizer.init({
      options,
      deviceCamera,
      depth,
      camera,
      renderer,
    });

    mockBackend = {
      run: vi.fn().mockResolvedValue([createDetectedFace(1)]),
    };
    vi.spyOn(
      recognizer as unknown as PrivateFaceRecognizer,
      'getOrCreateBackend'
    ).mockResolvedValue(mockBackend);
  });

  it('starts continuous detection for clients and caches results to detectedFaces', async () => {
    const client = {};
    recognizer.start(client);

    const promise = (recognizer as unknown as PrivateFaceRecognizer)
      .currentDetectionPromise;
    expect(promise).not.toBeNull();

    const results = await promise;
    expect(results?.map((face) => face.faceId)).toEqual([1]);
    expect(recognizer.detectedFaces.map((face) => face.faceId)).toEqual([1]);
    expect(
      (recognizer as unknown as PrivateFaceRecognizer).currentDetectionPromise
    ).toBeNull();

    recognizer.update();
    const promise2 = (recognizer as unknown as PrivateFaceRecognizer)
      .currentDetectionPromise;
    expect(promise2).not.toBeNull();
    await promise2;
  });

  it('respects pollingIntervalMs for continuous detection', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    options.faces.pollingIntervalMs = 100;

    recognizer.start({});
    await (recognizer as unknown as PrivateFaceRecognizer)
      .currentDetectionPromise;

    recognizer.update();
    expect(
      (recognizer as unknown as PrivateFaceRecognizer).currentDetectionPromise
    ).toBeNull();

    now = 1099;
    recognizer.update();
    expect(
      (recognizer as unknown as PrivateFaceRecognizer).currentDetectionPromise
    ).toBeNull();

    now = 1100;
    recognizer.update();
    const promise = (recognizer as unknown as PrivateFaceRecognizer)
      .currentDetectionPromise;
    expect(promise).not.toBeNull();
    await promise;
    expect(mockBackend.run).toHaveBeenCalledTimes(2);
  });

  it('stops continuous detection when all clients stop', async () => {
    const client1 = {};
    const client2 = {};

    recognizer.start(client1);
    recognizer.start(client2);

    const promise = (recognizer as unknown as PrivateFaceRecognizer)
      .currentDetectionPromise;
    expect(promise).not.toBeNull();
    await promise;

    recognizer.stop(client1);
    recognizer.update();
    expect(
      (recognizer as unknown as PrivateFaceRecognizer).currentDetectionPromise
    ).not.toBeNull();
    await (recognizer as unknown as PrivateFaceRecognizer)
      .currentDetectionPromise;

    recognizer.stop(client2);
    recognizer.update();
    expect(
      (recognizer as unknown as PrivateFaceRecognizer).currentDetectionPromise
    ).toBeNull();
  });

  it('returns the ongoing promise for concurrent runDetection calls when started', async () => {
    const client = {};
    recognizer.start(client);

    const continuousPromise = (recognizer as unknown as PrivateFaceRecognizer)
      .currentDetectionPromise;
    expect(continuousPromise).not.toBeNull();

    const runPromise = recognizer.runDetection();
    expect(runPromise).toBe(continuousPromise);

    await runPromise;
    expect(mockBackend.run).toHaveBeenCalledTimes(1);
  });

  it('supports one-off runs when not started, and reuses the ongoing promise', async () => {
    const promise1 = recognizer.runDetection();
    expect(promise1).not.toBeNull();
    expect(
      (recognizer as unknown as PrivateFaceRecognizer).currentDetectionPromise
    ).toBe(promise1);

    const promise2 = recognizer.runDetection();
    expect(promise2).toBe(promise1);

    const results = await promise1;
    expect(results.map((face) => face.faceId)).toEqual([1]);
    expect(recognizer.detectedFaces).toEqual([]);
    expect(mockBackend.run).toHaveBeenCalledTimes(1);
    expect(
      (recognizer as unknown as PrivateFaceRecognizer).currentDetectionPromise
    ).toBeNull();
  });

  it('disposes cached depth mesh snapshots when disposed', async () => {
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

    await recognizer.runDetection();
    recognizer.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('reuses an in-flight one-off detection when a client starts', async () => {
    const promise = recognizer.runDetection();

    recognizer.start({});

    expect(
      (recognizer as unknown as PrivateFaceRecognizer).currentDetectionPromise
    ).toBe(promise);

    await promise;
    expect(mockBackend.run).toHaveBeenCalledTimes(1);
  });

  it('clear removes scene children without resetting detectedFaces', async () => {
    recognizer.start({});
    await (recognizer as unknown as PrivateFaceRecognizer)
      .currentDetectionPromise;
    recognizer.add(new THREE.Object3D());
    expect(recognizer.detectedFaces).toHaveLength(1);
    expect(recognizer.children).toHaveLength(1);

    recognizer.clear();

    expect(recognizer.detectedFaces).toHaveLength(1);
    expect(recognizer.children).toHaveLength(0);
  });
});
