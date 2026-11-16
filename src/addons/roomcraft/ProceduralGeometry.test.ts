import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {
  createProceduralContent,
  getProceduralBounds,
} from './ProceduralGeometry';
import {ProceduralMotionPlayer} from './ProceduralMotion';
import {SCENE_PART_SHAPES, type ScenePart} from './SceneTypes';

const resources: THREE.Object3D[] = [];

function part(overrides: Partial<ScenePart> = {}): ScenePart {
  return {
    id: 'body',
    name: 'Body',
    shape: 'box',
    parent: null,
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    size: [0.4, 0.5, 0.3],
    color: '#88bb99',
    ...overrides,
  };
}

/** A small compound design: a body, an arm on the body, and a hand on the arm. */
function robot(): ScenePart[] {
  return [
    part(),
    part({
      id: 'arm',
      name: 'Arm',
      shape: 'capsule',
      parent: 'body',
      position: [0.3, 0, 0],
      size: [0.1, 0.4, 0.1],
    }),
    part({
      id: 'hand',
      name: 'Hand',
      shape: 'sphere',
      parent: 'arm',
      position: [0, -0.25, 0],
      size: [0.12, 0.12, 0.12],
    }),
  ];
}

/**
 * A deep chain of alternating 45-degree yaws that cancel exactly, so the
 * long leaf ends up axis-aligned even though every level is rotated.
 */

function build(parts: readonly ScenePart[], tint = '#ffffff') {
  const content = createProceduralContent(parts, tint);
  resources.push(content);
  return content;
}

function boundsOf(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

afterEach(() => {
  for (const object of resources.splice(0)) disposeObjectTree(object);
  vi.restoreAllMocks();
});

describe('createProceduralContent', () => {
  it('fits every shape to its declared size about its own center', () => {
    for (const shape of SCENE_PART_SHAPES) {
      const definition = part({
        shape,
        position: [0.2, 0.7, -0.3],
        size: [0.4, 0.6, 0.25],
      });
      const content = build([definition]);
      const bounds = boundsOf(content);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      expect(
        [size.x, size.y, size.z].map((value) => +value.toFixed(5))
      ).toEqual([0.4, 0.6, 0.25]);
      expect([center.x, center.y, center.z]).toEqual(
        definition.position.map((value) => +value.toFixed(5))
      );
      expect(
        getProceduralBounds([definition]).getSize(new THREE.Vector3()).x
      ).toBeCloseTo(0.4, 5);
    }
  });

  it('disposes what it built when a part cannot be created', () => {
    const geometry = vi.spyOn(THREE.BoxGeometry.prototype, 'dispose');
    const material = vi.spyOn(THREE.MeshStandardMaterial.prototype, 'dispose');
    expect(() =>
      createProceduralContent(
        [part(), part({id: 'blob', shape: 'blob' as ScenePart['shape']})],
        '#ffffff'
      )
    ).toThrow('blob');
    expect(geometry).toHaveBeenCalled();
    expect(material).toHaveBeenCalled();
  });
});

describe('getProceduralBounds', () => {
  it.each(['x', 'y', 'z'] as const)(
    'contains swing and spin poses around a rotated local %s axis',
    (axis) => {
      for (const kind of ['swing', 'spin'] as const) {
        const parts = robot();
        parts[0].rotation = [0.3, -0.7, 0.4];
        parts[1].rotation = [-0.5, 0.1, 0.6];
        const base = {axis, pivot: [0.3, 0.2, -0.1] as ScenePart['position']};
        parts[1].motion =
          kind === 'swing'
            ? {...base, kind, amplitude: 2.7, period: 3}
            : {...base, kind, speed: (-Math.PI * 2) / 3};
        parts.reverse();
        const bounds = getProceduralBounds(parts).expandByScalar(1e-6);
        const content = build(parts);
        const player = new ProceduralMotionPlayer(content, parts);
        for (let index = 0; index < 160; index++) {
          player.update(3 / 160);
          expect(bounds.containsBox(boundsOf(content))).toBe(true);
        }
      }
    }
  );
});
