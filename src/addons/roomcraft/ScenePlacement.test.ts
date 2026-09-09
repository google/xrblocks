import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {DetectedPlane} from '../../world/planes/DetectedPlane';
import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {placeSceneOnSurface} from './ScenePlacement';
import {createProceduralContent} from './ProceduralGeometry';
import {ProceduralMotionPlayer} from './ProceduralMotion';
import {createLandscapeContent} from './LandscapeGeometry';
import type {
  SceneAssetDescription,
  SceneLayout,
  SceneLandscape,
  SceneLandscapeObject,
  SceneProceduralObject,
} from './SceneTypes';

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
  it.each<SceneLandscape>([
    {kind: 'pond', size: [2, 1.5], bankWidth: 0.25},
    {
      kind: 'path',
      points: [
        [-1, 0],
        [0, -1],
        [1, -1],
      ],
      width: 0.5,
    },
    {
      kind: 'scatter',
      style: 'tree',
      size: [1, 1],
      count: 3,
      seed: 17,
      height: 1.2,
    },
  ])('places a standalone $kind using its landscape footprint', (landscape) => {
    const root = new THREE.Group();
    const feature: SceneLandscapeObject = {
      id: 'feature',
      name: 'Landscape feature',
      landscape,
      position: [0, 0, 0],
      rotation: 0,
      scale: [1, 1, 1],
      color: '#557766',
    };
    root.add(createLandscapeContent(landscape, feature.color));
    resources.push(root);
    const floor = plane(8, 8);
    expect(
      placeSceneOnSurface(
        root,
        {title: 'Landscape', objects: [feature]},
        [],
        [floor],
        camera()
      )
    ).toBe(true);
    const bounds = new THREE.Box3().setFromObject(root);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-4 - 1e-6);
    expect(bounds.max.x).toBeLessThanOrEqual(4 + 1e-6);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-6 - 1e-6);
    expect(bounds.max.z).toBeLessThanOrEqual(2 + 1e-6);
  });

  it('does not fit a pond by ignoring its wider stone bank', () => {
    const root = new THREE.Group();
    root.position.set(1, 2, 3);
    const feature: SceneLandscapeObject = {
      id: 'pond',
      name: 'Pond',
      position: [0, 0, 0],
      rotation: 0,
      scale: [1, 1, 1],
      color: '#557766',
      landscape: {kind: 'pond', size: [1, 1], bankWidth: 0.5},
    };
    root.add(createLandscapeContent(feature.landscape, feature.color));
    resources.push(root);
    const before = root.position.clone();
    expect(
      placeSceneOnSurface(
        root,
        {title: 'Pond', objects: [feature]},
        [],
        [plane(1.1, 1.1, new THREE.Vector3(0, 0.75, -1), 'table')],
        camera()
      )
    ).toBe(false);
    expect(root.position.equals(before)).toBe(true);
  });

  it('rejects a table that fits a rest pose but not the full motion footprint', () => {
    const object = orbitingBlock();
    const root = new THREE.Group();
    root.add(createProceduralContent(object.parts, object.color));
    root.position.set(1, 2, 3);
    resources.push(root);
    const before = root.position.clone();
    const table = plane(0.8, 0.8, new THREE.Vector3(0, 0.75, -1), 'table');
    const moving = {title: 'Moving block', objects: [object]};
    expect(placeSceneOnSurface(root, moving, [], [table], camera())).toBe(
      false
    );
    expect(root.position.equals(before)).toBe(true);
    const {motion: _motion, ...part} = object.parts[0];
    const still = {...moving, objects: [{...object, parts: [part]}]};
    expect(placeSceneOnSurface(root, still, [], [table], camera())).toBe(true);
  });

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

  it('fits a scaled, off-center procedural design onto a table without a catalog', () => {
    const object: SceneProceduralObject = {
      id: 'sculpture',
      name: 'Sculpture',
      position: [0.2, 0, 0],
      rotation: 0.2,
      scale: [1.2, 1.4, 0.8],
      color: '#ffffff',
      parts: [
        {
          id: 'body',
          name: 'Body',
          shape: 'box',
          parent: null,
          position: [0.1, 0, 0],
          rotation: [0, 0, 0],
          size: [0.3, 0.6, 0.2],
          color: '#88bb99',
        },
        {
          id: 'branch',
          name: 'Branch',
          shape: 'cylinder',
          parent: 'body',
          position: [0.3, 0, 0],
          rotation: [0, 0, Math.PI / 2],
          size: [0.1, 0.5, 0.1],
          color: '#cc7733',
        },
      ],
    };
    const root = new THREE.Group();
    const content = createProceduralContent(object.parts, object.color);
    content.position.fromArray(object.position);
    content.rotation.y = object.rotation;
    content.scale.fromArray(object.scale);
    root.add(content);
    resources.push(root);
    const tabletop = plane(2, 2, new THREE.Vector3(0, 0.75, -1), 'table');
    expect(
      placeSceneOnSurface(
        root,
        {title: 'Sculpture', objects: [object]},
        [],
        [tabletop],
        camera()
      )
    ).toBe(true);
    const bounds = new THREE.Box3().setFromObject(root);
    expect(bounds.min.y).toBeCloseTo(0.75);
    expect(bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(0.84, 5);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-1 - 1e-6);
    expect(bounds.max.x).toBeLessThanOrEqual(1 + 1e-6);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-2 - 1e-6);
    expect(bounds.max.z).toBeLessThanOrEqual(0 + 1e-6);
  });

  it('refuses a surface that fits the body but not an extended procedural arm', () => {
    const object: SceneProceduralObject = {
      id: 'robot',
      name: 'Robot',
      position: [0, 0, 0],
      rotation: 0,
      scale: [1, 1, 1],
      color: '#ffffff',
      parts: [
        {
          id: 'body',
          name: 'Body',
          shape: 'box',
          parent: null,
          position: [0, 0.3, 0],
          rotation: [0, 0, 0],
          size: [0.3, 0.6, 0.2],
          color: '#88bb99',
        },
        {
          id: 'arm',
          name: 'Arm',
          shape: 'capsule',
          parent: 'body',
          position: [0.5, 0, 0],
          rotation: [0, 0, Math.PI / 2],
          size: [0.1, 2, 0.1],
          color: '#cc7733',
        },
      ],
    };
    const root = new THREE.Group();
    root.add(createProceduralContent(object.parts, object.color));
    root.position.set(1, 2, 3);
    resources.push(root);
    const before = root.position.clone();
    expect(
      placeSceneOnSurface(
        root,
        {title: 'Robot', objects: [object]},
        [],
        [plane(1, 1)],
        camera()
      )
    ).toBe(false);
    expect(root.position.equals(before)).toBe(true);
  });
});
