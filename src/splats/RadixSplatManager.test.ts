import '../addons/testing/setup';
import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Core} from '../core/Core';
import {Options} from '../core/Options';
import {isWebGPURenderer} from '../core/RendererTypes';

import {RadixSplatManager} from './RadixSplatManager';
import {RadixSplatObject} from './RadixSplatObject';
import {SplatsOptions} from './SplatsOptions';

type RadixModule = typeof import('@sparkjsdev/radix');

function createFakeRadixRuntime({sortMode = 'gpu' as 'gpu' | 'cpu'} = {}) {
  const EMPTY = {objects: [], count: 0};

  class FakeSplatCollection {
    static EMPTY = EMPTY;
    objects: Array<{object: unknown; offset: number}>;
    count: number;
    constructor(objects: Array<{count: number}>) {
      let offset = 0;
      this.objects = objects.map((object) => {
        const mapped = {object, offset};
        offset += object.count;
        return mapped;
      });
      this.count = offset;
    }
    static arrays(arrays: {count: number}, opts: Record<string, unknown> = {}) {
      return {
        count: arrays.count,
        ...opts,
        generator: {kind: 'shared'},
        data: {splats: arrays},
      };
    }
    static object(obj: unknown) {
      return obj;
    }
  }

  const createdRenderers: FakeSplatRenderer[] = [];

  class FakeSplatRenderer extends THREE.Mesh {
    static sortWorkers = 4;
    private _collection: {objects: Array<{object: {release?: () => void}}>};
    sortMode = sortMode;
    views = new Map<unknown, {dispose: () => void}>();
    viewKey: (camera: THREE.Camera) => unknown;
    requestSort = vi.fn();
    disposeSpy = vi.fn();
    options: Record<string, unknown>;

    constructor(options: {
      collection?: {objects: Array<{object: {release?: () => void}}>};
      viewKey?: (camera: THREE.Camera) => unknown;
      [key: string]: unknown;
    }) {
      // Match Radix's real SplatRenderer: indexed InstancedBufferGeometry with
      // no `position` attribute (which throws in Mesh.raycast unless disabled).
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.setIndex([0, 1, 2, 2, 1, 3]);
      super(geometry, new THREE.MeshBasicMaterial());
      this.options = options;
      this._collection = options.collection ?? EMPTY;
      this.viewKey = options.viewKey ?? ((c) => c);
      createdRenderers.push(this);
    }

    get collection() {
      return this._collection;
    }

    set collection(next: {objects: Array<{object: {release?: () => void}}>}) {
      const prevObjects = new Set(
        this._collection.objects.map((entry) => entry.object)
      );
      const nextObjects = new Set(next.objects.map((entry) => entry.object));
      this._collection = next;
      for (const oldObj of prevObjects) {
        if (!nextObjects.has(oldObj)) {
          oldObj.release?.();
        }
      }
    }

    override dispose() {
      this.collection = EMPTY;
      this.disposeSpy();
    }
  }

  const runtime = {
    SplatCollection: FakeSplatCollection,
    SplatRenderer: FakeSplatRenderer,
    TSL: {uniform: (value: number) => ({value})},
    SplatGenerator: {forArrays: () => ({generateSplat: vi.fn()})},
    SplatProjector: {dispose: vi.fn()},
    createdRenderers,
  };

  return runtime;
}

function makeSplatObject(
  radix: ReturnType<typeof createFakeRadixRuntime>,
  count = 16
) {
  const gpuSplats = {count, dispose: vi.fn()};
  const object = new RadixSplatObject({
    gpuSplats: gpuSplats as never,
    boundingBox: new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1)
    ),
    radix: radix as unknown as RadixModule,
  });
  return {object, gpuSplats};
}

describe('RadixSplatManager & Options.enableSplats', () => {
  beforeEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
  });

  afterEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('Options.enableSplats switches default rendererBackend to webgpu while respecting explicit URL overrides', () => {
    const options = new Options().enableSplats({method: '3dgut', sortBits: 16});
    expect(options.splats.enabled).toBe(true);
    expect(options.splats.method).toBe('3dgut');
    expect(options.splats.sortBits).toBe(16);
    expect(options.rendererBackend).toBe('webgpu');

    const explicitWebGL = new Options({
      rendererBackend: 'webgl',
    }).enableSplats();
    expect(explicitWebGL.rendererBackend).toBe('webgl');
  });

  it('remains inert with zero Radix imports until a RadixSplatObject is registered', async () => {
    const loader = vi.fn();
    const scene = new THREE.Scene();
    const manager = new RadixSplatManager(
      scene,
      () => ({isWebGPURenderer: true}) as never,
      () => new SplatsOptions(),
      loader
    );

    manager.sync();
    expect(loader).not.toHaveBeenCalled();
    expect(manager.renderer).toBeUndefined();
  });

  it('coalesces multiple visible RadixSplatObjects into one shared SplatRenderer and syncs visibility/removal', async () => {
    const radix = createFakeRadixRuntime({sortMode: 'cpu'});
    const loader = vi.fn().mockResolvedValue(radix);

    const core = new Core();
    await core.init(
      new Options().enableSplats({
        sortWorkers: 2,
        minContribution: 2.25,
        maxPixelRadius: 48,
      })
    );
    expect(isWebGPURenderer(core.renderer)).toBe(true);

    const manager = new RadixSplatManager(
      core.scene,
      () => core.renderer,
      () => core.options.splats,
      loader
    );

    const {object: a, gpuSplats: gpuA} = makeSplatObject(radix, 10);
    const {object: b, gpuSplats: gpuB} = makeSplatObject(radix, 20);
    core.scene.add(a, b);

    await Promise.all([manager.register(a), manager.register(b)]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(radix.createdRenderers).toHaveLength(1);
    expect(radix.SplatRenderer.sortWorkers).toBe(2);
    expect(radix.createdRenderers[0].options.sortBits).toBe(16);
    expect(radix.createdRenderers[0].options.objectParams).toEqual({
      minContribution: 2.25,
      maxPixelRadius: 48,
    });
    expect(manager.renderer?.visible).toBe(true);
    expect(manager.renderer?.collection.count).toBe(30);

    // Raycasting the scene when hands/controllers are active must not throw on
    // SplatRenderer's attributeless quad geometry.
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 2),
      new THREE.Vector3(0, 0, -1)
    );
    expect(() => raycaster.intersectObject(core.scene, true)).not.toThrow();
    expect(
      (manager.renderer as unknown as {xb?: {pointerEvents?: string}})?.xb
        ?.pointerEvents
    ).toBe('none');

    // Stereo ArrayCamera instances share a single view key in WebGL2 CPU-sort fallback mode.
    const arrayCam1 = new THREE.ArrayCamera([]);
    const arrayCam2 = new THREE.ArrayCamera([]);
    const monoCam = new THREE.PerspectiveCamera();
    expect(manager.renderer!.viewKey(arrayCam1)).toBe(
      manager.renderer!.viewKey(arrayCam2)
    );
    expect(manager.renderer!.viewKey(monoCam)).toBe(monoCam);

    // Seed a cached CPU-sort view to verify empty-collection cleanup.
    const cachedViewDispose = vi.fn(() => {
      radix.createdRenderers[0].views.delete('stereo');
    });
    radix.createdRenderers[0].views.set('stereo', {dispose: cachedViewDispose});

    // Hiding `a` drops it from the active SplatCollection without disposing its GPU arrays.
    a.visible = false;
    manager.sync();
    expect(manager.renderer?.collection.count).toBe(20);
    expect(manager.renderer?.visible).toBe(true);
    expect(gpuA.dispose).not.toHaveBeenCalled();
    expect(cachedViewDispose).not.toHaveBeenCalled();

    // Fading `b` in CPU-sort mode triggers requestSort().
    b.opacity = 0.4;
    manager.sync();
    expect(radix.createdRenderers[0].requestSort).toHaveBeenCalled();

    // Disposing `b` leaves 0 visible splats: hides SplatRenderer, disposes CPU views, and releases `b`.
    b.dispose();
    expect(manager.renderer?.collection.count).toBe(0);
    expect(manager.renderer?.visible).toBe(false);
    expect(cachedViewDispose).toHaveBeenCalledTimes(1);
    expect(gpuB.dispose).toHaveBeenCalledTimes(1);

    // Manager disposal cleans up the SplatRenderer and any remaining tracked objects.
    manager.dispose();
    expect(radix.createdRenderers[0].disposeSpy).toHaveBeenCalledTimes(1);
    expect(gpuA.dispose).toHaveBeenCalledTimes(1);
  });

  it('rejects registration when Core is configured with THREE.WebGLRenderer', async () => {
    const radix = createFakeRadixRuntime();
    const core = new Core();
    await core.init(new Options());
    const {object} = makeSplatObject(radix);

    await expect(core.splats.register(object)).rejects.toThrow(
      'RadixSplatManager requires THREE.WebGPURenderer'
    );
    object.dispose();
  });
});
