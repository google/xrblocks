import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {afterEach, expect, it, vi} from 'vitest';
vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import {createDefaultCatalog, createModelAsset} from './Catalog';
import {disposeObjectTree} from '../../utils/ThreeDisposal';
afterEach(() => {
  vi.restoreAllMocks();
});

it('builds a procedural asset with usable physical bounds', async () => {
  const asset = createDefaultCatalog()[0];
  const object = await asset.create('#4477cc');
  try {
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    expect(
      size.toArray().every((value) => Number.isFinite(value) && value > 0)
    ).toBe(true);
    expect(object.parent).toBeNull();
  } finally {
    disposeObjectTree(object);
  }
});

it('returns loaded model geometry and propagates a later load failure', async () => {
  const scene = new THREE.Group();
  scene.add(
    new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.9, 0.8),
      new THREE.MeshBasicMaterial()
    )
  );
  const load = vi
    .spyOn(GLTFLoader.prototype, 'load')
    .mockImplementation((_url, loaded) => {
      loaded({scene} as GLTF);
    });
  const asset = createModelAsset({
    id: 'chair',
    description: 'A chair',
    size: [0.8, 0.9, 0.8],
    url: '/chair.glb',
  });
  try {
    expect(await asset.create('#ffffff')).toBe(scene);
    expect(
      new THREE.Box3()
        .setFromObject(scene)
        .getSize(new THREE.Vector3())
        .toArray()
    ).toEqual([expect.closeTo(0.8), expect.closeTo(0.9), expect.closeTo(0.8)]);
    load.mockImplementation((_url, _loaded, _progress, rejected) => {
      rejected!(new Error('offline'));
    });
    await expect(asset.create('#ffffff')).rejects.toThrow('offline');
  } finally {
    disposeObjectTree(scene);
  }
});
