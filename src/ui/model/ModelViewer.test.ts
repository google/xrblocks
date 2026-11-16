import '../../addons/testing/setup';
import {SplatMath, Splats} from '@sparkjsdev/radix/core';
import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Core} from '../../core/Core';
import {Options} from '../../core/Options';
import {RadixSplatManager} from '../../splats/RadixSplatManager';
import {SparkRendererHolder} from '../../utils/SparkRendererHolder';

import {ModelViewer} from './ModelViewer';

vi.mock('@sparkjsdev/spark', () => {
  class MockSplatMesh extends THREE.Object3D {
    initialized = Promise.resolve();
    dispose = vi.fn();
    getBoundingBox() {
      return new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5)
      );
    }
  }
  class MockSparkRenderer extends THREE.Object3D {}
  return {SplatMesh: MockSplatMesh, SparkRenderer: MockSparkRenderer};
});

function createFakeRadixModule() {
  const splatsData = Splats.make(1);
  Splats.store(Splats.get(splatsData).bundle, 0, {
    center: {x: 0, y: 1, z: 0},
    scales: {x: 0.5, y: 1.0, z: 0.5},
    quaternion: {x: 0, y: 0, z: 0, w: 1},
    rgb: {r: 1, g: 1, b: 1},
    opacity: 1,
  });

  const gpuDispose = vi.fn();

  class FakeSplatCollection {
    static EMPTY = {objects: [], count: 0};
    objects: Array<{object: {release?: () => void}; offset: number}>;
    count: number;
    constructor(objects: Array<{count: number; release?: () => void}>) {
      this.objects = objects.map((object, index) => ({object, offset: index}));
      this.count = objects.length;
    }
    static arrays(arrays: {count: number}, opts: Record<string, unknown> = {}) {
      return {
        count: arrays.count,
        ...opts,
        generator: {},
        data: {splats: arrays},
      };
    }
    static object(obj: unknown) {
      return obj;
    }
  }

  class FakeSplatRenderer extends THREE.Mesh {
    static sortWorkers = 4;
    private _collection: {objects: Array<{object: {release?: () => void}}>};
    sortMode = 'gpu';
    requestSort = vi.fn();
    constructor(_options?: unknown) {
      super();
      this._collection = FakeSplatCollection.EMPTY;
    }
    get collection() {
      return this._collection;
    }
    set collection(next: {objects: Array<{object: {release?: () => void}}>}) {
      const prev = new Set(this._collection.objects.map((e) => e.object));
      const curr = new Set(next.objects.map((e) => e.object));
      this._collection = next;
      for (const obj of prev) {
        if (!curr.has(obj)) obj.release?.();
      }
    }
    override dispose() {
      this.collection = FakeSplatCollection.EMPTY;
    }
  }

  return {
    Splats,
    SplatMath,
    loadSplatFile: vi.fn().mockResolvedValue({splats: splatsData}),
    GpuArrays: {fromData: vi.fn(() => ({count: 1, dispose: gpuDispose}))},
    GpuShPalette: {upload: vi.fn()},
    SplatCollection: FakeSplatCollection,
    SplatRenderer: FakeSplatRenderer,
    TSL: {uniform: (value: number) => ({value})},
    SplatGenerator: {forArrays: () => ({})},
    SplatProjector: {dispose: vi.fn()},
    gpuDispose,
  };
}

describe('ModelViewer 3DGS integration', () => {
  beforeEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
  });

  afterEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
    vi.restoreAllMocks();
  });

  it('loads .spz via Radix on WebGPURenderer, aligns bounds, registers with RadixSplatManager, and cleans up on dispose', async () => {
    const fakeRadix = createFakeRadixModule();
    const core = new Core();
    await core.init(new Options().enableSplats());

    const customManager = new RadixSplatManager(
      core.scene,
      () => core.renderer,
      () => core.options.splats,
      async () => fakeRadix as never
    );
    core.splats = customManager;
    core.registry.register(customManager, RadixSplatManager);

    const viewer = new ModelViewer({origin: 'bottom-center'});
    core.scene.add(viewer);
    await core.scriptsManager.syncScriptsWithScene(core.scene);

    await viewer.load({url: 'model.spz', scale: 0.5});

    // Original y bounds [0, 2] scaled by 0.5 -> [0, 1], bottom-center keeps min.y = 0.
    expect(viewer.boundingBox.min.y).toBeCloseTo(0, 2);
    expect(viewer.boundingBox.max.y).toBeCloseTo(1, 2);
    expect(customManager.renderer).toBeDefined();
    expect(customManager.renderer?.visible).toBe(true);
    expect(customManager.renderer?.collection.count).toBe(1);

    viewer.dispose();
    expect(customManager.renderer?.collection.count).toBe(0);
    expect(customManager.renderer?.visible).toBe(false);
    expect(fakeRadix.gpuDispose).toHaveBeenCalledTimes(1);
  });

  it('continues using SparkRendererHolder when Core runs on THREE.WebGLRenderer', async () => {
    const core = new Core();
    await core.init(new Options());

    const viewer = new ModelViewer();
    core.scene.add(viewer);
    await core.scriptsManager.syncScriptsWithScene(core.scene);

    await viewer.load('lego.spz');
    expect(core.registry.get(SparkRendererHolder)).toBeDefined();
    expect(core.splats.renderer).toBeUndefined();
  });
});
