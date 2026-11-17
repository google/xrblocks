import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {
  createEnvironmentContent,
  getEnvironmentBounds,
} from './EnvironmentGeometry';
import {type SceneEnvironment} from './SceneTypes';

const resources: THREE.Object3D[] = [];

function environment(
  overrides: Partial<SceneEnvironment> = {}
): SceneEnvironment {
  return {
    size: [14, 12],
    groundColor: '#40513a',
    timeOfDay: 'moonlight',
    ...overrides,
  };
}

function build(settings: SceneEnvironment = environment()) {
  const content = createEnvironmentContent(settings);
  resources.push(content);
  return content;
}

function meshOf(content: THREE.Object3D, name: string) {
  const mesh = content.getObjectByName(name);
  if (!(mesh instanceof THREE.Mesh)) throw new Error(`Missing mesh "${name}".`);
  return mesh;
}

/** Everything a viewer would notice about one time of day. */

afterEach(() => {
  for (const object of resources.splice(0)) disposeObjectTree(object);
  vi.restoreAllMocks();
});

describe('getEnvironmentBounds', () => {
  it.each([
    [4, 4],
    [14, 12],
    [20, 20],
  ])('covers only the %sx%s ground with its top at Y=0', (width, depth) => {
    const bounds = getEnvironmentBounds(environment({size: [width, depth]}));
    expect(bounds.max.toArray()).toEqual([width / 2, 0, depth / 2]);
    expect(bounds.min.x).toBeCloseTo(-width / 2, 6);
    expect(bounds.min.z).toBeCloseTo(-depth / 2, 6);
    expect(bounds.min.y).toBeLessThan(0);
    expect(bounds.min.y).toBeGreaterThan(-0.5);
  });
});

describe('createEnvironmentContent', () => {
  it('keeps the backdrop out of pointer hits', () => {
    const content = build();
    expect(content.xb?.pointerEvents).toBe('none');
    expect(meshOf(content, 'sky').xb?.pointerEvents).toBe('none');
    expect(meshOf(content, 'ground').xb?.pointerEvents).toBe('none');
    const interactive: string[] = [];
    content.traverse((object) => {
      let current: THREE.Object3D | null = object;
      while (current) {
        if (current.xb?.pointerEvents === 'none') return;
        current = current.parent;
      }
      interactive.push(object.name || object.type);
    });
    expect(interactive).toEqual([]);
  });

  it('disposes what it built when construction fails', () => {
    const geometries = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materials = vi.spyOn(THREE.Material.prototype, 'dispose');
    const lights = vi.spyOn(THREE.DirectionalLight.prototype, 'dispose');
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(() => {
      throw new Error('Attach failed');
    });
    expect(() => createEnvironmentContent(environment())).toThrow(
      'Attach failed'
    );
    expect(geometries).toHaveBeenCalled();
    expect(materials).toHaveBeenCalled();
    expect(lights).toHaveBeenCalled();
  });
});
