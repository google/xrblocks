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

function instancedMeshes(content: THREE.Object3D) {
  const meshes: THREE.InstancedMesh[] = [];
  content.traverse((child) => {
    if (child instanceof THREE.InstancedMesh) meshes.push(child);
  });
  return meshes;
}

function matricesOf(mesh: THREE.InstancedMesh) {
  return Array.from({length: mesh.count}, (_, index) => {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    return matrix.toArray();
  });
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
function anchorsOf(mesh: THREE.InstancedMesh) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  return Array.from({length: mesh.count}, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    return position
      .clone()
      .sub(
        new THREE.Vector3(0, 1, 0)
          .applyQuaternion(quaternion)
          .multiplyScalar(scale.y / 2)
      );
  });
}

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

  it('builds a pond as a bed, rippled water, a banked shore, and rim stones', () => {
    const definition = pond();
    const content = build(definition, '#2f5f7a');
    expect(content.name).toBe('pond');
    expect(content.children.map((child) => child.name)).toEqual([
      'pond-bed',
      'pond-water',
      'pond-bank',
      'pond-stones',
    ]);

    const water = meshOf(content, 'pond-water');
    const material = water.material as THREE.MeshPhysicalMaterial;
    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.roughness).toBeLessThan(0.2);
    expect(material.color.getHex()).toBe(new THREE.Color('#2f5f7a').getHex());
    const surface = renderedBounds(water);
    expect(surface.max.x).toBeCloseTo(definition.size[0] / 2, 6);
    expect(surface.max.z).toBeCloseTo(definition.size[1] / 2, 6);
    // Static ripples, not a flat plate, and never a dry rim.
    expect(surface.max.y - surface.min.y).toBeGreaterThan(0.001);
    expect(surface.min.y).toBeGreaterThan(
      renderedBounds(meshOf(content, 'pond-bed')).max.y
    );

    const bank = renderedBounds(meshOf(content, 'pond-bank'));
    expect(bank.max.x).toBeCloseTo(
      definition.size[0] / 2 + definition.bankWidth,
      6
    );
    // The shore meets the flat ground instead of floating above it.
    expect(bank.min.y).toBeCloseTo(0, 9);
    expect(bank.max.y).toBeGreaterThan(surface.max.y);

    const stones = instancedMeshes(content);
    expect(stones).toHaveLength(1);
    expect(stones[0].count).toBeGreaterThanOrEqual(10);
    expect(stones[0].instanceColor).toBeTruthy();
    expect(renderedBounds(stones[0]).min.y).toBeGreaterThanOrEqual(-1e-9);
    expect(matricesOf(stones[0])).toEqual(
      matricesOf(instancedMeshes(build(pond()))[0])
    );
  });

  it('winds a gravel walkway with a shoulder through every authored point', () => {
    const definition = path();
    const content = build(definition);
    expect(content.children.map((child) => child.name)).toEqual([
      'path-shoulder',
      'path-surface',
    ]);
    const surface = meshOf(content, 'path-surface');
    const position = surface.geometry.getAttribute('position');
    // Curved sampling, not one quad per authored segment.
    expect(position.count).toBeGreaterThan(definition.points.length * 8);
    expect(surface.geometry.getAttribute('color')).toBeTruthy();
    expect((surface.material as THREE.MeshStandardMaterial).vertexColors).toBe(
      true
    );

    const left = new THREE.Vector3();
    const right = new THREE.Vector3();
    const centers: THREE.Vector3[] = [];
    for (let index = 0; index < position.count; index += 2) {
      left.fromBufferAttribute(position, index);
      right.fromBufferAttribute(position, index + 1);
      expect(left.distanceTo(right)).toBeCloseTo(definition.width, 6);
      expect(left.y).toBeCloseTo(right.y, 9);
      centers.push(left.clone().lerp(right, 0.5));
    }
    for (const [x, z] of definition.points) {
      const nearest = Math.min(
        ...centers.map((center) =>
          center.distanceTo(new THREE.Vector3(x, center.y, z))
        )
      );
      expect(nearest).toBeLessThan(1e-6);
    }

    const shoulder = renderedBounds(meshOf(content, 'path-shoulder'));
    const walkway = renderedBounds(surface);
    expect(shoulder.min.y).toBeLessThan(walkway.min.y);
    expect(
      shoulder.containsBox(
        walkway.clone().expandByVector(new THREE.Vector3(0, -0.05, 0))
      )
    ).toBe(true);
  });

  it.each(SCENE_SCATTER_STYLES)(
    'instances a bounded, deterministic %s planting',
    (style) => {
      const definition = scatter({style, count: 9, height: 1.8});
      const content = build(definition);
      expect(content.name).toBe('scatter');
      const meshes = instancedMeshes(content);
      expect(meshes.length).toBeGreaterThanOrEqual(2);
      expect(content.children).toHaveLength(meshes.length);
      for (const mesh of meshes) {
        expect(mesh.name.startsWith(`${style}-`)).toBe(true);
        expect(mesh.count).toBe(definition.count);
        expect(mesh.instanceColor?.count).toBe(definition.count);
        // A specimen is a stack of components, never one repeated cone.
        expect(matricesOf(mesh)[0]).not.toEqual(matricesOf(mesh)[1]);
      }
      const repeat = instancedMeshes(build(definition));
      expect(repeat.map(matricesOf)).toEqual(meshes.map(matricesOf));
      expect(
        instancedMeshes(build(scatter({style, count: 9, seed: 18}))).map(
          matricesOf
        )
      ).not.toEqual(meshes.map(matricesOf));
    }
  );

  it('gives a tree a wooden trunk under a tinted layered canopy', () => {
    const content = build(scatter(), '#88cc66');
    const foliage = new THREE.Color('#88cc66');
    const trunk = meshOf(content, 'tree-trunk')
      .material as THREE.MeshStandardMaterial;
    expect(trunk.color.getHex()).not.toBe(foliage.getHex());
    expect(trunk.color.r).toBeGreaterThan(trunk.color.b);

    const canopy = instancedMeshes(content).filter((mesh) =>
      mesh.name.startsWith('tree-canopy')
    );
    expect(canopy.length).toBeGreaterThanOrEqual(3);
    const middle = canopy[1].material as THREE.MeshStandardMaterial;
    expect(middle.color.getHex()).toBe(foliage.getHex());
    // Layers stack up the trunk rather than sharing one center.
    const heights = canopy.map((mesh) => renderedBounds(mesh).max.y);
    expect(heights[0]).toBeLessThan(heights[heights.length - 1]);
    const trunkBounds = renderedBounds(meshOf(content, 'tree-trunk'));
    expect(trunkBounds.min.y).toBeLessThan(0.05);
    expect(renderedBounds(canopy[0]).min.y).toBeGreaterThan(trunkBounds.min.y);
  });

  it('keeps placed specimens when the count grows or the height changes', () => {
    const before = anchorsOf(
      meshOf(build(scatter({count: 5})), 'tree-trunk') as THREE.InstancedMesh
    );
    const grown = anchorsOf(
      meshOf(build(scatter({count: 12})), 'tree-trunk') as THREE.InstancedMesh
    );
    expect(grown).toHaveLength(12);
    for (const [index, anchor] of before.entries()) {
      expect(grown[index].distanceTo(anchor)).toBeLessThan(1e-9);
    }
    const taller = anchorsOf(
      meshOf(
        build(scatter({count: 5, height: 4.5})),
        'tree-trunk'
      ) as THREE.InstancedMesh
    );
    for (const [index, anchor] of before.entries()) {
      expect(taller[index].x).toBeCloseTo(anchor.x, 6);
      expect(taller[index].z).toBeCloseTo(anchor.z, 6);
      expect(anchor.y).toBeCloseTo(0, 6);
    }
    // A wider planting area intentionally spreads the same sequence.
    const spread = anchorsOf(
      meshOf(
        build(scatter({count: 5, size: [8, 6]})),
        'tree-trunk'
      ) as THREE.InstancedMesh
    );
    for (const [index, anchor] of before.entries()) {
      expect(spread[index].x).toBeCloseTo(anchor.x * 2, 6);
      expect(spread[index].z).toBeCloseTo(anchor.z * 2, 6);
    }
  });

  it('casts and receives shadows where they read', () => {
    for (const definition of RECIPES) {
      const content = build(definition);
      content.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        expect(child.receiveShadow).toBe(true);
        expect(child.castShadow).toBe(child instanceof THREE.InstancedMesh);
      });
    }
  });

  it('owns fresh, detached, disposable resources for every build', () => {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    let meshes = 0;
    for (const definition of [...RECIPES, ...RECIPES]) {
      const content = build(definition);
      expect(content.parent).toBeNull();
      content.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        meshes++;
        geometries.add(child.geometry);
        materials.add(child.material as THREE.Material);
      });
    }
    expect(geometries.size).toBe(meshes);
    expect(materials.size).toBe(meshes);

    const content = build(pond());
    const stones = instancedMeshes(content).map((mesh) =>
      vi.spyOn(mesh, 'dispose')
    );
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const material = vi.spyOn(THREE.Material.prototype, 'dispose');
    disposeObjectTree(content);
    expect(geometry).toHaveBeenCalledTimes(4);
    expect(material).toHaveBeenCalledTimes(4);
    for (const dispose of stones) expect(dispose).toHaveBeenCalled();
    expect(content.children).toHaveLength(0);
  });

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
    expect(geometry).toHaveBeenCalledTimes(4);
    expect(material).toHaveBeenCalledTimes(4);
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

  it('measures in authored coordinates without recentering a feature', () => {
    const offset = path({
      points: [
        [1.5, 2],
        [3, 2.5],
        [4, 4],
      ],
      width: 0.5,
    });
    const bounds = getLandscapeBounds(offset);
    expect(bounds.min.x).toBeGreaterThan(1);
    expect(bounds.min.z).toBeGreaterThan(1.5);
    expect(bounds.max.x).toBeGreaterThan(4);
    expect(bounds.min.y).toBe(0);
    const content = build(offset);
    expect(content.position.toArray()).toEqual([0, 0, 0]);
    expect(
      renderedBounds(content).getCenter(new THREE.Vector3()).x
    ).toBeGreaterThan(1);
  });

  it('reserves the bank, the shoulder, and the foliage overhang', () => {
    const water = pond({size: [2, 2], bankWidth: 0.5});
    expect(getLandscapeBounds(water).max.x).toBeGreaterThan(1.5);
    const walkway = path({
      points: [
        [-1, 0],
        [1, 0],
      ],
      width: 0.5,
    });
    const walkwayBounds = getLandscapeBounds(walkway);
    expect(walkwayBounds.max.z).toBeGreaterThan(0.25);
    expect(walkwayBounds.max.x).toBeGreaterThan(1);
    // Planting size positions centers; canopies hang past the area edge.
    const grove = getLandscapeBounds(scatter({size: [4, 4], height: 3}));
    expect(grove.max.x).toBeGreaterThan(2.3);
    expect(grove.max.y).toBeGreaterThan(2.9);
    expect(grove.max.y).toBeLessThan(3.2);
  });

  it('allocates no geometry or materials while measuring', () => {
    const attribute = vi.spyOn(THREE.BufferGeometry.prototype, 'setAttribute');
    const values = vi.spyOn(THREE.Material.prototype, 'setValues');
    for (const definition of RECIPES) {
      expect(getLandscapeBounds(definition).isEmpty()).toBe(false);
    }
    expect(attribute).not.toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
    build(pond());
    expect(attribute).toHaveBeenCalled();
    expect(values).toHaveBeenCalled();
  });

  it('never modifies the recipe it is given', () => {
    for (const definition of RECIPES) {
      const before = structuredClone(definition);
      getLandscapeBounds(definition);
      build(definition);
      expect(definition).toEqual(before);
    }
  });

  it('accepts an exactly authored minimum gap despite float round-off', () => {
    // -10 to -9.98 measures 0.0199999999999996 in binary floating point.
    const edge = path({
      points: [
        [-10, 0],
        [-9.98, 0],
        [-9.96, 0.02],
      ],
      width: 0.4,
    });
    expect(() => getLandscapeBounds(edge)).not.toThrow();
    const content = build(edge);
    expect(content.children.length).toBeGreaterThan(0);
    expect(
      getLandscapeBounds(edge)
        .expandByScalar(1e-6)
        .containsBox(renderedBounds(content))
    ).toBe(true);
  });

  it('rejects malformed recipes from both entry points', () => {
    const cases: Array<[SceneLandscape, string | RegExp]> = [
      [{kind: 'lake'} as unknown as SceneLandscape, 'Unsupported landscape'],
      [pond({size: [Number.NaN, 2]}), 'finite'],
      [pond({size: [3, 0]}), 'water size'],
      [pond({size: [3, 21]}), 'water size'],
      [pond({bankWidth: 0}), 'bank'],
      [pond({bankWidth: 1.5}), 'bank'],
      [path({points: [[0, 0]]}), '2 to 12 points'],
      [
        path({
          points: Array.from({length: 13}, (_, index) => [index * 0.5, 0]),
        }),
        '2 to 12 points',
      ],
      [
        path({
          points: [
            [0, 0],
            [0, 0.01],
            [1, 1],
          ],
        }),
        'at least 0.02 meters apart',
      ],
      [
        path({
          points: [
            [0, 0],
            [0, 0],
          ],
        }),
        'at least 0.02 meters apart',
      ],
      [
        path({
          points: [
            [0, 0],
            [11, 0],
          ],
        }),
        'within 10 meters',
      ],
      [
        path({
          points: [
            [0, 0],
            [1, Number.POSITIVE_INFINITY],
          ],
        }),
        'finite',
      ],
      [path({width: 0}), 'wider than 0'],
      [path({width: 4}), 'at most 3 meters'],
      [scatter({style: 'bamboo' as SceneScatter['style']}), 'scatter style'],
      [scatter({count: 0}), 'whole count'],
      [scatter({count: 2.5}), 'whole count'],
      [scatter({count: 129}), 'whole count'],
      [scatter({seed: -1}), 'whole seed'],
      [scatter({seed: 1.5}), 'whole seed'],
      [scatter({height: 0}), 'taller than 0'],
      [scatter({height: 7}), 'at most 6 meters'],
      [scatter({size: [4, Number.NaN]}), 'finite'],
      [
        scatter({size: [4, 3, 2] as unknown as SceneScatter['size']}),
        'finite planting',
      ],
    ];
    for (const [definition, message] of cases) {
      expect(() => getLandscapeBounds(definition)).toThrow(message);
      expect(() => createLandscapeContent(definition, '#6f8f7a')).toThrow(
        message
      );
    }
    expect(() =>
      getLandscapeBounds(
        path({points: Array.from({length: 12}, (_, index) => [index * 0.5, 0])})
      )
    ).not.toThrow();
  });
});
