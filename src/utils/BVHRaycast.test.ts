import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  applyBVH,
  disposeBVH,
  enableAcceleratedRaycast,
  isBVHReady,
} from './BVHRaycast';

describe('BVHRaycast', () => {
  it('installs the THREE.Mesh prototype patch and helpers after enableAcceleratedRaycast resolves', async () => {
    const ok = await enableAcceleratedRaycast();
    expect(ok).toBe(true);
    expect(isBVHReady()).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = THREE.BufferGeometry.prototype as any;
    expect(typeof proto.computeBoundsTree).toBe('function');
    expect(typeof proto.disposeBoundsTree).toBe('function');
  });

  it('applyBVH builds a boundsTree on every mesh in the tree (recursive)', async () => {
    const root = new THREE.Group();
    const m1 = new THREE.Mesh(new THREE.BoxGeometry());
    const m2 = new THREE.Mesh(new THREE.SphereGeometry());
    const inner = new THREE.Group();
    inner.add(m2);
    root.add(m1);
    root.add(inner);
    await applyBVH(root);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((m1.geometry as any).boundsTree).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((m2.geometry as any).boundsTree).toBeDefined();
  });

  it('applyBVH skips meshes that already have a boundsTree (idempotent)', async () => {
    const root = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry());
    root.add(m);
    await applyBVH(root);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstTree = (m.geometry as any).boundsTree;
    await applyBVH(root);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secondTree = (m.geometry as any).boundsTree;
    expect(secondTree).toBe(firstTree);
  });

  it('applyBVH with recursive=false only visits the root itself', async () => {
    const root = new THREE.Group();
    const direct = new THREE.Mesh(new THREE.BoxGeometry());
    const nested = new THREE.Mesh(new THREE.BoxGeometry());
    const innerGroup = new THREE.Group();
    innerGroup.add(nested);
    root.add(direct);
    root.add(innerGroup);
    await applyBVH(root, {recursive: false});
    // The root is a Group (not a Mesh), so nothing gets a tree when
    // recursive=false: we only visit the root itself.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((direct.geometry as any).boundsTree).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((nested.geometry as any).boundsTree).toBeUndefined();
  });

  it('disposeBVH drops the boundsTree on every mesh in the tree', async () => {
    const root = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry());
    root.add(m);
    await applyBVH(root);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((m.geometry as any).boundsTree).toBeDefined();
    disposeBVH(root);
    // disposeBoundsTree sets boundsTree to null.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((m.geometry as any).boundsTree).toBeFalsy();
  });

  it('applyBVH applies the right policy to a mixed tree of Mesh + SkinnedMesh + InstancedMesh + BatchedMesh + non-mesh in a single call', async () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry());
    const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry());
    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      4
    );
    const batched = new THREE.BatchedMesh(1, 8, 12);
    const nonMesh = new THREE.Object3D();
    root.add(mesh, skinned, instanced, batched, nonMesh);
    await applyBVH(root);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mesh.geometry as any).boundsTree).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((skinned.geometry as any).boundsTree).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((instanced.geometry as any).boundsTree).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((batched.geometry as any).boundsTree).toBeUndefined();
  });

  it('end-to-end: a raycaster.intersectObject through the patched Mesh.prototype returns the expected hit for a BVH-equipped mesh', async () => {
    // Plane facing +Z at the origin (PlaneGeometry default is in the XY
    // plane, normal pointing +Z). Cast a ray from (0, 0, 5) towards -Z;
    // expect a hit at (0, 0, 0) with distance 5.
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial()
    );
    await applyBVH(plane, {recursive: false});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((plane.geometry as any).boundsTree).toBeDefined();

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(0, 0, -1)
    );
    const hits = raycaster.intersectObject(plane);
    // PlaneGeometry is 2 triangles sharing the diagonal; a centered ray
    // straddles them and can hit both. The point we're proving is that
    // the patched raycast path through the BVH returns valid geometry.
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].distance).toBeCloseTo(5, 5);
    expect(hits[0].point.x).toBeCloseTo(0, 5);
    expect(hits[0].point.y).toBeCloseTo(0, 5);
    expect(hits[0].point.z).toBeCloseTo(0, 5);
  });
});
