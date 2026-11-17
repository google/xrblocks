import type {
  ArrayData,
  GpuArrays,
  SplatGenerator,
  SplatObject,
  SplatObjectParams,
  StoredSplats,
} from '@sparkjsdev/radix';
import * as THREE from 'three';

type RadixModule = typeof import('@sparkjsdev/radix');

export interface RadixSplatManagerHandle {
  unregister(object: RadixSplatObject): void;
  notifyChanged(options?: {
    collectionChanged?: boolean;
    needsSort?: boolean;
  }): void;
}

export interface RadixSplatObjectOptions {
  /** Spherical harmonics degree cap (`0` or `false` disables SH). */
  sh?: number | false;
  /** Optional per-object Radix rendering parameter overrides. */
  params?: Partial<SplatObjectParams>;
  /** Initial opacity multiplier in `[0, 1]`. Defaults to `1`. */
  opacity?: number;
  /**
   * Pre-builds a GPU uniform opacity modifier so runtime fades (`object.opacity = ...`)
   * update a single uniform in O(1) without rebuilding the collection.
   */
  dynamicOpacity?: boolean;
}

interface RadixSplatObjectHooks {
  attachManager: (manager: RadixSplatManagerHandle) => void;
  detachManager: (manager: RadixSplatManagerHandle) => void;
  getCollectionEntry: () => SplatObject<StoredSplats>;
  markEntryLive: (entry: SplatObject<StoredSplats>) => void;
}

const splatObjectHooks = new WeakMap<RadixSplatObject, RadixSplatObjectHooks>();

export function attachSplatManager(
  object: RadixSplatObject,
  manager: RadixSplatManagerHandle
): void {
  splatObjectHooks.get(object)?.attachManager(manager);
}

export function detachSplatManager(
  object: RadixSplatObject,
  manager: RadixSplatManagerHandle
): void {
  splatObjectHooks.get(object)?.detachManager(manager);
}

export function getSplatCollectionEntry(
  object: RadixSplatObject
): SplatObject<StoredSplats> {
  const hooks = splatObjectHooks.get(object);
  if (!hooks) {
    throw new Error('Invalid RadixSplatObject instance.');
  }
  return hooks.getCollectionEntry();
}

export function markSplatEntryLive(
  object: RadixSplatObject,
  entry: SplatObject<StoredSplats>
): void {
  splatObjectHooks.get(object)?.markEntryLive(entry);
}

/**
 * Computes the local axis-aligned bounding box of decoded Radix splats.
 * When `centersOnly` is `false` (default), includes each visible splat's 1-sigma
 * rotated covariance extent along X/Y/Z, matching Spark's `getBoundingBox(false)`.
 */
export function computeRadixSplatBounds(
  data: ArrayData,
  radix: Pick<RadixModule, 'Splats' | 'SplatMath'>,
  {centersOnly = false}: {centersOnly?: boolean} = {}
): THREE.Box3 {
  const box = new THREE.Box3();
  if (data.count <= 0) return box;

  const found = radix.Splats.find(data);
  if (!found) return box;

  if (centersOnly) {
    const center = {x: 0, y: 0, z: 0};
    for (let i = 0; i < data.count; i++) {
      radix.Splats.loadCenter(found.bundle, i, center);
      if (
        !Number.isFinite(center.x) ||
        !Number.isFinite(center.y) ||
        !Number.isFinite(center.z)
      ) {
        continue;
      }
      box.min.x = Math.min(box.min.x, center.x);
      box.min.y = Math.min(box.min.y, center.y);
      box.min.z = Math.min(box.min.z, center.z);
      box.max.x = Math.max(box.max.x, center.x);
      box.max.y = Math.max(box.max.y, center.y);
      box.max.z = Math.max(box.max.z, center.z);
    }
    return box;
  }

  const splat = radix.Splats.makeSplat();
  const cov = {xx: 0, yy: 0, zz: 0, xy: 0, xz: 0, yz: 0};
  for (let i = 0; i < data.count; i++) {
    radix.Splats.load(found.bundle, i, splat);
    if (!(splat.opacity > 0)) continue;
    const {x, y, z} = splat.center;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    radix.SplatMath.covFromScaleQuat(splat.scales, splat.quaternion, cov);
    const ex = Math.sqrt(Math.max(0, cov.xx));
    const ey = Math.sqrt(Math.max(0, cov.yy));
    const ez = Math.sqrt(Math.max(0, cov.zz));
    box.min.x = Math.min(box.min.x, x - ex);
    box.min.y = Math.min(box.min.y, y - ey);
    box.min.z = Math.min(box.min.z, z - ez);
    box.max.x = Math.max(box.max.x, x + ex);
    box.max.y = Math.max(box.max.y, y + ey);
    box.max.z = Math.max(box.max.z, z + ez);
  }
  return box;
}

/**
 * Scene-graph representation of a `@sparkjsdev/radix` 3D Gaussian Splat model.
 *
 * Unlike `@sparkjsdev/spark`'s `SplatMesh`, Radix separates GPU splat tables
 * (`GpuArrays`) from a scene-wide `SplatRenderer` that globally sorts and draws
 * an immutable `SplatCollection` in a single draw call. `RadixSplatObject`
 * bridges that architecture to `THREE.Object3D` so transforms, `.visible`,
 * `.opacity`, scene add/remove, bounding boxes, and `dispose()` work identically
 * across XR Blocks scripts and `ModelViewer`.
 */
export class RadixSplatObject extends THREE.Object3D {
  /** Local-space bounding box of the decoded splat data. */
  readonly boundingBox: THREE.Box3;
  /** Total number of splats stored in `gpuSplats`. */
  readonly count: number;

  private readonly gpuSplats: GpuArrays;
  private readonly gpuShPalette?: GpuArrays;
  private readonly radix: RadixModule;
  private readonly sh?: number | false;
  private readonly liveEntries = new Set<SplatObject<StoredSplats>>();
  private _params?: Partial<SplatObjectParams>;
  private _opacity = 1;
  private opacityUniform?: {value: number};
  private customGenerator?: SplatGenerator<StoredSplats>;
  private activeEntry?: SplatObject<StoredSplats>;
  private entryDirty = true;
  private disposed = false;
  private gpuResourcesDisposed = false;
  private manager?: RadixSplatManagerHandle;

  constructor({
    gpuSplats,
    gpuShPalette,
    boundingBox,
    radix,
    options = {},
  }: {
    gpuSplats: GpuArrays;
    gpuShPalette?: GpuArrays;
    boundingBox: THREE.Box3;
    radix: RadixModule;
    options?: RadixSplatObjectOptions;
  }) {
    super();
    this.name = 'RadixSplatObject';
    this.gpuSplats = gpuSplats;
    this.gpuShPalette = gpuShPalette;
    this.boundingBox = boundingBox.clone();
    this.count = gpuSplats.count;
    this.radix = radix;
    this.sh = options.sh;
    this._params = options.params ? {...options.params} : undefined;

    const initialOpacity =
      options.opacity === undefined
        ? 1
        : Math.max(0, Math.min(1, options.opacity));
    this._opacity = initialOpacity;
    if (options.dynamicOpacity || initialOpacity < 1) {
      this.ensureOpacityModifier();
    }

    splatObjectHooks.set(this, {
      attachManager: (manager) => {
        this.manager = manager;
      },
      detachManager: (manager) => {
        if (this.manager === manager) {
          this.manager = undefined;
        }
      },
      getCollectionEntry: () => this.buildOrReuseCollectionEntry(),
      markEntryLive: (entry) => {
        if (!this.disposed) {
          this.liveEntries.add(entry);
        }
      },
    });
  }

  /** Whether `dispose()` has been called on this splat object. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Per-object Radix rendering parameter overrides. */
  get params(): Partial<SplatObjectParams> | undefined {
    return this._params;
  }

  set params(value: Partial<SplatObjectParams> | undefined) {
    this._params = value ? {...value} : undefined;
    this.invalidateEntry();
    this.manager?.notifyChanged({collectionChanged: true, needsSort: true});
  }

  /** Per-object opacity multiplier in `[0, 1]`. */
  get opacity(): number {
    return this._opacity;
  }

  set opacity(value: number) {
    const clamped = Number.isFinite(value)
      ? Math.max(0, Math.min(1, value))
      : 0;
    if (clamped === this._opacity) return;
    const wasPositive = this._opacity > 0;
    this._opacity = clamped;

    let entryInvalidated = false;
    if (clamped < 1 && !this.opacityUniform) {
      this.ensureOpacityModifier();
      this.invalidateEntry();
      entryInvalidated = true;
    } else if (this.opacityUniform) {
      this.opacityUniform.value = clamped;
    }

    const isPositive = clamped > 0;
    this.manager?.notifyChanged({
      collectionChanged: entryInvalidated || wasPositive !== isPositive,
      needsSort: wasPositive !== isPositive || isPositive,
    });
  }

  /**
   * Releases GPU splat textures and unregisters from the scene's
   * `RadixSplatManager`. If an asynchronous WebGL2 CPU sort is currently in
   * flight for a collection referencing this object, GPU texture destruction is
   * deferred until Radix sweeps that retired collection.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.activeEntry = undefined;
    const manager = this.manager;
    this.manager = undefined;
    manager?.unregister(this);

    if (this.liveEntries.size === 0) {
      this.disposeGpuResources();
    }
  }

  private buildOrReuseCollectionEntry(): SplatObject<StoredSplats> {
    if (this.disposed) {
      throw new Error(
        'Cannot build a SplatCollection entry from a disposed RadixSplatObject.'
      );
    }
    if (!this.activeEntry || this.entryDirty) {
      this.entryDirty = false;
      const entryRef: {current?: SplatObject<StoredSplats>} = {};
      const release = () => {
        if (entryRef.current) {
          this.liveEntries.delete(entryRef.current);
        }
        if (this.disposed && this.liveEntries.size === 0) {
          this.disposeGpuResources();
        }
      };

      const entry = this.customGenerator
        ? this.radix.SplatCollection.object<StoredSplats>({
            count: this.gpuSplats.count,
            generator: this.customGenerator,
            data: {
              splats: this.gpuSplats,
              shPalette: this.gpuShPalette,
            },
            matrixWorld: () => this.matrixWorld,
            params: this._params,
            release,
          })
        : this.radix.SplatCollection.arrays(this.gpuSplats, {
            sh: this.sh,
            shPalette: this.gpuShPalette,
            matrixWorld: () => this.matrixWorld,
            params: this._params,
            release,
          });
      entryRef.current = entry;
      this.activeEntry = entry;
    }
    return this.activeEntry;
  }

  private invalidateEntry(): void {
    this.entryDirty = true;
    this.activeEntry = undefined;
  }

  private ensureOpacityModifier(): void {
    if (this.opacityUniform) return;
    const uniformNode = this.radix.TSL.uniform(this._opacity);
    this.opacityUniform = uniformNode;
    this.customGenerator = this.radix.SplatGenerator.forArrays(this.gpuSplats, {
      sh: this.sh,
      shPalette: this.gpuShPalette,
      modifiers: [
        (splat) => {
          const modified = splat.toVar();
          modified.get('opacity').mulAssign(uniformNode);
          return modified;
        },
      ],
    });
  }

  private disposeGpuResources(): void {
    if (this.gpuResourcesDisposed) return;
    this.gpuResourcesDisposed = true;
    if (this.customGenerator) {
      this.radix.SplatProjector.dispose(this.customGenerator);
      this.customGenerator = undefined;
    }
    this.gpuSplats.dispose();
    this.gpuShPalette?.dispose();
  }
}
