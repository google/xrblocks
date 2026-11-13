import * as THREE from 'three';
import {afterEach, expect, it} from 'vitest';
import {simulated, store} from './Anchors.test-fixture';
import {AnchoredObjects} from './AnchoredObjects';

afterEach(() => {
  localStorage.removeItem('world.anchor-tests');
});
it('restores objects once at their saved world pose and removes scene and storage entries together', async () => {
  const first = simulated(),
    second = simulated();
  const parent = new THREE.Group();
  parent.position.set(3, 1, -2);
  const object = new THREE.Object3D();
  object.position.set(1, 2, 3);
  object.rotation.y = 0.4;
  parent.add(object);
  parent.updateMatrixWorld(true);
  const saved = object.getWorldPosition(new THREE.Vector3());
  const anchored = new AnchoredObjects(first, parent);
  try {
    await anchored.anchor(object, 'lamp');
    const scene = new THREE.Group();
    const restored = new AnchoredObjects(second, scene);
    expect(
      await restored.restore((label) => {
        const node = new THREE.Object3D();
        node.name = label;
        return node;
      })
    ).toBe(1);
    expect(await restored.restore(() => new THREE.Object3D())).toBe(0);
    restored.update();
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].name).toBe('lamp');
    expect(scene.children[0].position).toEqual(saved);
    expect(scene.children[0].rotation.y).toBeCloseTo(0.4);
    restored.remove(second.getAll()[0].id);
    expect(scene.children).toEqual([]);
    expect(store().load()).toEqual([]);
  } finally {
    first.dispose();
    second.dispose();
  }
});
