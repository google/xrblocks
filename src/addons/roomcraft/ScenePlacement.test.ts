vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {DetectedPlane} from '../../world/planes/DetectedPlane';
import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {placeSceneOnSurface} from './ScenePlacement';
import {createProceduralContent} from './ProceduralGeometry';
import {ProceduralMotionPlayer} from './ProceduralMotion';

import type {
  SceneAssetDescription,
  SceneLayout,
  SceneProceduralObject,
} from './SceneTypes';

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

function orbitingBlock(): SceneProceduralObject {
  return {
    id: 'orbit',
    name: 'Orbiting block',
    position: [0, 0, 0],
    rotation: 0,
    scale: [1, 1, 1],
    color: '#ffffff',
    parts: [
      {
        id: 'block',
        name: 'Block',
        shape: 'box',
        parent: null,
        position: [0.5, 0.1, 0],
        rotation: [0, 0, 0],
        size: [0.2, 0.2, 0.2],
        color: '#ee7733',
        motion: {kind: 'spin', axis: 'y', pivot: [-0.5, 0, 0], speed: 1},
      },
    ],
  };
}

afterEach(() => {
  resources.splice(0).forEach(disposeObjectTree);
});

describe('Roomcraft detected-surface placement', () => {
  it('keeps every sampled animation phase grounded and inside a fitted table', () => {
    const object = orbitingBlock();
    const root = new THREE.Group();
    const content = createProceduralContent(object.parts, object.color);
    root.add(content);
    resources.push(root);
    const motion = new ProceduralMotionPlayer(content, object.parts);
    const table = plane(1.4, 1.4, new THREE.Vector3(0, 0.75, -1), 'table');
    expect(
      placeSceneOnSurface(
        root,
        {title: 'Moving block', objects: [object]},
        [],
        [table],
        camera()
      )
    ).toBe(true);
    for (let step = 0; step < 80; step++) {
      motion.update((Math.PI * 2) / 80);
      const bounds = new THREE.Box3().setFromObject(root);
      expect(bounds.min.y).toBeCloseTo(0.75, 6);
      expect(bounds.min.x).toBeGreaterThanOrEqual(-0.7 - 1e-6);
      expect(bounds.max.x).toBeLessThanOrEqual(0.7 + 1e-6);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-1.7 - 1e-6);
      expect(bounds.max.z).toBeLessThanOrEqual(-0.3 + 1e-6);
    }
  });

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
});
