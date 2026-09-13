import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {createDefaultCatalog, createModelAsset} from './Catalog';
import type {SceneAsset} from './SceneTypes';

const {loadGLTF} = vi.hoisted(() => ({loadGLTF: vi.fn()}));

vi.mock('xrblocks', () => ({
  ModelLoader: class {
    loadGLTF = loadGLTF;
  },
}));

const catalog = createDefaultCatalog();

function collect(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  object.traverse((child) => {
    const renderable = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      for (const item of [renderable.material].flat()) materials.add(item);
    }
  });
  return {geometries, materials};
}

function colors(object: THREE.Object3D) {
  return [...collect(object).materials].map((item) => {
    const colored = item as THREE.Material & {color?: unknown};
    return colored.color instanceof THREE.Color ? colored.color.getHex() : -1;
  });
}

/** A stable description of everything Roomcraft can see about an asset. */
function describeTree(object: THREE.Object3D) {
  const parts: string[] = [];
  object.traverse((child) => {
    const renderable = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    const position = renderable.geometry?.getAttribute('position');
    const vertices = position ? position.count : 0;
    let checksum = 0;
    if (position) {
      const array = position.array as ArrayLike<number>;
      for (let index = 0; index < array.length; index++) {
        checksum = (checksum + array[index] * (index + 1)) % 1e6;
      }
    }
    parts.push(
      [
        child.type,
        child.position.toArray().join(','),
        child.rotation.toArray().slice(0, 3).join(','),
        child.scale.toArray().join(','),
        renderable.geometry?.type ?? '',
        vertices,
        checksum.toFixed(4),
        colors(child).join('|'),
      ].join(' ')
    );
  });
  return parts.join('\n');
}

async function build(asset: SceneAsset, color = '#4477cc') {
  const object = await asset.create(color);
  expect(object).toBeInstanceOf(THREE.Object3D);
  return object;
}

describe('createDefaultCatalog', () => {
  it('returns a fresh array with the documented, unique assets', () => {
    const first = createDefaultCatalog();
    const second = createDefaultCatalog();
    expect(first).not.toBe(second);
    const ids = first.map((asset) => asset.id);
    expect(ids).toEqual([
      'sofa',
      'armchair',
      'coffee-table',
      'bookshelf',
      'floor-lamp',
      'plant',
      'plinth',
      'art-panel',
      'arch',
      'building',
      'tree',
      'box',
      'sphere',
      'cylinder',
      'cone',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares valid descriptions and sizes', () => {
    for (const asset of catalog) {
      expect(asset.id).toMatch(/^[a-z][a-z0-9-]{0,47}$/);
      expect(asset.description.trim().length).toBeGreaterThan(0);
      expect(asset.description.length).toBeLessThanOrEqual(600);
      expect(asset.size).toHaveLength(3);
      for (const value of asset.size) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(10);
      }
      expect(typeof asset.create).toBe('function');
    }
  });

  it.each(catalog.map((asset) => [asset.id, asset] as const))(
    '%s builds detached geometry with finite, positive, bounded size',
    async (_id, asset) => {
      const object = await build(asset);
      expect(object.parent).toBe(null);
      const {geometries, materials} = collect(object);
      expect(geometries.size).toBeGreaterThan(0);
      expect(materials.size).toBeGreaterThan(0);

      const bounds = new THREE.Box3().setFromObject(object);
      expect(bounds.isEmpty()).toBe(false);
      const extents = bounds.getSize(new THREE.Vector3()).toArray();
      for (const value of [...bounds.min.toArray(), ...bounds.max.toArray()]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      for (const value of extents) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThan(6);
      }
      // Proportions should roughly match the declared size so that fitting
      // does not visibly distort the asset.
      const declared = Math.max(...asset.size) / Math.min(...asset.size);
      const built = Math.max(...extents) / Math.min(...extents);
      expect(Math.abs(Math.log(built / declared))).toBeLessThan(0.6);
    }
  );

  it.each(catalog.map((asset) => [asset.id, asset] as const))(
    '%s owns fresh resources on every creation',
    async (_id, asset) => {
      const first = collect(await build(asset));
      const second = collect(await build(asset));
      for (const geometry of second.geometries) {
        expect(first.geometries.has(geometry)).toBe(false);
      }
      for (const item of second.materials) {
        expect(first.materials.has(item)).toBe(false);
      }
    }
  );

  it.each(catalog.map((asset) => [asset.id, asset] as const))(
    '%s uses the requested color visibly',
    async (_id, asset) => {
      const requested = '#c83c1e';
      const used = colors(await build(asset, requested));
      expect(used).toContain(new THREE.Color(requested).getHex());
      const other = colors(await build(asset, '#1e46c8'));
      expect(other).not.toEqual(used);
    }
  );

  it.each(catalog.map((asset) => [asset.id, asset] as const))(
    '%s is deterministic for the same color',
    async (_id, asset) => {
      expect(describeTree(await build(asset, '#8a6f4b'))).toBe(
        describeTree(await build(asset, '#8a6f4b'))
      );
    }
  );
});

describe('createModelAsset', () => {
  beforeEach(() => {
    loadGLTF.mockReset();
  });

  function model() {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({color: 0x808080})
    );
    scene.add(mesh);
    return {scene, mesh};
  }

  const options = {
    id: 'my-chair',
    description: 'The application lounge chair',
    size: [0.8, 0.9, 0.8] as [number, number, number],
    url: '/models/chair.glb',
  };

  it('describes the asset without exposing its URL', () => {
    const asset = createModelAsset(options);
    expect(asset.id).toBe('my-chair');
    expect(asset.description).toBe(options.description);
    expect(asset.size).toEqual([0.8, 0.9, 0.8]);
    expect(asset.size).not.toBe(options.size);
    expect(Object.values(asset)).not.toContain(options.url);
  });

  it('rejects a missing URL', () => {
    expect(() => createModelAsset({...options, url: '  '})).toThrow();
  });

  it('loads the configured model through the public loader', async () => {
    const {scene} = model();
    loadGLTF.mockResolvedValue({scene});
    const renderer = {} as THREE.WebGLRenderer;
    const asset = createModelAsset({...options, renderer});

    const object = await asset.create('#ffffff');

    expect(loadGLTF).toHaveBeenCalledWith({url: options.url, renderer});
    expect(object).toBe(scene);
    expect(object.parent).toBe(null);
  });

  it('preserves authored colors for white and multiplies otherwise', async () => {
    const white = model();
    loadGLTF.mockResolvedValue({scene: white.scene});
    const asset = createModelAsset(options);
    await asset.create('#ffffff');
    expect(white.mesh.material.color.getHex()).toBe(0x808080);

    const tinted = model();
    loadGLTF.mockResolvedValue({scene: tinted.scene});
    await asset.create('#ff0000');
    const color = tinted.mesh.material.color;
    expect(color.r).toBeGreaterThan(0);
    expect(color.g).toBe(0);
    expect(color.b).toBe(0);
  });

  it('tints multi-material and skips materials without a color', async () => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [
      new THREE.MeshStandardMaterial({color: 0xffffff}),
      new THREE.MeshDepthMaterial(),
    ]);
    scene.add(mesh);
    loadGLTF.mockResolvedValue({scene});

    await createModelAsset(options).create('#00ff00');

    const materials = mesh.material as THREE.Material[];
    expect(
      (materials[0] as THREE.MeshStandardMaterial).color.getHex()
    ).not.toBe(0xffffff);
    expect(materials[1]).toBeInstanceOf(THREE.MeshDepthMaterial);
  });

  it('tints a shared glTF material only once across all of its meshes', async () => {
    const {scene, mesh} = model();
    scene.add(new THREE.Mesh(mesh.geometry, mesh.material));
    const expected = mesh.material.color
      .clone()
      .multiply(new THREE.Color('#8090a0'));
    loadGLTF.mockResolvedValue({scene});

    await createModelAsset(options).create('#8090a0');

    expect(mesh.material.color.equals(expected)).toBe(true);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });

  it('propagates loading failures instead of substituting a primitive', async () => {
    loadGLTF.mockRejectedValue(new Error('404 Not Found'));
    await expect(createModelAsset(options).create('#ffffff')).rejects.toThrow(
      '404 Not Found'
    );
  });

  it('rejects a result without a scene', async () => {
    loadGLTF.mockResolvedValue({scene: undefined});
    await expect(createModelAsset(options).create('#ffffff')).rejects.toThrow(
      /my-chair/
    );
  });
});
