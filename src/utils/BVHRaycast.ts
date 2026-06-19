import * as THREE from 'three';
import type * as BVH from 'three-mesh-bvh';

// --- Dynamic Import of three-mesh-bvh ---
//
// Loaded the same way troika-three-text is in TextView: type-only
// import for the SDK build, dynamic runtime import with try / catch +
// status tracking so apps without three-mesh-bvh installed (or without
// it in their importmap) don't break, they just don't get the
// accelerated raycast.
//
// Apps opt in to BVH by either calling enableAcceleratedRaycast() or
// applyBVH() and ensuring three-mesh-bvh is reachable at runtime
// (e.g. via the demo importmap).

enum BvhImportStatus {
  PENDING = 0,
  SUCCESS = 1,
  FAILED = 2,
}

let acceleratedRaycast: typeof BVH.acceleratedRaycast | undefined;
let computeBoundsTree: typeof BVH.computeBoundsTree | undefined;
let disposeBoundsTree: typeof BVH.disposeBoundsTree | undefined;
let bvhImportStatus = BvhImportStatus.PENDING;
let bvhImportError: Error | undefined;
let bvhImportPromise: Promise<boolean> | null = null;
let bvhProtoPatched = false;

function importBVH(): Promise<boolean> {
  if (bvhImportPromise) return bvhImportPromise;
  bvhImportPromise = (async () => {
    try {
      const mod = await import('three-mesh-bvh');
      acceleratedRaycast = mod.acceleratedRaycast;
      computeBoundsTree = mod.computeBoundsTree;
      disposeBoundsTree = mod.disposeBoundsTree;
      bvhImportStatus = BvhImportStatus.SUCCESS;
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) bvhImportError = error;
      bvhImportStatus = BvhImportStatus.FAILED;
      console.warn(
        '[xrblocks] three-mesh-bvh not available; raycasts will use the ' +
          'stock three.js walker. Install three-mesh-bvh or add it to your ' +
          'importmap to enable BVH-accelerated raycasts.',
        error
      );
      return false;
    }
  })();
  return bvhImportPromise;
}

/**
 * Whether the BVH module has been loaded AND the THREE prototypes have
 * been patched. Sync check; returns false until `enableAcceleratedRaycast()`
 * (or `applyBVH()`) has resolved at least once.
 */
export function isBVHReady(): boolean {
  return bvhProtoPatched;
}

/**
 * Dynamically import three-mesh-bvh and install the prototype patches
 * that route `THREE.Mesh.raycast` through the accelerated path when
 * the target mesh has a computed bounds tree. Adds
 * `computeBoundsTree` / `disposeBoundsTree` helpers to
 * `THREE.BufferGeometry`.
 *
 * Async because the BVH module is loaded on demand (same pattern as
 * troika-three-text). Resolves to `true` if the module loaded and
 * patches were applied, `false` if the module isn't available — in
 * which case meshes continue to use the stock raycaster.
 *
 * Safe to call multiple times. The first call kicks off the import,
 * subsequent calls share the same promise.
 */
export async function enableAcceleratedRaycast(): Promise<boolean> {
  const ok = await importBVH();
  if (!ok || bvhProtoPatched) return bvhProtoPatched;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
  bvhProtoPatched = true;
  return true;
}

/**
 * Walk the given object3D (recursively) and build a bounds tree on
 * every standard `THREE.Mesh` whose geometry doesn't already have one.
 * Subsequent `raycaster.intersectObject(root, true)` calls then go
 * through the BVH-accelerated path.
 *
 * Use on dense, static environmental meshes only (loaded immersive
 * scenes, photogrammetry scans, baked levels). The tree has a one-time
 * build + memory cost and assumes static vertices, so it's a net loss
 * for low-poly / UI / dynamic meshes. Don't apply globally to
 * `xb.core.scene`.
 *
 * Skips `THREE.SkinnedMesh`: skinned meshes deform vertices on the GPU
 * each frame, so a bounds tree built on the bind-pose geometry is wrong
 * the moment the mesh animates. Three's `SkinnedMesh.raycast()` also
 * overrides the patched `Mesh.prototype.raycast` and does its own CPU
 * skinning, so the BVH would never be consulted anyway.
 *
 * Skips `THREE.BatchedMesh`: three-mesh-bvh ships a dedicated
 * `computeBatchedBoundsTree` / `disposeBatchedBoundsTree` pair that
 * builds per-draw-range BVHs on `this.boundsTrees` (plural), and
 * `acceleratedRaycast` has a separate `isBatchedMesh` branch that
 * consults those. The standard `computeBoundsTree` would index the
 * combined batched buffer and produce wrong hits. Conservative skip
 * until the batched helpers are wired up.
 *
 * `THREE.InstancedMesh` is NOT skipped: its `.raycast()` calls a
 * shared internal `Mesh` per instance, which does route through the
 * patched `Mesh.prototype.raycast`, so a BVH on the shared geometry
 * accelerates every per-instance test.
 *
 * Async because it awaits the dynamic import of three-mesh-bvh. If the
 * module isn't available, this is a no-op. Idempotent across calls.
 */
export async function applyBVH(
  root: THREE.Object3D,
  {recursive = true}: {recursive?: boolean} = {}
): Promise<void> {
  const ok = await enableAcceleratedRaycast();
  if (!ok) return;
  const visit = (obj: THREE.Object3D) => {
    if (
      obj instanceof THREE.Mesh &&
      !(obj instanceof THREE.SkinnedMesh) &&
      !(obj instanceof THREE.BatchedMesh) &&
      obj.geometry
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geom = obj.geometry as any;
      if (!geom.boundsTree && typeof geom.computeBoundsTree === 'function') {
        geom.computeBoundsTree();
      }
    }
    if (recursive) {
      for (const child of obj.children) visit(child);
    }
  };
  visit(root);
}

/**
 * Walk the given object3D (recursively) and dispose any bounds trees
 * previously built by `applyBVH`. Sync; no-op if three-mesh-bvh
 * wasn't loaded.
 */
export function disposeBVH(
  root: THREE.Object3D,
  {recursive = true}: {recursive?: boolean} = {}
): void {
  if (!bvhProtoPatched) return;
  const visit = (obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geom = obj.geometry as any;
      if (geom.boundsTree && typeof geom.disposeBoundsTree === 'function') {
        geom.disposeBoundsTree();
      }
    }
    if (recursive) {
      for (const child of obj.children) visit(child);
    }
  };
  visit(root);
}

// Exposed for tests; consumers should use isBVHReady() instead.
export function _getBvhImportStatus(): {
  status: BvhImportStatus;
  error?: Error;
} {
  return {status: bvhImportStatus, error: bvhImportError};
}
