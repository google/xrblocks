import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {
  createProceduralContent,
  getProceduralBounds,
} from './ProceduralGeometry';
import {ProceduralMotionPlayer} from './ProceduralMotion';
import {MAX_PART_DEPTH, SCENE_PART_SHAPES, type ScenePart} from './SceneTypes';

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
function foldedArm(): ScenePart[] {
  return Array.from({length: 4}, (_, index) =>
    part({
      id: `fold-${index}`,
      name: `Fold ${index}`,
      parent: index === 0 ? null : `fold-${index - 1}`,
      position: [0, 0, 0],
      rotation: [0, (index % 2 === 0 ? 1 : -1) * (Math.PI / 4), 0],
      size: index === 3 ? [5, 0.2, 0.2] : [0.1, 0.1, 0.1],
    })
  );
}

function build(parts: readonly ScenePart[], tint = '#ffffff') {
  const content = createProceduralContent(parts, tint);
  resources.push(content);
  return content;
}

function group(content: THREE.Object3D, id: string) {
  const found = content.getObjectByName(id);
  if (!found) throw new Error(`Missing part group "${id}".`);
  return found;
}

function meshOf(content: THREE.Object3D, id: string) {
  const mesh = group(content, id).children[0];
  if (!(mesh instanceof THREE.Mesh)) throw new Error(`No mesh for "${id}".`);
  return mesh;
}

function materialOf(content: THREE.Object3D, id: string) {
  const material = meshOf(content, id).material;
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    throw new Error(`No standard material for "${id}".`);
  }
  return material;
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

  it('orients cylinders, cones, and capsules along Y and a torus in XY', () => {
    const tall = part({size: [0.1, 0.9, 0.1]});
    for (const shape of ['cylinder', 'cone', 'capsule'] as const) {
      const size = boundsOf(build([part({...tall, shape})])).getSize(
        new THREE.Vector3()
      );
      expect(size.y).toBeCloseTo(0.9, 5);
      expect(size.x).toBeCloseTo(0.1, 5);
      expect(size.z).toBeCloseTo(0.1, 5);
    }
    const torus = meshOf(
      build([part({shape: 'torus', size: [0.5, 0.5, 0.1]})]),
      'body'
    );
    torus.geometry.computeBoundingBox();
    const box = torus.geometry.boundingBox;
    expect(box).toBeTruthy();
    expect(box?.max.x).toBeCloseTo(0.25, 5);
    expect(box?.max.y).toBeCloseTo(0.25, 5);
    expect(box?.max.z).toBeCloseTo(0.05, 5);
    const attribute = torus.geometry.getAttribute('position');
    const hole = new THREE.Vector3().fromBufferAttribute(attribute, 0);
    expect(Math.hypot(hole.x, hole.y)).toBeGreaterThan(0.01);
  });

  it.each([
    [0.5, 0.5, 1],
    [0.1, 0.8, 5],
    [1, 0.3, 0.1],
  ])('keeps a torus opening at size [%s, %s, %s]', (width, height, depth) => {
    const mesh = meshOf(
      build([part({shape: 'torus', size: [width, height, depth]})]),
      'body'
    );
    const geometry = mesh.geometry;
    if (!(geometry instanceof THREE.TorusGeometry)) {
      throw new Error('Expected torus geometry.');
    }
    expect(
      geometry.parameters.radius - geometry.parameters.tube
    ).toBeGreaterThan(0);
    const size = boundsOf(mesh).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(width, 5);
    expect(size.y).toBeCloseTo(height, 5);
    expect(size.z).toBeCloseTo(depth, 5);
  });

  it('names groups by part ID and meshes by part name', () => {
    const content = build(robot());
    expect(content.children.map((child) => child.name)).toEqual(['body']);
    expect(group(content, 'arm').parent?.name).toBe('body');
    expect(group(content, 'hand').parent?.name).toBe('arm');
    expect(meshOf(content, 'hand').name).toBe('Hand');
  });

  it('multiplies part colors by the object tint and keeps them under white', () => {
    const plain = materialOf(build(robot()), 'body');
    expect(plain.color.getHex()).toBe(new THREE.Color('#88bb99').getHex());
    expect(plain.metalness).toBe(0);
    expect(plain.roughness).toBeGreaterThan(0.5);
    const tinted = materialOf(build(robot(), '#ff8800'), 'body');
    expect(tinted.color.toArray()).toEqual(
      new THREE.Color('#88bb99').multiply(new THREE.Color('#ff8800')).toArray()
    );
  });

  it('transforms children by a rotated parent without inheriting its size', () => {
    const parts: ScenePart[] = [
      part({rotation: [0, 0, Math.PI / 2], size: [0.4, 0.5, 0.3]}),
      part({
        id: 'arm',
        name: 'Arm',
        parent: 'body',
        position: [0, 0.2, 0],
        rotation: [0, 0, 0],
        size: [0.1, 0.1, 0.1],
      }),
    ];
    const content = build(parts);
    const arm = group(content, 'arm').getWorldPosition(new THREE.Vector3());
    expect(arm.x).toBeCloseTo(-0.2, 5);
    expect(arm.y).toBeCloseTo(0.5, 5);
    expect(
      group(content, 'arm').getWorldQuaternion(new THREE.Quaternion()).z
    ).toBeCloseTo(Math.sin(Math.PI / 4), 5);

    const grown = parts.map((definition) =>
      definition.id === 'body'
        ? {...definition, size: [2, 3, 4] as ScenePart['size']}
        : definition
    );
    const after = build(grown)
      .getObjectByName('arm')
      ?.getWorldPosition(new THREE.Vector3());
    expect(after?.toArray()).toEqual(arm.toArray());
  });

  it('accepts parts listed before their parents', () => {
    const [body, arm, hand] = robot();
    const content = build([hand, arm, body]);
    expect(group(content, 'hand').parent?.name).toBe('arm');
    expect(
      group(content, 'hand').getWorldPosition(new THREE.Vector3()).y
    ).toBeCloseTo(0.25, 5);
  });

  it('owns fresh, detached geometry and materials per build', () => {
    const first = build(robot());
    const second = build(robot());
    expect(first.parent).toBeNull();
    expect(first).not.toBe(second);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    for (const content of [first, second]) {
      content.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        geometries.add(child.geometry);
        materials.add(child.material as THREE.Material);
      });
    }
    expect(geometries.size).toBe(6);
    expect(materials.size).toBe(6);
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
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
  });
});

describe('getProceduralBounds', () => {
  it('reserves an off-center spin without expanding along its axle', () => {
    const bounds = getProceduralBounds([
      part({
        position: [0.5, 0.1, 0],
        size: [0.2, 0.2, 0.2],
        motion: {
          kind: 'spin',
          axis: 'y',
          pivot: [-0.5, 0, 0],
          speed: -2,
        },
      }),
    ]);
    const radius = Math.hypot(0.6, 0.1);
    expect(bounds.min.x).toBeCloseTo(-radius, 9);
    expect(bounds.max.x).toBeCloseTo(radius, 9);
    expect(bounds.min.z).toBeCloseTo(-radius, 9);
    expect(bounds.max.z).toBeCloseTo(radius, 9);
    expect(bounds.min.y).toBeCloseTo(0, 9);
    expect(bounds.max.y).toBeCloseTo(0.2, 9);
  });

  it('bounds only a swing interval, including extrema between its endpoints', () => {
    const bounds = getProceduralBounds([
      part({
        size: [0.2, 1, 0.2],
        motion: {
          kind: 'swing',
          axis: 'z',
          pivot: [0, 0.5, 0],
          amplitude: 0.3,
          period: 2,
        },
      }),
    ]);
    const extent = 0.1 * Math.cos(0.3) + Math.sin(0.3);
    expect(bounds.min.x).toBeCloseTo(-extent, 9);
    expect(bounds.max.x).toBeCloseTo(extent, 9);
    expect(bounds.min.y).toBeCloseTo(1 - Math.hypot(1, 0.1), 9);
    expect(bounds.max.y).toBeCloseTo(1 + 0.1 * Math.sin(0.3), 9);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeLessThan(0.8);
  });

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

  it('composes nested moving envelopes with static descendants and other roots', () => {
    const parts = robot();
    parts[0].motion = {
      kind: 'spin',
      axis: 'y',
      pivot: [0.2, -0.1, 0],
      speed: 1.2,
    };
    parts[1].rotation = [0.2, -0.4, 0.5];
    parts[1].motion = {
      kind: 'swing',
      axis: 'x',
      pivot: [0, 0.2, 0],
      amplitude: 0.7,
      period: 2.3,
    };
    parts.push(part({id: 'stand', position: [0.8, 0.1, 0.2]}));
    const before = structuredClone(parts);
    const bounds = getProceduralBounds(parts).expandByScalar(1e-6);
    const content = build(parts);
    const player = new ProceduralMotionPlayer(content, parts);
    for (let index = 0; index < 300; index++) {
      player.update(0.07);
      expect(bounds.containsBox(boundsOf(content))).toBe(true);
    }
    expect(parts).toEqual(before);
  });

  it('measures a static hierarchy exactly while an unrelated part moves', () => {
    const staticSize = getProceduralBounds(foldedArm()).getSize(
      new THREE.Vector3()
    );
    expect(staticSize.x).toBeCloseTo(5, 5);
    expect(staticSize.y).toBeCloseTo(0.2, 5);
    expect(staticSize.z).toBeCloseTo(0.2, 5);

    const marker = part({
      id: 'marker',
      name: 'Marker',
      parent: null,
      position: [0, 0, 0],
      size: [0.1, 0.1, 0.1],
      motion: {kind: 'spin', axis: 'y', pivot: [0, 0, 0], speed: 1},
    });
    const moving = getProceduralBounds([...foldedArm(), marker]).getSize(
      new THREE.Vector3()
    );
    expect(moving.x).toBeCloseTo(5, 5);
    expect(moving.y).toBeCloseTo(0.2, 5);
    expect(moving.z).toBeCloseTo(0.2, 5);
  });

  it('sweeps a folded static chain carried by a moving ancestor', () => {
    const parts = foldedArm();
    parts[0].motion = {
      kind: 'spin',
      axis: 'y',
      pivot: [0.3, 0, 0.2],
      speed: 1.5,
    };
    const bounds = getProceduralBounds(parts);
    // The subtree only reaches its own folded extent about the axle.
    expect(bounds.getSize(new THREE.Vector3()).x).toBeLessThan(9);
    const reserved = bounds.clone().expandByScalar(1e-6);
    const content = build(parts);
    const player = new ProceduralMotionPlayer(content, parts);
    const turn = (Math.PI * 2) / 1.5;
    for (let index = 0; index < 240; index++) {
      player.update(turn / 240);
      expect(reserved.containsBox(boundsOf(content))).toBe(true);
    }
  });

  it('rejects invalid motion before returning apparently valid bounds', () => {
    expect(() =>
      getProceduralBounds([
        part({
          motion: {
            kind: 'swing',
            axis: 'x',
            pivot: [0, 0, 0],
            amplitude: 0,
            period: 2,
          },
        }),
      ])
    ).toThrow('amplitude');
  });

  it('bounds the whole hierarchy in authored coordinates without recentering', () => {
    const bounds = getProceduralBounds(robot());
    expect(bounds.min.y).toBeCloseTo(0.19, 5);
    expect(bounds.max.y).toBeCloseTo(0.75, 5);
    expect(bounds.min.x).toBeCloseTo(-0.2, 5);
    expect(bounds.max.x).toBeCloseTo(0.36, 5);
    const content = build(robot());
    const built = boundsOf(content);
    expect(built.min.toArray().map((value) => +value.toFixed(5))).toEqual(
      bounds.min.toArray().map((value) => +value.toFixed(5))
    );
    expect(built.max.toArray().map((value) => +value.toFixed(5))).toEqual(
      bounds.max.toArray().map((value) => +value.toFixed(5))
    );
  });

  it('keeps unaffected parts fixed when a part is refined or added', () => {
    const before = build(robot());
    const bodyBefore = group(before, 'body').getWorldPosition(
      new THREE.Vector3()
    );
    const refined = robot().map((definition) =>
      definition.id === 'arm'
        ? {...definition, size: [0.1, 1.2, 0.1] as ScenePart['size']}
        : definition
    );
    refined.push(
      part({
        id: 'backpack',
        name: 'Backpack',
        parent: 'body',
        position: [0, 0, -0.25],
        size: [0.3, 0.3, 0.15],
      })
    );
    const after = build(refined);
    expect(
      group(after, 'body').getWorldPosition(new THREE.Vector3()).toArray()
    ).toEqual(bodyBefore.toArray());
    expect(boundsOf(after).min.y).toBeCloseTo(-0.1, 5);
    expect(getProceduralBounds(refined).min.z).toBeCloseTo(-0.325, 5);
  });

  it('includes rotated parts conservatively', () => {
    const bounds = getProceduralBounds([
      part({
        shape: 'box',
        position: [0, 0, 0],
        rotation: [0, 0, Math.PI / 4],
        size: [1, 1, 0.2],
      }),
    ]);
    expect(bounds.max.x).toBeCloseTo(Math.SQRT2 / 2, 5);
    expect(bounds.max.y).toBeCloseTo(Math.SQRT2 / 2, 5);
    expect(bounds.max.z).toBeCloseTo(0.1, 5);
  });

  it('rejects empty, duplicated, orphaned, cyclic, and over-deep designs', () => {
    const cases: Array<[readonly ScenePart[], string | RegExp]> = [
      [[], 'at least one part'],
      [[part(), part({name: 'Copy'})], 'Duplicate'],
      [[part({parent: 'missing'})], 'missing parent'],
      [[part({parent: 'body'})], /cycle|Duplicate/],
      [
        [part({parent: 'arm'}), part({id: 'arm', name: 'Arm', parent: 'body'})],
        'cycle',
      ],
      [
        Array.from({length: MAX_PART_DEPTH + 1}, (_, index) =>
          part({
            id: `part-${index}`,
            parent: index ? `part-${index - 1}` : null,
          })
        ),
        `${MAX_PART_DEPTH} deep`,
      ],
      [[part({size: [0.1, Number.NaN, 0.1]})], 'finite pose'],
      [[part({position: [0, Number.POSITIVE_INFINITY, 0]})], 'finite pose'],
      [[part({size: [0.2, 0, 0.2]})], 'positive size'],
    ];
    for (const [parts, message] of cases) {
      expect(() => getProceduralBounds(parts)).toThrow(message);
      expect(() => createProceduralContent(parts, '#ffffff')).toThrow(message);
    }
    expect(() =>
      getProceduralBounds(
        Array.from({length: MAX_PART_DEPTH}, (_, index) =>
          part({
            id: `part-${index}`,
            parent: index ? `part-${index - 1}` : null,
          })
        )
      )
    ).not.toThrow();
  });
});
