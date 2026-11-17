import * as THREE from 'three';
import {expect, it} from 'vitest';
import {applyBVH, disposeBVH} from './BVHRaycast';

it('preserves nested raycast results after acceleration, repeated setup, and disposal', async () => {
  const root = new THREE.Group();
  root.position.z = -3;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial({side: THREE.DoubleSide})
  );
  root.add(new THREE.Group().add(mesh));
  root.updateMatrixWorld(true);
  const raycaster = Object.assign(
    new THREE.Raycaster(
      new THREE.Vector3(0.2, 0.1, 2),
      new THREE.Vector3(0, 0, -1)
    ),
    {firstHitOnly: false}
  );
  const check = () => {
    const hit = raycaster.intersectObject(root, true)[0];
    expect(hit?.object).toBe(mesh);
    expect(hit?.distance).toBeCloseTo(4);
    expect(hit?.point.toArray()).toEqual([0.2, 0.1, -2]);
  };
  try {
    check();
    expect(raycaster.intersectObject(root, true)).toHaveLength(2);
    await applyBVH(root);
    await applyBVH(root);
    raycaster.firstHitOnly = true;
    expect(raycaster.intersectObject(root, true)).toHaveLength(1);
    check();
    disposeBVH(root);
    expect(raycaster.intersectObject(root, true)).toHaveLength(2);
    check();
  } finally {
    disposeBVH(root);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});
