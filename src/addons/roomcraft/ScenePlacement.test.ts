import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {DetectedPlane} from '../../world/planes/DetectedPlane';
import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {placeSceneOnSurface} from './ScenePlacement';
import type {SceneAssetDescription, SceneLayout} from './SceneTypes';

vi.mock('xrblocks', async () => await import('../../utils/ObjectPlacement'));

const catalog: SceneAssetDescription[] = [
  {id: 'box', description: 'A cube', size: [1, 1, 1]},
];
const layout: SceneLayout = {
  title: 'One cube',
  objects: [
    {
      id: 'cube',
      asset: 'box',
      name: 'Cube',
      position: [0, 0, 0],
      rotation: 0,
      scale: [1, 1, 1],
      color: '#ffffff',
    },
  ],
};
const resources: THREE.Object3D[] = [];

function scene() {
  const root = new THREE.Group();
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial()
  );
  cube.position.y = 0.5;
  root.add(cube);
  root.position.set(1, 2, 3);
  resources.push(root);
  return root;
}

function plane(
  width = 6,
  depth = 6,
  position = new THREE.Vector3(0, 0, -2),
  label = 'floor',
  quaternion = new THREE.Quaternion()
) {
  const surface = new DetectedPlane(null, new THREE.MeshBasicMaterial(), {
    type: label === 'wall' ? 'vertical' : 'horizontal',
    label,
    area: width * depth,
    position,
    quaternion,
    polygon: [
      new THREE.Vector2(-width / 2, -depth / 2),
      new THREE.Vector2(width / 2, -depth / 2),
      new THREE.Vector2(width / 2, depth / 2),
      new THREE.Vector2(-width / 2, depth / 2),
    ],
  });
  resources.push(surface);
  return surface;
}

function camera() {
  const view = new THREE.PerspectiveCamera();
  view.position.set(0, 1.6, 2);
  view.lookAt(0, 0, -2);
  view.updateMatrixWorld(true);
  return view;
}

afterEach(() => {
  resources.splice(0).forEach(disposeObjectTree);
});

describe('Roomcraft detected-surface placement', () => {
  it('grounds the entire composition and keeps its footprint on a scanned floor', () => {
    const root = scene();
    const floor = plane(4, 4);
    expect(placeSceneOnSurface(root, layout, catalog, [floor], camera())).toBe(
      true
    );
    const bounds = new THREE.Box3().setFromObject(root);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-2 - 1e-6);
    expect(bounds.max.x).toBeLessThanOrEqual(2 + 1e-6);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-4 - 1e-6);
    expect(bounds.max.z).toBeLessThanOrEqual(0 + 1e-6);
  });

  it('uses the elevated height of a real detected table', () => {
    const root = scene();
    const table = plane(2, 2, new THREE.Vector3(0, 0.75, -1), 'table');
    expect(placeSceneOnSurface(root, layout, catalog, [table], camera())).toBe(
      true
    );
    expect(new THREE.Box3().setFromObject(root).min.y).toBeCloseTo(0.75);
  });

  it('retains the preview pose when no surface exists or the whole footprint does not fit', () => {
    const root = scene();
    root.rotation.set(0.2, 0.5, 0.1);
    const before = root.position.clone();
    const rotation = root.quaternion.clone();
    const scale = root.scale.clone();
    expect(placeSceneOnSurface(root, layout, catalog, [], camera())).toBe(
      false
    );
    expect(
      placeSceneOnSurface(root, layout, catalog, [plane(0.8, 0.8)], camera())
    ).toBe(false);
    expect(root.position.equals(before)).toBe(true);
    expect(root.quaternion.equals(rotation)).toBe(true);
    expect(root.scale.equals(scale)).toBe(true);
  });

  it('checks the union of object footprints, not just each object or the root point', () => {
    const root = scene();
    const spread: SceneLayout = {
      ...layout,
      objects: [
        {...layout.objects[0], position: [-1.5, 0, 0]},
        {...layout.objects[0], id: 'second', position: [1.5, 0, 0]},
      ],
    };
    expect(
      placeSceneOnSurface(root, spread, catalog, [plane(2, 2)], camera())
    ).toBe(false);
  });

  it('places near the viewer instead of jumping to the origin of a large plane', () => {
    const root = scene();
    const floor = plane(30, 30, new THREE.Vector3(15, 0, -2));
    const view = camera();
    view.position.set(20, 1.6, 6);
    view.lookAt(20, 0, 4);
    expect(placeSceneOnSurface(root, layout, catalog, [floor], view)).toBe(
      true
    );
    const position = root.getWorldPosition(new THREE.Vector3());
    expect(Math.abs(position.x - 20)).toBeLessThan(1);
    expect(position.distanceTo(view.position)).toBeLessThan(4);
    expect(position.y).toBeCloseTo(0);
  });

  it('preserves physical size under a translated, rotated, scaled parent', () => {
    const parent = new THREE.Group();
    parent.position.set(2, 1, -1);
    parent.rotation.y = 0.7;
    parent.scale.setScalar(1.5);
    const root = scene();
    parent.add(root);
    const floor = plane(6, 6, new THREE.Vector3(0, 0.2, -2));
    root.updateWorldMatrix(true, false);
    const beforeScale = root.getWorldScale(new THREE.Vector3());
    expect(placeSceneOnSurface(root, layout, catalog, [floor], camera())).toBe(
      true
    );
    const bounds = new THREE.Box3().setFromObject(root);
    expect(bounds.min.y).toBeCloseTo(0.2);
    expect(
      root.getWorldScale(new THREE.Vector3()).distanceTo(beforeScale)
    ).toBeLessThan(1e-6);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(1.5);
  });

  it('aligns the scene base to a slightly tilted scanned horizontal surface', () => {
    const root = scene();
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      THREE.MathUtils.degToRad(2)
    );
    const floor = plane(6, 6, new THREE.Vector3(0, 0, -2), 'floor', rotation);
    expect(placeSceneOnSurface(root, layout, catalog, [floor], camera())).toBe(
      true
    );
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion);
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
    expect(up.dot(normal)).toBeCloseTo(1);
    expect(
      floor.worldToLocal(root.getWorldPosition(new THREE.Vector3())).y
    ).toBeCloseTo(0);
  });

  it('does not place over a concave hole even if the polygon bounding box is large enough', () => {
    const root = scene();
    const floor = plane();
    floor.simulatorPlane!.polygon = [
      new THREE.Vector2(-2, -2),
      new THREE.Vector2(2, -2),
      new THREE.Vector2(2, 2),
      new THREE.Vector2(1.8, 2),
      new THREE.Vector2(1.8, -1.8),
      new THREE.Vector2(-1.8, -1.8),
      new THREE.Vector2(-1.8, 2),
      new THREE.Vector2(-2, 2),
    ];
    expect(placeSceneOnSurface(root, layout, catalog, [floor], camera())).toBe(
      false
    );
  });

  it('rejects walls, ceilings, downward surfaces, and planes behind the user', () => {
    const root = scene();
    const downward = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI
    );
    for (const surface of [
      plane(6, 6, new THREE.Vector3(0, 0, -2), 'wall'),
      plane(6, 6, new THREE.Vector3(0, 2.5, -2), 'ceiling'),
      plane(6, 6, new THREE.Vector3(0, 0, -2), 'floor', downward),
      plane(2, 2, new THREE.Vector3(0, 0, 5)),
    ]) {
      expect(
        placeSceneOnSurface(root, layout, catalog, [surface], camera())
      ).toBe(false);
    }
  });

  it('leaves invalid or empty compositions unplaced', () => {
    const root = scene();
    expect(
      placeSceneOnSurface(
        root,
        {...layout, objects: []},
        catalog,
        [plane()],
        camera()
      )
    ).toBe(false);
    root.scale.x = 0;
    expect(() =>
      placeSceneOnSurface(root, layout, catalog, [plane()], camera())
    ).toThrow('transform');
  });
});
