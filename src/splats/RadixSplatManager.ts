import type {SplatObject, SplatRenderer, StoredSplats} from '@sparkjsdev/radix';
import * as THREE from 'three';
import type {WebGPURenderer} from 'three/webgpu';

import {isWebGPURenderer, type SupportedRenderer} from '../core/RendererTypes';

import {
  attachSplatManager,
  detachSplatManager,
  getSplatCollectionEntry,
  markSplatEntryLive,
  RadixSplatObject,
  type RadixSplatManagerHandle,
} from './RadixSplatObject';
import {SplatsOptions} from './SplatsOptions';

type RadixModule = typeof import('@sparkjsdev/radix');
export type RadixLoader = () => Promise<RadixModule>;

const XR_STEREO_VIEW_KEY = Symbol('xr-stereo-splat-view');
const managerModuleLoaders = new WeakMap<
  RadixSplatManager,
  () => Promise<RadixModule>
>();

function defaultRadixLoader(): Promise<RadixModule> {
  return import('@sparkjsdev/radix');
}

export function loadManagerRadixModule(
  manager: RadixSplatManager
): Promise<RadixModule> {
  const load = managerModuleLoaders.get(manager);
  return load ? load() : defaultRadixLoader();
}

function isMountedAndVisibleInScene(
  object: THREE.Object3D,
  scene: THREE.Scene
): boolean {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (!current.visible) return false;
    if (current === scene) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Manages the shared `@sparkjsdev/radix` `SplatRenderer` for a `Core` scene.
 *
 * All registered and currently visible `RadixSplatObject` instances in the
 * scene are coalesced into a single `SplatCollection` so Radix sorts and draws
 * multiple 3DGS objects together in one global pass—using WebGPU compute
 * shaders when `WebGPURenderer` runs on `WebGPUBackend`, or Radix's built-in
 * WebGL2 + Web Worker CPU-sort fallback when `WebGPURenderer` runs with
 * `forceWebGL: true` (for example on Android XR without WebXR-WebGPU flags).
 *
 * This manager is completely inert and performs zero dynamic imports until the
 * first `RadixSplatObject` is registered.
 */
export class RadixSplatManager {
  private readonly objects = new Set<RadixSplatObject>();
  private readonly radixLoader: RadixLoader;
  private readonly managerHandle: RadixSplatManagerHandle;
  private radixModule?: RadixModule;
  private splatRenderer?: SplatRenderer;
  private initPromise?: Promise<SplatRenderer>;
  private lastEntries: Array<SplatObject<StoredSplats>> = [];
  private collectionDirty = false;
  private sortDirty = false;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly getRenderer: () => SupportedRenderer | undefined,
    private readonly getOptions: () => SplatsOptions,
    radixLoader: RadixLoader = defaultRadixLoader
  ) {
    this.radixLoader = radixLoader;
    this.managerHandle = {
      unregister: (object) => this.unregister(object),
      notifyChanged: ({collectionChanged = true, needsSort = false} = {}) => {
        if (collectionChanged) {
          this.collectionDirty = true;
        }
        if (needsSort) {
          this.sortDirty = true;
        }
      },
    };
    managerModuleLoaders.set(this, async () => {
      this.radixModule ??= await this.radixLoader();
      return this.radixModule;
    });
  }

  /** Whether `dispose()` has been called on this manager. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** The active Radix `SplatRenderer`, once created on first splat registration. */
  get renderer(): SplatRenderer | undefined {
    return this.splatRenderer;
  }

  /**
   * Registers a `RadixSplatObject` with the scene's shared `SplatRenderer`,
   * lazily loading `@sparkjsdev/radix` and creating the renderer if needed.
   */
  async register(object: RadixSplatObject): Promise<void> {
    if (this.disposed) {
      throw new Error('RadixSplatManager has been disposed.');
    }
    if (object.isDisposed) {
      throw new Error('Cannot register a disposed RadixSplatObject.');
    }

    await this.ensureSplatRenderer();
    if (this.disposed) {
      throw new Error('RadixSplatManager has been disposed.');
    }
    if (object.isDisposed) {
      return;
    }
    if (!this.objects.has(object)) {
      this.objects.add(object);
      attachSplatManager(object, this.managerHandle);
      this.collectionDirty = true;
    }
    this.sync();
  }

  /** Removes a `RadixSplatObject` from tracking and updates the active collection. */
  unregister(object: RadixSplatObject): void {
    if (!this.objects.delete(object)) return;
    detachSplatManager(object, this.managerHandle);
    this.collectionDirty = true;
    this.sync();
  }

  /**
   * Reconciles the shared `SplatRenderer.collection` with all registered
   * `RadixSplatObject` instances that are currently mounted and visible in the
   * scene. Fast no-op when no Radix splats have been registered.
   */
  sync(): void {
    if (this.disposed || !this.splatRenderer || !this.radixModule) return;

    const nextPairs: Array<{
      object: RadixSplatObject;
      entry: SplatObject<StoredSplats>;
    }> = [];
    for (const object of this.objects) {
      if (object.isDisposed) {
        this.objects.delete(object);
        continue;
      }
      if (object.opacity <= 0) continue;
      if (!isMountedAndVisibleInScene(object, this.scene)) continue;
      nextPairs.push({object, entry: getSplatCollectionEntry(object)});
    }

    const nextEntries = nextPairs.map((pair) => pair.entry);
    const entriesChanged =
      this.collectionDirty ||
      nextEntries.length !== this.lastEntries.length ||
      nextEntries.some((entry, index) => entry !== this.lastEntries[index]);

    if (entriesChanged) {
      this.collectionDirty = false;
      this.lastEntries = nextEntries;
      if (nextEntries.length === 0) {
        this.splatRenderer.collection = this.radixModule.SplatCollection.EMPTY;
        this.splatRenderer.visible = false;
        // In CPU-sort fallback mode, SplatView retains its last sorted order
        // when collection becomes empty; dispose cached views so hidden/disposed
        // splats clear from screen immediately and release their GPU textures.
        if (this.splatRenderer.sortMode === 'cpu') {
          for (const view of [...(this.splatRenderer.views?.values() ?? [])]) {
            view.dispose();
          }
        }
      } else {
        for (const {object, entry} of nextPairs) {
          markSplatEntryLive(object, entry);
        }
        this.splatRenderer.visible = true;
        this.splatRenderer.collection = new this.radixModule.SplatCollection(
          nextEntries
        );
      }
    }

    if (this.sortDirty) {
      this.sortDirty = false;
      if (this.splatRenderer.sortMode === 'cpu') {
        this.splatRenderer.requestSort();
      }
    }
  }

  /** Disposes the shared `SplatRenderer` and releases all tracked splat objects. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const tracked = [...this.objects];
    this.objects.clear();
    this.lastEntries = [];

    if (this.splatRenderer) {
      this.splatRenderer.removeFromParent();
      this.splatRenderer.dispose();
      this.splatRenderer = undefined;
    }

    for (const object of tracked) {
      detachSplatManager(object, this.managerHandle);
      object.dispose();
    }
  }

  private ensureSplatRenderer(): Promise<SplatRenderer> {
    if (this.splatRenderer) return Promise.resolve(this.splatRenderer);
    if (this.initPromise) return this.initPromise;

    const activeRenderer = this.getRenderer();
    if (!isWebGPURenderer(activeRenderer)) {
      return Promise.reject(
        new Error(
          'RadixSplatManager requires THREE.WebGPURenderer (enable via options.enableSplats() or options.enableWebGPU()).'
        )
      );
    }

    this.initPromise = this.createSplatRenderer(activeRenderer).finally(() => {
      this.initPromise = undefined;
    });
    return this.initPromise;
  }

  private async createSplatRenderer(
    webgpuRenderer: WebGPURenderer
  ): Promise<SplatRenderer> {
    const radix = await loadManagerRadixModule(this);
    if (this.disposed) {
      throw new Error('RadixSplatManager was disposed during initialization.');
    }

    const options = this.getOptions();
    if (
      options.sortWorkers !== undefined &&
      Number.isInteger(options.sortWorkers) &&
      options.sortWorkers > 0
    ) {
      radix.SplatRenderer.sortWorkers = options.sortWorkers;
    }

    const viewParams: {maxStdDev?: number; minAlpha?: number} = {};
    if (options.maxStdDev !== undefined) {
      viewParams.maxStdDev = options.maxStdDev;
    }
    if (options.minAlpha !== undefined) {
      viewParams.minAlpha = options.minAlpha;
    }

    const objectParams: {
      minContribution?: number;
      minPixelRadius?: number;
      maxPixelRadius?: number;
      maxShDegree?: number;
    } = {};
    if (options.minContribution !== undefined) {
      objectParams.minContribution = options.minContribution;
    }
    if (options.minPixelRadius !== undefined) {
      objectParams.minPixelRadius = options.minPixelRadius;
    }
    if (options.maxPixelRadius !== undefined) {
      objectParams.maxPixelRadius = options.maxPixelRadius;
    }
    if (options.maxShDegree !== undefined) {
      objectParams.maxShDegree = options.maxShDegree;
    }

    const splatRenderer = new radix.SplatRenderer({
      renderer: webgpuRenderer,
      collection: radix.SplatCollection.EMPTY,
      method: options.method,
      sortBits: options.sortBits,
      params: Object.keys(viewParams).length > 0 ? viewParams : undefined,
      objectParams:
        Object.keys(objectParams).length > 0 ? objectParams : undefined,
      viewKey: (camera: THREE.Camera) =>
        (camera as THREE.ArrayCamera).isArrayCamera
          ? XR_STEREO_VIEW_KEY
          : camera,
    });
    splatRenderer.name = 'RadixSplatRenderer';
    splatRenderer.renderOrder = options.renderOrder;
    splatRenderer.visible = false;
    // Radix's SplatRenderer extends THREE.Mesh with an index-only quad geometry
    // (no `position` BufferAttribute, since quad corners are synthesized from
    // `vertexIndex` in TSL). Disable raycasting and pointer-events traversal so
    // `THREE.Raycaster` / `HitRegistry` never dereferences `attributes.position`
    // (`TypeError: reading 'getX'`) when hands or controller rays are active.
    splatRenderer.raycast = () => {};
    (splatRenderer as THREE.Object3D & {xb?: {pointerEvents: 'none'}}).xb = {
      pointerEvents: 'none',
    };
    this.scene.add(splatRenderer);
    this.splatRenderer = splatRenderer;
    return splatRenderer;
  }
}
