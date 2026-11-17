import '../addons/testing/setup';
import {SplatMath, Splats} from '@sparkjsdev/radix/core';
import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Core} from '../core/Core';
import {Options} from '../core/Options';
import {RadixSplatManager} from '../splats/RadixSplatManager';
import {RadixSplatObject} from '../splats/RadixSplatObject';

import {ModelLoader} from './ModelLoader';
import {SparkRendererHolder} from './SparkRendererHolder';

const mockSparkMeshes: Array<{url: string; dispose: ReturnType<typeof vi.fn>}> =
  [];

vi.mock('@sparkjsdev/spark', () => {
  class MockSplatMesh extends THREE.Object3D {
    url: string;
    initialized = Promise.resolve();
    dispose = vi.fn();
    constructor({url}: {url: string}) {
      super();
      this.url = url;
      mockSparkMeshes.push(this);
    }
    getBoundingBox() {
      return new THREE.Box3(
        new THREE.Vector3(-0.5, 0, -0.5),
        new THREE.Vector3(0.5, 1, 0.5)
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
    scales: {x: 0.25, y: 0.5, z: 0.25},
    quaternion: {x: 0, y: 0, z: 0, w: 1},
    rgb: {r: 1, g: 1, b: 1},
    opacity: 1,
  });

  const gpuDispose = vi.fn();
  const loadSplatFile = vi.fn().mockResolvedValue({splats: splatsData});
  const fromData = vi.fn(() => ({count: 1, dispose: gpuDispose}));

  class FakeSplatCollection {
    static EMPTY = {objects: [], count: 0};
    objects: Array<{object: unknown; offset: number}>;
    count: number;
    constructor(objects: Array<{count: number}>) {
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
    collection: unknown = FakeSplatCollection.EMPTY;
    sortMode = 'gpu';
    requestSort = vi.fn();
    constructor(_options?: unknown) {
      super();
    }
    override dispose = vi.fn();
  }

  return {
    Splats,
    SplatMath,
    loadSplatFile,
    GpuArrays: {fromData},
    GpuShPalette: {upload: vi.fn()},
    SplatCollection: FakeSplatCollection,
    SplatRenderer: FakeSplatRenderer,
    TSL: {uniform: (value: number) => ({value})},
    SplatGenerator: {forArrays: () => ({})},
    SplatProjector: {dispose: vi.fn()},
    gpuDispose,
  };
}

describe('ModelLoader dual-backend 3DGS loading', () => {
  beforeEach(async () => {
    mockSparkMeshes.length = 0;
    await Core.instance?.dispose();
    Core.instance = undefined;
  });

  afterEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
    vi.restoreAllMocks();
  });

  it('loads .spz and .rad via @sparkjsdev/radix when Core uses WebGPURenderer', async () => {
    const fakeRadix = createFakeRadixModule();
    const core = new Core();
    await core.init(new Options().enableSplats());

    const manager = new RadixSplatManager(
      core.scene,
      () => core.renderer,
      () => core.options.splats,
      async () => fakeRadix as never
    );
    core.splats = manager;
    core.registry.register(manager, RadixSplatManager);

    const loader = new ModelLoader();
    const splat = await loader.loadSplat({
      url: 'https://example.com/scene.rad?token=1',
      renderer: core.renderer,
    });

    expect(splat).toBeInstanceOf(RadixSplatObject);
    expect(fakeRadix.loadSplatFile).toHaveBeenCalledWith(
      'https://example.com/scene.rad?token=1',
      {coordinateSystem: undefined, sh: undefined}
    );
    expect(splat.boundingBox.min.y).toBeCloseTo(0.5, 2);
    expect(splat.boundingBox.max.y).toBeCloseTo(1.5, 2);
    expect(manager.renderer).toBeDefined();

    manager.dispose();
  });

  it('does not upload or leak GPU splats if RadixSplatManager is disposed while loadSplatFile is in flight', async () => {
    const fakeRadix = createFakeRadixModule();
    let resolveLoad!: (value: unknown) => void;
    fakeRadix.loadSplatFile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );

    const core = new Core();
    await core.init(new Options().enableSplats());

    const manager = new RadixSplatManager(
      core.scene,
      () => core.renderer,
      () => core.options.splats,
      async () => fakeRadix as never
    );
    core.splats = manager;
    core.registry.register(manager, RadixSplatManager);

    const loader = new ModelLoader();
    const pending = loader.loadSplat({
      url: 'https://example.com/scene.spz',
      renderer: core.renderer,
    });

    await vi.waitFor(() => {
      expect(fakeRadix.loadSplatFile).toHaveBeenCalledTimes(1);
    });
    manager.dispose();
    resolveLoad({splats: Splats.make(1)});

    await expect(pending).rejects.toThrow(
      'RadixSplatManager has been disposed.'
    );
    expect(fakeRadix.GpuArrays.fromData).not.toHaveBeenCalled();
  });

  it('rejects .splat and .ksplat files with a clear message on WebGPURenderer', async () => {
    const core = new Core();
    await core.init(new Options().enableWebGPU());
    const loader = new ModelLoader();

    await expect(
      loader.loadSplat({url: 'legacy.ksplat', renderer: core.renderer})
    ).rejects.toThrow(
      'Radix (WebGPURenderer) supports .ply, .spz, .rad, and .rdx'
    );
  });

  it('loads .spz via @sparkjsdev/spark on THREE.WebGLRenderer and rejects .rad/.rdx', async () => {
    const core = new Core();
    await core.init(new Options());
    const loader = new ModelLoader();

    const mesh = await loader.load({
      url: 'https://example.com/lego.spz?v=2',
      renderer: core.renderer,
    });
    expect(mockSparkMeshes).toHaveLength(1);
    expect(mesh).toBe(mockSparkMeshes[0]);
    expect(core.registry.get(SparkRendererHolder)).toBeDefined();

    await expect(
      loader.loadSplat({url: 'chunked.rdx', renderer: core.renderer})
    ).rejects.toThrow('requires @sparkjsdev/radix with THREE.WebGPURenderer');
  });
});
