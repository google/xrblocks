import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {createLandscapeContent, getLandscapeBounds} from './LandscapeGeometry';
import {
  SCENE_SCATTER_STYLES,
  type SceneLandscape,
  type ScenePath,
  type ScenePond,
  type SceneScatter,
} from './SceneTypes';

const resources: THREE.Object3D[] = [];

function pond(overrides: Partial<ScenePond> = {}): ScenePond {
  return {kind: 'pond', size: [3, 2], bankWidth: 0.25, ...overrides};
}

function path(overrides: Partial<ScenePath> = {}): ScenePath {
  return {
    kind: 'path',
    points: [
      [-2, 1.5],
      [-0.5, 0.5],
      [0.5, -0.8],
      [2.2, -1.4],
    ],
    width: 0.8,
    ...overrides,
  };
}

function scatter(overrides: Partial<SceneScatter> = {}): SceneScatter {
  return {
    kind: 'scatter',
    style: 'tree',
    size: [4, 3],
    count: 6,
    seed: 17,
    height: 2.5,
    ...overrides,
  };
}

/** The moonlit garden's three sources, exactly as a planner would emit them. */
const RECIPES: SceneLandscape[] = [pond(), path(), scatter()];

function build(definition: SceneLandscape, color = '#6f8f7a') {
  const content = createLandscapeContent(definition, color);
  resources.push(content);
  return content;
}

function meshOf(content: THREE.Object3D, name: string) {
  const mesh = content.getObjectByName(name);
  if (!(mesh instanceof THREE.Mesh)) throw new Error(`No mesh "${name}".`);
  return mesh;
}

/**
 * A vertex-accurate box. `Box3.setFromObject` falls back to per-instance
 * axis-aligned boxes, which overstate a rotated instance, so the containment
 * proofs measure the rendered vertices themselves.
 */
function renderedBounds(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = child.geometry.getAttribute('position');
    const instanced = child instanceof THREE.InstancedMesh ? child : undefined;
    for (let instance = 0; instance < (instanced?.count ?? 1); instance++) {
      if (instanced) {
        instanced.getMatrixAt(instance, matrix);
        matrix.premultiply(child.matrixWorld);
      } else {
        matrix.copy(child.matrixWorld);
      }
      for (let index = 0; index < position.count; index++) {
        bounds.expandByPoint(
          point.fromBufferAttribute(position, index).applyMatrix4(matrix)
        );
      }
    }
  });
  return bounds;
}

/**
 * The ground anchor of every specimen behind a base component, recovered from
 * its instance transform: the component's own base sits on the specimen base,
 * so the anchor is its center less half its vertical scale along its own up.
 */

afterEach(() => {
  for (const object of resources.splice(0)) disposeObjectTree(object);
  vi.restoreAllMocks();
});

describe('createLandscapeContent', () => {
  it.each(['pond-water', 'pond-bank'])(
    'renders and accepts pointer hits on %s from above, not below',
    (name) => {
      const definition = pond();
      const mesh = meshOf(build(definition), name);
      mesh.updateWorldMatrix(true, false);
      const x =
        name === 'pond-water'
          ? 0.3
          : definition.size[0] / 2 + definition.bankWidth * 0.7;
      const above = new THREE.Raycaster(
        new THREE.Vector3(x, 1, 0.04),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(mesh, false);
      expect(above.length).toBeGreaterThan(0);
      expect(above[0].face?.normal.y).toBeGreaterThan(0);
      const below = new THREE.Raycaster(
        new THREE.Vector3(x, -1, 0.04),
        new THREE.Vector3(0, 1, 0)
      ).intersectObject(mesh, false);
      expect(below).toHaveLength(0);
    }
  );

  it('disposes what it built when construction fails, then rethrows', () => {
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    vi.spyOn(THREE.InstancedMesh.prototype, 'setColorAt').mockImplementation(
      () => {
        throw new Error('Instance colors failed.');
      }
    );
    expect(() => createLandscapeContent(pond(), '#2f5f7a')).toThrow(
      'Instance colors failed.'
    );
    expect(geometry).toHaveBeenCalled();
    expect(material).toHaveBeenCalled();
  });
});

describe('getLandscapeBounds', () => {
  it.each([
    ...RECIPES,
    ...SCENE_SCATTER_STYLES.map((style) =>
      scatter({style, count: 24, height: 1.4, size: [5, 5]})
    ),
    pond({size: [0.2, 20], bankWidth: 1}),
    path({
      points: [
        [0, 0],
        [3, 3],
      ],
      width: 3,
    }),
    path({
      points: [
        [1, 1],
        [3, 1],
        [3, 3],
      ],
      width: 0.15,
    }),
  ] as SceneLandscape[])(
    'contains the rendered geometry of %j',
    (definition) => {
      const bounds = getLandscapeBounds(definition);
      const rendered = renderedBounds(build(definition));
      expect(rendered.isEmpty()).toBe(false);
      expect(bounds.clone().expandByScalar(1e-6).containsBox(rendered)).toBe(
        true
      );
      // Conservative, not unbounded. Pond and path bounds are analytically tight
      // around their swept geometry; scatter only reserves the worst specimen a
      // seed could have produced, which a finite sample rarely reaches.
      const size = bounds.getSize(new THREE.Vector3());
      const slack = size.clone().sub(rendered.getSize(new THREE.Vector3()));
      const allowance =
        definition.kind === 'scatter'
          ? size.multiplyScalar(0.55)
          : new THREE.Vector3(0.4, 0.25, 0.4);
      expect(slack.x).toBeLessThan(allowance.x);
      expect(slack.y).toBeLessThan(allowance.y);
      expect(slack.z).toBeLessThan(allowance.z);
    }
  );
});
