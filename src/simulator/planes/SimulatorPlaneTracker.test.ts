import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {Options} from '../../core/Options';
import {RendererHolder} from '../../core/RendererTypes';
import {Registry} from '../../core/components/Registry';
import {ScriptsManager} from '../../core/components/ScriptsManager';
import {WaitFrame} from '../../core/components/WaitFrame';
import {Depth} from '../../depth/Depth';
import {HAND_JOINT_NAMES} from '../../input/components/HandJointNames';
import {Input} from '../../input/Input';
import {Interaction} from '../../interaction/Interaction';
import {World} from '../../world/World';
import {PlaneDetector} from '../../world/planes/PlaneDetector';
import type {SimulatorPlane} from '../../world/planes/SimulatorPlane';
import {Simulator} from '../Simulator';
import {SetSimulatorPlaneTrackingModeEvent} from '../events/SimulatorPlaneTrackingEvents';
import {SimulatorSettingsPanel} from '../internal/interface/ui/SimulatorSettingsPanel';
import {SimulatorNavMesh} from '../internal/navmesh/SimulatorNavMesh';
import {
  SimulatorDepth,
  type SimulatorDepthFrame,
} from '../scene/SimulatorDepth';
import {SimulatorEnvironmentManager} from '../scene/SimulatorEnvironmentManager';
import {SimulatorObjectsManager} from '../scene/SimulatorObjects';
import {SimulatorScene} from '../scene/SimulatorScene';
import {SimulatorWorld} from '../scene/SimulatorWorld';
import {
  SimulatorOptions,
  type SimulatorPlaneTrackingMode,
} from '../SimulatorOptions';

import {
  SimulatorPlaneTracker,
  type PlaneTrackingWorkerLike,
} from './SimulatorPlaneTracker';
import {createPlaneTrackingWorkerHandler} from './SimulatorPlaneTrackingWorker';
import type {
  PlaneTrackingWorkerRequest,
  PlaneTrackingWorkerResponse,
  TrackedPlaneSnapshot,
} from './SimulatorPlaneTrackingTypes';

class FakePlaneTrackingWorker implements PlaneTrackingWorkerLike {
  onmessage:
    | ((event: MessageEvent<PlaneTrackingWorkerResponse>) => void)
    | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: Array<{
    message: PlaneTrackingWorkerRequest;
    transfer?: Transferable[];
  }> = [];
  terminated = false;

  postMessage(
    message: PlaneTrackingWorkerRequest,
    transfer?: Transferable[]
  ): void {
    this.posted.push({message, transfer});
  }

  emit(response: PlaneTrackingWorkerResponse): void {
    this.onmessage?.({
      data: response,
    } as MessageEvent<PlaneTrackingWorkerResponse>);
  }

  emitError(message: string): void {
    this.onerror?.({message} as ErrorEvent);
  }

  terminate(): void {
    this.terminated = true;
  }
}

function makeDepthFrame(
  overrides: Partial<SimulatorDepthFrame> = {}
): SimulatorDepthFrame {
  const width = overrides.width ?? 4;
  const height = overrides.height ?? 4;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
  return {
    width,
    height,
    depthBuffer: new Float32Array(width * height).fill(2.0),
    projectionMatrix: new Float32Array(camera.projectionMatrix.elements),
    cameraPosition: new THREE.Vector3(0, 1.5, 0),
    cameraQuaternion: new THREE.Quaternion(),
    timestampMs: 1000,
    ...overrides,
  };
}

function makePlaneSnapshot(
  overrides: Partial<TrackedPlaneSnapshot> = {}
): TrackedPlaneSnapshot {
  return {
    id: 'plane-1',
    type: 'horizontal',
    label: 'floor',
    area: 4,
    position: [0, 0, -2],
    quaternion: [0, 0, 0, 1],
    extents: [2, 2],
    polygon: [-1, -1, 1, -1, 1, 1, -1, 1],
    lastChangedTime: 100,
    ...overrides,
  };
}

function manifestUrl(manifest: Record<string, unknown>): string {
  return `data:application/json,${encodeURIComponent(JSON.stringify(manifest))}`;
}

function makeRoomGroup(): THREE.Group {
  const group = new THREE.Group();
  group.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
  );
  return group;
}

function makeHandGroup(): THREE.Group {
  const group = new THREE.Group();
  for (const jointName of HAND_JOINT_NAMES) {
    const joint = new THREE.Object3D();
    joint.name = jointName;
    group.add(joint);
  }
  return group;
}

async function createEnvironmentFixture(
  mode: SimulatorPlaneTrackingMode = 'auto',
  planesEnabled = true
) {
  const renderer = {
    isWebGLRenderer: true,
    extensions: {has: () => false},
    shadowMap: {enabled: false, type: THREE.BasicShadowMap},
    xr: {getReferenceSpace: () => null},
  };
  const options = new Options();
  options.simulator.planeTracking.mode = mode;
  options.world.enabled = planesEnabled;
  options.world.planes.enabled = planesEnabled;
  options.world.planes.showDebugVisualizations = true;

  const world = new World();
  const timer = new THREE.Timer();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
  await world.init({
    options: options.world,
    camera,
    timer,
    waitFrame: new WaitFrame(),
  });
  world.planes?.init({
    options: options.world,
    rendererHolder: new RendererHolder(renderer as never),
  });

  const simulatorWorld = new SimulatorWorld();
  await simulatorWorld.init(options, world);

  const scene = new SimulatorScene();
  const objects = new SimulatorObjectsManager();
  objects.init(renderer as never);
  const navMesh = new SimulatorNavMesh();
  const environmentChanges: number[] = [];
  const manager = new SimulatorEnvironmentManager(
    options.simulator,
    renderer as never,
    scene,
    objects,
    navMesh,
    simulatorWorld,
    undefined,
    () => {},
    (generation) => environmentChanges.push(generation)
  );

  return {
    options,
    world,
    simulatorWorld,
    manager,
    scene,
    environmentChanges,
    dispose() {
      manager.dispose();
      world.dispose();
      timer.dispose();
    },
  };
}

afterEach(() => {
  Depth.instance?.dispose();
  Depth.instance = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('SimulatorPlaneTracker', () => {
  it('spawns lazily, gates in-flight frames, transfers depth copies, and resets cleanly', () => {
    const workers: FakePlaneTrackingWorker[] = [];
    const received: Array<{
      planes: SimulatorPlane[];
      generation: number;
    }> = [];

    const tracker = new SimulatorPlaneTracker({
      updateIntervalMs: 200,
      trackerConfig: {maxDepthMeters: 5, maxTrackedPlanes: 12},
      workerFactory: () => {
        const worker = new FakePlaneTrackingWorker();
        workers.push(worker);
        return worker;
      },
      onPlanesUpdated: (planes, generation) => {
        received.push({planes, generation});
      },
    });

    // Inactive tracker does not spawn a worker.
    expect(tracker.submitDepthFrame(makeDepthFrame())).toBe(false);
    expect(workers).toHaveLength(0);

    tracker.setActive(true);
    expect(workers).toHaveLength(0);

    const sourceFrame = makeDepthFrame({timestampMs: 1000});
    expect(tracker.submitDepthFrame(sourceFrame)).toBe(true);
    expect(workers).toHaveLength(1);
    expect(tracker.isInFlight).toBe(true);

    const worker = workers[0];
    expect(worker.posted[0].message).toEqual({
      type: 'configure',
      config: {maxDepthMeters: 5, maxTrackedPlanes: 12},
    });
    const processPost = worker.posted[1];
    expect(processPost.message.type).toBe('processDepth');
    expect(processPost.transfer).toHaveLength(2);
    // Caller's buffer must not be detached or aliased by the transferred buffer.
    expect(sourceFrame.depthBuffer.byteLength).toBe(16 * 4);
    if (processPost.message.type === 'processDepth') {
      expect(processPost.message.depthBuffer.buffer).not.toBe(
        sourceFrame.depthBuffer.buffer
      );
    }

    // While in-flight, new frames are dropped without queueing.
    expect(
      tracker.submitDepthFrame(
        makeDepthFrame({
          timestampMs: 1500,
          cameraPosition: new THREE.Vector3(1, 1.5, 0),
        })
      )
    ).toBe(false);
    expect(worker.posted).toHaveLength(2);

    // Reply clears in-flight and publishes converted planes.
    const firstReqId =
      processPost.message.type === 'processDepth'
        ? processPost.message.requestId
        : -1;
    worker.emit({
      type: 'planes',
      requestId: firstReqId,
      sceneGeneration: 0,
      planes: [makePlaneSnapshot({id: 'p1', lastChangedTime: 10})],
    });
    expect(tracker.isInFlight).toBe(false);
    expect(received).toHaveLength(1);
    expect(received[0].generation).toBe(0);
    expect(received[0].planes).toHaveLength(1);
    expect(received[0].planes[0].lastChangedTime).toBe(10);

    // Throttled when elapsed < updateIntervalMs even if camera moved.
    expect(
      tracker.submitDepthFrame(
        makeDepthFrame({
          timestampMs: 1100,
          cameraPosition: new THREE.Vector3(1, 1.5, 0),
        })
      )
    ).toBe(false);

    // Skipped when elapsed >= updateIntervalMs but camera barely moved (< idle refresh).
    expect(
      tracker.submitDepthFrame(
        makeDepthFrame({
          timestampMs: 1300,
          cameraPosition: new THREE.Vector3(0.001, 1.5, 0),
        })
      )
    ).toBe(false);

    // Accepted once camera translates past threshold after interval.
    expect(
      tracker.submitDepthFrame(
        makeDepthFrame({
          timestampMs: 1300,
          cameraPosition: new THREE.Vector3(0.2, 1.5, 0),
        })
      )
    ).toBe(true);
    const secondReq = worker.posted[2].message;
    const secondReqId =
      secondReq.type === 'processDepth' ? secondReq.requestId : -1;

    // Scene reset advances generation; stale reply from previous generation is discarded.
    const nextGen = tracker.reset();
    expect(nextGen).toBe(1);
    expect(worker.posted[3].message).toEqual({
      type: 'reset',
      sceneGeneration: 1,
    });
    worker.emit({
      type: 'planes',
      requestId: secondReqId,
      sceneGeneration: 0,
      planes: [makePlaneSnapshot({id: 'stale-plane'})],
    });
    expect(received).toHaveLength(1);

    // Dispose sends dispose message and terminates the worker.
    tracker.dispose();
    expect(worker.terminated).toBe(true);
    expect(tracker.hasWorker).toBe(false);
    expect(tracker.submitDepthFrame(makeDepthFrame({timestampMs: 5000}))).toBe(
      false
    );
  });

  it('reuses persistent SimulatorPlane instances by worker id, prunes retired ids, and clears on reset', () => {
    const worker = new FakePlaneTrackingWorker();
    const batches: SimulatorPlane[][] = [];
    const tracker = new SimulatorPlaneTracker({
      updateIntervalMs: 0,
      workerFactory: () => worker,
      onPlanesUpdated: (planes) => batches.push(planes),
    });
    tracker.setActive(true);

    const submitAndEmit = (
      timestampMs: number,
      camX: number,
      sceneGeneration: number,
      snapshots: TrackedPlaneSnapshot[]
    ) => {
      expect(
        tracker.submitDepthFrame(
          makeDepthFrame({
            timestampMs,
            cameraPosition: new THREE.Vector3(camX, 1.5, 0),
          })
        )
      ).toBe(true);
      const last = worker.posted[worker.posted.length - 1].message;
      const requestId = last.type === 'processDepth' ? last.requestId : -1;
      worker.emit({
        type: 'planes',
        requestId,
        sceneGeneration,
        planes: snapshots,
      });
    };

    submitAndEmit(100, 0, 0, [
      makePlaneSnapshot({id: 'p1', position: [0, 0, -2], lastChangedTime: 10}),
      makePlaneSnapshot({
        id: 'p2',
        type: 'vertical',
        label: 'wall',
        position: [0, 1, -3],
        lastChangedTime: 10,
      }),
    ]);
    const plane1 = batches[0][0];
    const plane2 = batches[0][1];
    const initialPolygon1 = plane1.polygon;

    // Unchanged lastChangedTime reuses both the SimulatorPlane instance and its polygon array,
    // while pruning retired id 'p2'.
    submitAndEmit(200, 1, 0, [
      makePlaneSnapshot({
        id: 'p1',
        position: [0.1, 0, -2],
        lastChangedTime: 10,
      }),
    ]);
    expect(batches[1]).toHaveLength(1);
    expect(batches[1][0]).toBe(plane1);
    expect(plane1.position.x).toBeCloseTo(0.1);
    expect(plane1.polygon).toBe(initialPolygon1);

    // Changed lastChangedTime mutates the same SimulatorPlane with a new polygon;
    // re-appearing retired id 'p2' allocates a fresh SimulatorPlane instance.
    submitAndEmit(300, 2, 0, [
      makePlaneSnapshot({
        id: 'p1',
        area: 9,
        polygon: [-2, -2, 2, -2, 2, 2, -2, 2],
        lastChangedTime: 25,
      }),
      makePlaneSnapshot({
        id: 'p2',
        type: 'vertical',
        label: 'wall',
        lastChangedTime: 25,
      }),
    ]);
    expect(batches[2][0]).toBe(plane1);
    expect(plane1.area).toBe(9);
    expect(plane1.lastChangedTime).toBe(25);
    expect(plane1.polygon).not.toBe(initialPolygon1);
    expect(plane1.polygon[0].x).toBe(-2);
    expect(batches[2][1]).not.toBe(plane2);

    // Reset clears cached instances so the next generation creates fresh SimulatorPlane objects.
    const nextGen = tracker.reset();
    submitAndEmit(400, 3, nextGen, [
      makePlaneSnapshot({id: 'p1', lastChangedTime: 30}),
    ]);
    expect(batches[3][0]).not.toBe(plane1);

    tracker.dispose();
  });

  it('degrades safely when Web Workers are unavailable', () => {
    vi.stubGlobal('Worker', undefined);
    const tracker = new SimulatorPlaneTracker();
    tracker.setActive(true);
    expect(tracker.isSupported()).toBe(false);
    expect(tracker.wantsDepthFrame(new THREE.PerspectiveCamera())).toBe(false);
    expect(tracker.submitDepthFrame(makeDepthFrame())).toBe(false);
    tracker.dispose();
  });

  it('suppresses updates while paused and recovers from worker errors', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const worker = new FakePlaneTrackingWorker();
    const updates: number[] = [];
    const tracker = new SimulatorPlaneTracker({
      updateIntervalMs: 0,
      workerFactory: () => worker,
      onPlanesUpdated: (planes) => updates.push(planes.length),
    });
    tracker.setActive(true);

    expect(tracker.submitDepthFrame(makeDepthFrame({timestampMs: 100}))).toBe(
      true
    );
    const firstReq = worker.posted[1].message;
    const firstId = firstReq.type === 'processDepth' ? firstReq.requestId : -1;

    tracker.pause();
    worker.emit({
      type: 'planes',
      requestId: firstId,
      sceneGeneration: 0,
      planes: [makePlaneSnapshot()],
    });
    expect(updates).toEqual([]);
    expect(tracker.isInFlight).toBe(false);

    tracker.resume();
    expect(
      tracker.submitDepthFrame(
        makeDepthFrame({
          timestampMs: 200,
          cameraPosition: new THREE.Vector3(1, 1.5, 0),
        })
      )
    ).toBe(true);
    const secondReq = worker.posted[2].message;
    const secondId =
      secondReq.type === 'processDepth' ? secondReq.requestId : -1;

    // Structured worker error clears inFlight so subsequent frames still work.
    worker.emit({
      type: 'error',
      requestId: secondId,
      sceneGeneration: 0,
      message: 'transient error',
    });
    expect(tracker.isInFlight).toBe(false);
    expect(warnSpy).toHaveBeenCalled();

    expect(
      tracker.submitDepthFrame(
        makeDepthFrame({
          timestampMs: 300,
          cameraPosition: new THREE.Vector3(2, 1.5, 0),
        })
      )
    ).toBe(true);
    tracker.dispose();
  });
});

describe('PlaneDetector incremental simulator reconciliation', () => {
  it('reuses DetectedPlane meshes by SimulatorPlane reference, avoids redundant geometry rebuilds, and removes retired planes', () => {
    const detector = new PlaneDetector();
    const options = new Options();
    options.world.planes.showDebugVisualizations = true;
    detector.init({
      options: options.world,
      rendererHolder: new RendererHolder({
        xr: {getReferenceSpace: () => null},
      } as never),
    });

    try {
      const planeA: SimulatorPlane = {
        type: 'horizontal',
        label: 'floor',
        area: 4,
        position: new THREE.Vector3(0, 0, -2),
        quaternion: new THREE.Quaternion(),
        polygon: [
          new THREE.Vector2(-1, -1),
          new THREE.Vector2(1, -1),
          new THREE.Vector2(1, 1),
          new THREE.Vector2(-1, 1),
        ],
        lastChangedTime: 100,
      };
      const planeB: SimulatorPlane = {
        type: 'vertical',
        label: 'wall',
        area: 3,
        position: new THREE.Vector3(0, 1, -3),
        quaternion: new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          Math.PI / 2
        ),
        polygon: [
          new THREE.Vector2(-1, -1),
          new THREE.Vector2(1, -1),
          new THREE.Vector2(1, 1),
          new THREE.Vector2(-1, 1),
        ],
        lastChangedTime: 100,
      };

      detector.setSimulatorPlanes([planeA, planeB]);
      const initialPlanes = detector.get();
      expect(initialPlanes).toHaveLength(2);
      const meshA = initialPlanes.find((p) => p.simulatorPlane === planeA)!;
      const meshB = initialPlanes.find((p) => p.simulatorPlane === planeB)!;
      const initialGeoA = meshA.geometry;
      const disposedGeoA = vi.fn();
      initialGeoA.addEventListener('dispose', disposedGeoA);
      const disposedGeoB = vi.fn();
      meshB.geometry.addEventListener('dispose', disposedGeoB);

      // Same SimulatorPlane instance and lastChangedTime keeps mesh identity and geometry intact.
      planeA.position.set(0.1, 0, -2);
      detector.setSimulatorPlanes([planeA]);
      expect(detector.get()).toEqual([meshA]);
      expect(meshA.geometry).toBe(initialGeoA);
      expect(meshA.position.x).toBeCloseTo(0.1);
      expect(disposedGeoA).not.toHaveBeenCalled();
      expect(disposedGeoB).toHaveBeenCalledOnce();

      // Updated lastChangedTime on the same instance keeps mesh identity while rebuilding geometry.
      planeA.polygon = [
        new THREE.Vector2(-2, -2),
        new THREE.Vector2(2, -2),
        new THREE.Vector2(2, 2),
        new THREE.Vector2(-2, 2),
      ];
      planeA.lastChangedTime = 200;
      detector.setSimulatorPlanes([planeA]);
      expect(detector.get()).toEqual([meshA]);
      expect(meshA.geometry).not.toBe(initialGeoA);
      expect(disposedGeoA).toHaveBeenCalledOnce();

      // Clearing simulator planes restores WebXR mode cleanly.
      detector.clearSimulatorPlanes();
      expect(detector.get()).toEqual([]);
    } finally {
      detector.dispose();
    }
  });
});

function stubPlanesFetch(planes: unknown[]) {
  const originalFetch = globalThis.fetch;
  const planesRequests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('planes.json')) {
        planesRequests.push(url);
        return {
          ok: true,
          json: async () => ({planes}),
        } as Response;
      }
      return originalFetch(input, init);
    })
  );
  return planesRequests;
}

describe('SimulatorWorld and SimulatorEnvironmentManager plane tracking modes', () => {
  it('automatically falls back to realistic tracking when hardcoded planes are absent', async () => {
    vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation(
      (_url, loaded) => {
        loaded({scene: makeRoomGroup()} as GLTF);
      }
    );
    const planesRequests = stubPlanesFetch([
      {
        type: 'horizontal',
        label: 'floor',
        area: 6,
        position: {x: 0, y: 0, z: 0},
        quaternion: [0, 0, 0, 1],
        polygon: [
          {x: -1, y: -1},
          {x: 1, y: -1},
          {x: 1, y: 1},
          {x: -1, y: 1},
        ],
      },
    ]);

    const f = await createEnvironmentFixture('auto');
    try {
      // Environment WITH hardcoded planes stays on hardcoded planes in 'auto' mode.
      await f.manager.setEnvironment({
        manifestPath: manifestUrl({
          scenePath: 'https://example.com/room-with-planes.glb',
          scenePlanesPath: 'https://example.com/planes.json',
        }),
      });
      expect(planesRequests).toHaveLength(1);
      expect(f.simulatorWorld.hasHardcodedPlanes).toBe(true);
      expect(f.simulatorWorld.isRealisticPlaneTrackingActive).toBe(false);
      expect(f.world.planes?.get()).toHaveLength(1);
      expect(f.environmentChanges).toEqual([1]);

      // Environment WITHOUT scenePlanesPath activates realistic tracking automatically.
      await f.manager.setEnvironment({
        manifestPath: manifestUrl({
          scenePath: 'https://example.com/room-no-planes.glb',
        }),
      });
      expect(f.simulatorWorld.hasHardcodedPlanes).toBe(false);
      expect(f.simulatorWorld.isRealisticPlaneTrackingActive).toBe(true);
      expect(f.world.planes?.get()).toHaveLength(0);
      expect(f.environmentChanges).toEqual([1, 2]);

      // Tracked planes pushed from the worker appear in PlaneDetector.
      f.simulatorWorld.setTrackedPlanes([
        {
          type: 'horizontal',
          label: 'table',
          area: 1.2,
          position: new THREE.Vector3(0, 0.8, -1.5),
          quaternion: new THREE.Quaternion(),
          polygon: [
            new THREE.Vector2(-0.5, -0.5),
            new THREE.Vector2(0.5, -0.5),
            new THREE.Vector2(0.5, 0.5),
            new THREE.Vector2(-0.5, 0.5),
          ],
          lastChangedTime: 42,
        },
      ]);
      expect(f.world.planes?.get('table')).toHaveLength(1);
      const trackedMesh = f.world.planes!.get('table')[0];

      // Switching to 'realistic' (or re-selecting 'realistic') while already active
      // preserves tracked planes without wiping PlaneDetector.
      await f.simulatorWorld.setPlaneTrackingMode('realistic');
      expect(f.world.planes?.get('table')).toEqual([trackedMesh]);
      await f.simulatorWorld.setPlaneTrackingMode('realistic');
      expect(f.world.planes?.get('table')).toEqual([trackedMesh]);
      await f.simulatorWorld.setPlaneTrackingMode('auto');
      expect(f.world.planes?.get('table')).toEqual([trackedMesh]);

      // XR session suspend clears simulator planes and blocks tracked updates;
      // resume restores tracked simulator planes.
      f.simulatorWorld.suspendSimulatorSensing();
      expect(f.world.planes?.get()).toHaveLength(0);
      f.simulatorWorld.setTrackedPlanes([]);
      f.simulatorWorld.restoreSimulatorPlanes();
      expect(f.world.planes?.get('table')).toHaveLength(1);
    } finally {
      f.dispose();
    }
  });

  it('respects realistic and hardcoded modes and supports runtime switching', async () => {
    vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation(
      (_url, loaded) => {
        loaded({scene: makeRoomGroup()} as GLTF);
      }
    );
    const planesRequests = stubPlanesFetch([
      {
        type: 'horizontal',
        label: 'floor',
        area: 8,
        position: {x: 0, y: 0, z: 0},
        quaternion: [0, 0, 0, 1],
        polygon: [
          {x: -2, y: -2},
          {x: 2, y: -2},
          {x: 2, y: 2},
          {x: -2, y: 2},
        ],
      },
    ]);

    // Start in 'realistic' mode: skips fetching hardcoded planes even when manifest has scenePlanesPath.
    const f = await createEnvironmentFixture('realistic');
    try {
      await f.manager.setEnvironment({
        manifestPath: manifestUrl({
          scenePath: 'https://example.com/room.glb',
          scenePlanesPath: 'https://example.com/planes.json',
        }),
      });
      expect(planesRequests).toHaveLength(0);
      expect(f.simulatorWorld.isRealisticPlaneTrackingActive).toBe(true);
      expect(f.world.planes?.get()).toHaveLength(0);

      // Runtime switch to 'auto' lazily loads hardcoded planes and deactivates realistic mode.
      await f.simulatorWorld.setPlaneTrackingMode('auto');
      expect(planesRequests).toHaveLength(1);
      expect(f.simulatorWorld.hasHardcodedPlanes).toBe(true);
      expect(f.simulatorWorld.isRealisticPlaneTrackingActive).toBe(false);
      expect(f.world.planes?.get('floor')).toHaveLength(1);

      // Runtime switch to 'hardcoded' on a room without planes keeps realistic tracking off.
      await f.simulatorWorld.setPlaneTrackingMode('hardcoded');
      await f.manager.setEnvironment({
        manifestPath: manifestUrl({
          scenePath: 'https://example.com/no-planes.glb',
        }),
      });
      expect(f.simulatorWorld.isRealisticPlaneTrackingActive).toBe(false);
      expect(f.world.planes?.get()).toHaveLength(0);
    } finally {
      f.dispose();
    }
  });
});

describe('SimulatorDepth listener and overlay exclusion', () => {
  it('captures depth for listeners without Depth publication and hides excluded overlays', async () => {
    vi.stubGlobal('XRRigidTransform', undefined);
    const scene = new SimulatorScene();
    const room = new THREE.Mesh();
    const navMeshDebug = new THREE.Mesh();
    const leftHand = new THREE.Group();
    scene.add(room, navMeshDebug, leftHand);

    let navMeshVisibleDuringRender = true;
    let handVisibleDuringRender = true;
    let target: THREE.RenderTarget | null = null;
    const clearColor = new THREE.Color(0x000000);
    let clearAlpha = 1;
    let reads = 0;

    const renderer = {
      isWebGPURenderer: false,
      render() {
        navMeshVisibleDuringRender = navMeshDebug.visible;
        handVisibleDuringRender = leftHand.visible;
      },
      clear() {},
      getRenderTarget: () => target,
      setRenderTarget(value: THREE.RenderTarget | null) {
        target = value;
      },
      getClearColor: (out: THREE.Color) => out.copy(clearColor),
      getClearAlpha: () => clearAlpha,
      setClearColor(color: THREE.ColorRepresentation, alpha: number) {
        clearColor.set(color);
        clearAlpha = alpha;
      },
      getContext: () => ({PIXEL_PACK_BUFFER: 0x88eb, bindBuffer() {}}),
      readRenderTargetPixelsAsync(
        _rt: THREE.RenderTarget,
        _x: number,
        _y: number,
        width: number,
        height: number,
        output?: Float32Array
      ) {
        reads++;
        const pixels = output ?? new Float32Array(width * height);
        pixels.fill(2.5);
        return Promise.resolve(pixels);
      },
    };

    const rig = new THREE.Group();
    rig.position.set(1, 0, -2);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
    camera.position.set(0.5, 1.5, 0);
    rig.add(camera);

    const simulatorDepth = new SimulatorDepth(scene);
    simulatorDepth.depthWidth = 2;
    simulatorDepth.depthHeight = 2;
    simulatorDepth.maxDepthAgeMs = Infinity;
    await simulatorDepth.init(renderer as never, camera, undefined, {
      publishToDepth: false,
    });
    simulatorDepth.setExcludedObjects([navMeshDebug, leftHand]);

    const frames: SimulatorDepthFrame[] = [];
    simulatorDepth.setDepthFrameListener((frame) => frames.push(frame));

    try {
      simulatorDepth.update();
      await Promise.resolve();
      await Promise.resolve();

      expect(reads).toBe(1);
      expect(navMeshVisibleDuringRender).toBe(false);
      expect(handVisibleDuringRender).toBe(false);
      expect(navMeshDebug.visible).toBe(true);
      expect(leftHand.visible).toBe(true);

      expect(frames).toHaveLength(1);
      expect(frames[0].cameraPosition.x).toBeCloseTo(1.5);
      expect(frames[0].cameraPosition.y).toBeCloseTo(1.5);
      expect(frames[0].cameraPosition.z).toBeCloseTo(-2);
      expect(Array.from(frames[0].depthBuffer)).toEqual([2.5, 2.5, 2.5, 2.5]);

      // Moving an excluded hand does not invalidate depth cache.
      leftHand.position.x = 3;
      leftHand.updateMatrixWorld(true);
      simulatorDepth.update();
      expect(reads).toBe(1);

      // Explicit invalidateCache triggers a fresh capture on next update.
      simulatorDepth.invalidateCache();
      simulatorDepth.update();
      await Promise.resolve();
      await Promise.resolve();
      expect(reads).toBe(2);
    } finally {
      simulatorDepth.dispose();
    }
  });
});

describe('Plane tracking options, URL parameter, and settings panel', () => {
  it('parses ?simulatorPlaneTracking URL parameter and defaults to auto', () => {
    expect(new SimulatorOptions().planeTracking.mode).toBe('auto');

    window.history.replaceState({}, '', '/?simulatorPlaneTracking=realistic');
    expect(new Options().simulator.planeTracking.mode).toBe('realistic');

    window.history.replaceState({}, '', '/?simulatorPlaneTracking=invalid');
    expect(new Options().simulator.planeTracking.mode).toBe('auto');
  });

  it('shows the Plane Tracking dropdown only when available and dispatches mode changes', async () => {
    if (!customElements.get('xrblocks-simulator-settings')) {
      customElements.define(
        'xrblocks-simulator-settings',
        SimulatorSettingsPanel
      );
    }
    const panel = document.createElement(
      'xrblocks-simulator-settings'
    ) as SimulatorSettingsPanel;
    document.body.append(panel);
    try {
      await panel.updateComplete;
      const findSelect = () =>
        [...panel.shadowRoot!.querySelectorAll('.form-group')]
          .find((group) =>
            group
              .querySelector('label')
              ?.textContent?.includes('Plane Tracking')
          )
          ?.querySelector('select') as HTMLSelectElement | undefined;

      expect(findSelect()).toBeUndefined();

      panel.planeTrackingAvailable = true;
      panel.planeTrackingMode = 'auto';
      await panel.updateComplete;

      const select = findSelect();
      expect(select).toBeDefined();
      const events: SimulatorPlaneTrackingMode[] = [];
      panel.addEventListener(SetSimulatorPlaneTrackingModeEvent.type, (e) => {
        events.push((e as SetSimulatorPlaneTrackingModeEvent).mode);
      });

      select!.value = 'realistic';
      select!.dispatchEvent(new Event('change'));
      await panel.updateComplete;
      expect(panel.planeTrackingMode).toBe('realistic');
      expect(events).toEqual(['realistic']);
    } finally {
      panel.remove();
    }
  });
});

describe('Simulator realistic plane tracking lifecycle', () => {
  it('detects floor and wall planes end-to-end through the real worker handler and PlaneDetector', () => {
    const width = 48;
    const height = 48;
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
    camera.position.set(0, 1.5, 0);
    camera.lookAt(0, 0.7, -2.5);
    camera.updateMatrixWorld();

    // Synthesize linear view-space depth for a floor (y = 0) and back wall (z = -3).
    const depthBuffer = new Float32Array(width * height);
    const invProj = camera.projectionMatrixInverse;
    const rayView = new THREE.Vector3();
    const rayWorld = new THREE.Vector3();
    const camPos = camera.position;
    const camQuat = camera.quaternion;
    for (let py = 0; py < height; py++) {
      const ndcY = 1 - 2 * ((py + 0.5) / height);
      for (let px = 0; px < width; px++) {
        const ndcX = 2 * ((px + 0.5) / width) - 1;
        rayView.set(ndcX, ndcY, -1).applyMatrix4(invProj).normalize();
        if (rayView.z >= -1e-4) continue;
        rayWorld.copy(rayView).applyQuaternion(camQuat);

        let bestT = Infinity;
        if (rayWorld.y < -1e-4) {
          const tFloor = (0 - camPos.y) / rayWorld.y;
          if (tFloor > 0.2 && tFloor < bestT) bestT = tFloor;
        }
        if (rayWorld.z < -1e-4) {
          const tWall = (-3 - camPos.z) / rayWorld.z;
          if (tWall > 0.2 && tWall < bestT) bestT = tWall;
        }
        if (Number.isFinite(bestT)) {
          depthBuffer[py * width + px] = -rayView.z * bestT;
        }
      }
    }

    const detector = new PlaneDetector();
    const options = new Options();
    options.world.planes.showDebugVisualizations = true;
    detector.init({
      options: options.world,
      rendererHolder: new RendererHolder({
        xr: {getReferenceSpace: () => null},
      } as never),
    });

    const tracker = new SimulatorPlaneTracker({
      updateIntervalMs: 0,
      workerFactory: () => {
        const bridge: PlaneTrackingWorkerLike = {
          onmessage: null,
          onerror: null,
          postMessage(message) {
            handleMessage(message);
          },
          terminate() {},
        };
        const handleMessage = createPlaneTrackingWorkerHandler({
          postMessage(response) {
            bridge.onmessage?.({
              data: response,
            } as MessageEvent<PlaneTrackingWorkerResponse>);
          },
          close() {},
        });
        return bridge;
      },
      onPlanesUpdated: (planes) => detector.setSimulatorPlanes(planes),
    });

    try {
      tracker.setActive(true);
      expect(
        tracker.submitDepthFrame({
          width,
          height,
          depthBuffer,
          projectionMatrix: new Float32Array(camera.projectionMatrix.elements),
          cameraPosition: camera.position.clone(),
          cameraQuaternion: camera.quaternion.clone(),
          timestampMs: 1000,
        })
      ).toBe(true);

      const floors = detector.get('floor');
      const walls = detector.get('wall');
      expect(floors.length).toBeGreaterThanOrEqual(1);
      expect(walls.length).toBeGreaterThanOrEqual(1);

      // Verify floor mesh lies near y = 0 with upward normal (+Y).
      const floor = floors[0];
      const floorNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(
        floor.quaternion
      );
      expect(floor.position.y).toBeCloseTo(0, 1);
      expect(floorNormal.y).toBeGreaterThan(0.95);

      // Verify wall mesh lies near z = -3 with normal pointing back toward +Z.
      const wall = walls[0];
      const wallNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(
        wall.quaternion
      );
      expect(wall.position.z).toBeCloseTo(-3, 1);
      expect(wallNormal.z).toBeGreaterThan(0.95);
    } finally {
      tracker.dispose();
      detector.dispose();
    }
  });

  it('lazily initializes depth and worker when switching to an environment without hardcoded planes', async () => {
    vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((url, loaded) => {
      const scene =
        url.endsWith('left.glb') || url.endsWith('right.glb')
          ? makeHandGroup()
          : makeRoomGroup();
      loaded({scene} as GLTF);
    });
    stubPlanesFetch([
      {
        type: 'horizontal',
        label: 'floor',
        area: 6,
        position: {x: 0, y: 0, z: 0},
        quaternion: [0, 0, 0, 1],
        polygon: [
          {x: -1, y: -1},
          {x: 1, y: -1},
          {x: 1, y: 1},
          {x: -1, y: 1},
        ],
      },
    ]);

    const workers: FakePlaneTrackingWorker[] = [];
    vi.stubGlobal(
      'Worker',
      class {
        private readonly delegate = new FakePlaneTrackingWorker();
        constructor() {
          workers.push(this.delegate);
          return this.delegate as never;
        }
      }
    );

    const domElement = document.createElement('canvas');
    let target: THREE.RenderTarget | null = null;
    const clearColor = new THREE.Color(0x000000);
    let clearAlpha = 1;
    let depthReads = 0;
    const renderer = {
      isWebGLRenderer: true,
      domElement,
      extensions: {has: () => false},
      shadowMap: {enabled: false, type: THREE.BasicShadowMap},
      xr: {
        getReferenceSpace: () => null,
        getController: () => new THREE.Group(),
        getControllerGrip: () => new THREE.Group(),
        getHand: () => new THREE.Group(),
      },
      render() {},
      clear() {},
      getRenderTarget: () => target,
      setRenderTarget(value: THREE.RenderTarget | null) {
        target = value;
      },
      getClearColor: (out: THREE.Color) => out.copy(clearColor),
      getClearAlpha: () => clearAlpha,
      setClearColor(color: THREE.ColorRepresentation, alpha: number) {
        clearColor.set(color);
        clearAlpha = alpha;
      },
      getContext: () => ({PIXEL_PACK_BUFFER: 0x88eb, bindBuffer() {}}),
      readRenderTargetPixelsAsync(
        _rt: THREE.RenderTarget,
        _x: number,
        _y: number,
        width: number,
        height: number,
        output?: Float32Array
      ) {
        depthReads++;
        const pixels = output ?? new Float32Array(width * height);
        pixels.fill(2.0);
        return Promise.resolve(pixels);
      },
    };

    const options = new Options();
    options.enablePlaneDetection();
    options.depth.enabled = false;
    options.simulator.renderToRenderTexture = false;
    options.simulator.physics.enabled = false;
    options.simulator.deviceCamera.enabled = false;
    options.simulator.simulatorSettingsPanel.enabled = false;
    options.simulator.instructions.enabled = false;
    options.simulator.handPosePanel.enabled = false;
    options.simulator.environments = [
      {
        name: 'With Planes',
        manifestPath: manifestUrl({
          scenePath: 'https://example.com/with-planes.glb',
          scenePlanesPath: 'https://example.com/planes.json',
        }),
      },
    ];

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20);
    const scene = new THREE.Scene();
    const timer = new THREE.Timer();
    const world = new World();
    await world.init({
      options: options.world,
      camera,
      timer,
      waitFrame: new WaitFrame(),
    });
    world.planes?.init({
      options: options.world,
      rendererHolder: new RendererHolder(renderer as never),
    });

    const input = new Input();
    const interaction = new Interaction({
      callbacks: new ScriptsManager(async () => {}),
    });
    const depth = new Depth();
    const registry = new Registry();
    const simulator = new Simulator(() => {}, renderer as never);
    simulator.depth.depthWidth = 4;
    simulator.depth.depthHeight = 4;

    try {
      await simulator.init({
        simulatorOptions: options.simulator,
        input,
        interaction,
        timer,
        camera,
        scene,
        registry,
        options,
        depth,
        world,
      });

      // Default 'auto' mode with hardcoded planes: zero depth init or worker spawn.
      expect(simulator.planeTrackingMode).toBe('auto');
      expect(simulator.isRealisticPlaneTrackingActive).toBe(false);
      expect(simulator.depth.isInitialized).toBe(false);
      expect(workers).toHaveLength(0);
      expect(world.planes?.get()).toHaveLength(1);

      simulator.simulatorUpdate();
      expect(depthReads).toBe(0);

      // Switch to an environment without hardcoded planes -> automatic fallback!
      await simulator.setEnvironment(
        manifestUrl({scenePath: 'https://example.com/no-planes.glb'})
      );
      expect(simulator.isRealisticPlaneTrackingActive).toBe(true);
      expect(simulator.depth.isInitialized).toBe(true);
      expect(world.planes?.get()).toHaveLength(0);

      simulator.simulatorUpdate();
      await Promise.resolve();
      await Promise.resolve();
      expect(depthReads).toBe(1);
      expect(workers).toHaveLength(1);

      const processPost = workers[0].posted.find(
        (entry) => entry.message.type === 'processDepth'
      );
      expect(processPost).toBeDefined();
      if (processPost?.message.type === 'processDepth') {
        workers[0].emit({
          type: 'planes',
          requestId: processPost.message.requestId,
          sceneGeneration: processPost.message.sceneGeneration,
          planes: [makePlaneSnapshot({id: 'sim-floor', label: 'floor'})],
        });
      }
      expect(world.planes?.get('floor')).toHaveLength(1);

      // XR session suspends simulator planes and restores them on exit.
      simulator.onXRSessionStarted();
      expect(world.planes?.get()).toHaveLength(0);
      simulator.onXRSessionEnded();
      expect(world.planes?.get('floor')).toHaveLength(1);

      // Dispose terminates the worker cleanly.
      simulator.dispose();
      expect(workers[0].terminated).toBe(true);
    } finally {
      simulator.dispose();
      world.dispose();
      timer.dispose();
    }
  });
});
