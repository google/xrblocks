import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {
  createEnvironmentContent,
  getEnvironmentBounds,
} from './EnvironmentGeometry';
import {SCENE_TIMES_OF_DAY, type SceneEnvironment} from './SceneTypes';

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

function skyUniforms(content: THREE.Object3D) {
  const material = meshOf(content, 'sky').material;
  if (!(material instanceof THREE.ShaderMaterial)) {
    throw new Error('The sky needs an authored shader material.');
  }
  return material.uniforms;
}

function groundMaterial(content: THREE.Object3D) {
  const material = meshOf(content, 'ground').material;
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    throw new Error('The ground needs a standard material.');
  }
  return material;
}

function keyLight(content: THREE.Object3D) {
  const light = content.getObjectByName('key-light');
  if (!(light instanceof THREE.DirectionalLight)) {
    throw new Error('Missing the key light.');
  }
  return light;
}

function fillLight(content: THREE.Object3D) {
  const light = content.getObjectByName('fill-light');
  if (!(light instanceof THREE.HemisphereLight)) {
    throw new Error('Missing the fill light.');
  }
  return light;
}

function lightsOf(content: THREE.Object3D) {
  const lights: THREE.Light[] = [];
  content.traverse((object) => {
    if (object instanceof THREE.Light) lights.push(object);
  });
  return lights;
}

function boundsOf(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function luminance(color: THREE.Color) {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

/** Everything a viewer would notice about one time of day. */
function signature(content: THREE.Object3D) {
  const uniforms = skyUniforms(content);
  const key = keyLight(content);
  const fill = fillLight(content);
  return JSON.stringify({
    zenith: uniforms.zenithColor.value.getHex(),
    horizon: uniforms.horizonColor.value.getHex(),
    haze: uniforms.hazeColor.value.getHex(),
    body: uniforms.bodyColor.value.getHex(),
    bodyDirection: uniforms.bodyDirection.value.toArray(),
    bodyDetail: uniforms.bodyDetail.value,
    glow: uniforms.glowColor.value.getHex(),
    glowStrength: uniforms.glowStrength.value,
    stars: uniforms.starIntensity.value,
    key: [key.color.getHex(), key.intensity, key.position.toArray()],
    fill: [fill.color.getHex(), fill.groundColor.getHex(), fill.intensity],
    ground: [groundMaterial(content).color.getHex()],
  });
}

const INVALID: Array<[SceneEnvironment, string | RegExp]> = [
  [environment({size: [0, 6]}), 'positive ground size'],
  [environment({size: [8, -6]}), 'positive ground size'],
  [environment({size: [Number.NaN, 6]}), 'positive ground size'],
  [environment({size: [Number.POSITIVE_INFINITY, 6]}), 'positive ground size'],
  [
    environment({size: [8] as unknown as SceneEnvironment['size']}),
    'positive ground size',
  ],
  [
    environment({size: 8 as unknown as SceneEnvironment['size']}),
    'positive ground size',
  ],
  [
    environment({
      timeOfDay: 'midnight' as SceneEnvironment['timeOfDay'],
    }),
    /time of day "midnight"/,
  ],
];

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

  it('stays finite and tight next to the rendered sky backdrop', () => {
    const settings = environment({size: [10, 8]});
    const bounds = getEnvironmentBounds(settings);
    expect(
      [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
    ).toBe(true);
    const content = build(settings);
    const ground = boundsOf(meshOf(content, 'ground'));
    for (const axis of ['x', 'y', 'z'] as const) {
      expect(ground.min[axis]).toBeCloseTo(bounds.min[axis], 5);
      expect(ground.max[axis]).toBeCloseTo(bounds.max[axis], 5);
    }
    const rendered = boundsOf(content);
    // The dome is a bounded backdrop, well inside the default far plane.
    expect(rendered.max.y).toBeGreaterThan(20);
    expect(rendered.max.y).toBeLessThan(100);
    expect(bounds.max.y).toBe(0);
    expect(bounds.getSize(new THREE.Vector3()).length()).toBeLessThan(
      rendered.getSize(new THREE.Vector3()).length() / 4
    );
  });

  it('never mutates the supplied environment', () => {
    const settings = environment();
    const snapshot = JSON.parse(JSON.stringify(settings));
    const bounds = getEnvironmentBounds(settings);
    build(settings);
    bounds.max.set(99, 99, 99);
    expect(settings).toEqual(snapshot);
    expect(getEnvironmentBounds(settings).max.y).toBe(0);
  });

  it.each(INVALID)(
    'rejects unrenderable settings (%#)',
    (settings, message) => {
      expect(() => getEnvironmentBounds(settings)).toThrow(message);
      expect(() => createEnvironmentContent(settings)).toThrow(message);
    }
  );
});

describe('createEnvironmentContent', () => {
  it.each(['moonlight', 'sunrise'] as const)(
    'puts the %s celestial body in the default forward view',
    (timeOfDay) => {
      const content = build(environment({timeOfDay}));
      const camera = new THREE.PerspectiveCamera(90, 1, 0.01, 500);
      camera.position.set(0, 1.6, 6.2);
      camera.updateMatrixWorld(true);
      const projected = skyUniforms(content)
        .bodyDirection.value.clone()
        .multiplyScalar(60)
        .project(camera);
      expect(projected.z).toBeGreaterThan(-1);
      expect(projected.z).toBeLessThan(1);
      expect(projected.x).toBeGreaterThan(0);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(0.85);
      expect(keyLight(content).position.z).toBeLessThan(0);
    }
  );

  it.each(SCENE_TIMES_OF_DAY)('builds a bounded %s setting', (timeOfDay) => {
    const content = build(environment({size: [16, 9], timeOfDay}));
    expect(content.parent).toBeNull();
    expect(new Set(content.children.map((child) => child.name))).toEqual(
      new Set(['ground', 'sky', 'key-light', 'key-light-target', 'fill-light'])
    );

    const ground = meshOf(content, 'ground');
    const groundBounds = boundsOf(ground);
    const size = groundBounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(16, 5);
    expect(size.z).toBeCloseTo(9, 5);
    expect(groundBounds.max.y).toBeCloseTo(0, 6);
    expect(groundBounds.min.y).toBeGreaterThan(-0.5);
    const center = groundBounds.getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(0, 6);
    expect(center.z).toBeCloseTo(0, 6);
    expect(ground.receiveShadow).toBe(true);
    expect(ground.castShadow).toBe(false);

    const sky = meshOf(content, 'sky');
    const skyMaterial = sky.material as THREE.ShaderMaterial;
    expect(skyMaterial.side).toBe(THREE.BackSide);
    expect(skyMaterial.depthWrite).toBe(false);
    expect(skyMaterial.vertexShader).toContain('vDirection');
    expect(skyMaterial.fragmentShader).toContain('<colorspace_fragment>');
    expect(skyMaterial.fragmentShader).toContain('<tonemapping_fragment>');
    expect(skyMaterial.fragmentShader).toContain('<common>');
    expect(skyMaterial.fragmentShader).toContain('<dithering_pars_fragment>');
    expect(skyMaterial.fragmentShader).toContain('<dithering_fragment>');
    expect(skyMaterial.dithering).toBe(true);
    expect(groundMaterial(content).dithering).toBe(true);
    const skyRadius = boundsOf(sky).max.y;
    expect(skyRadius).toBeGreaterThan(20);
    expect(skyRadius).toBeLessThan(100);

    // Bounded tessellation: an environment never picks its own detail.
    expect(sky.geometry.getAttribute('position').count).toBeLessThan(1200);
    expect(ground.geometry.getAttribute('position').count).toBeLessThan(3000);
  });

  it.each(SCENE_TIMES_OF_DAY)('lights %s with two bounded lights', (time) => {
    const content = build(environment({size: [20, 20], timeOfDay: time}));
    const lights = lightsOf(content);
    expect(lights).toHaveLength(2);
    expect(lights.map((light) => light.intensity).every(Number.isFinite)).toBe(
      true
    );
    const key = keyLight(content);
    const fill = fillLight(content);
    expect(lights).toEqual(expect.arrayContaining([key, fill]));
    // Celestial lights stay outside the authored ground, never inside it.
    expect(key.position.y).toBeGreaterThan(3);
    expect(key.position.length()).toBeGreaterThan(20);
    expect(key.target.parent).toBe(content);
    expect(key.castShadow).toBe(true);
    expect(key.shadow.mapSize.x).toBeLessThanOrEqual(2048);
    expect(key.shadow.mapSize.y).toBeLessThanOrEqual(2048);
    const shadow = key.shadow.camera;
    expect(shadow.right).toBeGreaterThan(10);
    expect(shadow.right).toBeLessThanOrEqual(26);
    expect(shadow.left).toBe(-shadow.right);
    expect(shadow.top).toBe(shadow.right);
    expect(shadow.bottom).toBe(-shadow.right);
    expect(shadow.near).toBeGreaterThan(0);
    expect(shadow.far).toBeLessThanOrEqual(100);
  });

  it('gives every time of day its own sky, lights, and ground shade', () => {
    const signatures = SCENE_TIMES_OF_DAY.map((timeOfDay) =>
      signature(build(environment({timeOfDay})))
    );
    expect(new Set(signatures).size).toBe(SCENE_TIMES_OF_DAY.length);
  });

  it('reads as night, dawn, day, and dusk rather than a dimmer switch', () => {
    const settings = (timeOfDay: SceneEnvironment['timeOfDay']) =>
      environment({timeOfDay});
    const moonlight = build(settings('moonlight'));
    const sunrise = build(settings('sunrise'));
    const daylight = build(settings('daylight'));
    const sunset = build(settings('sunset'));

    // A moon and stars, not a darkened day.
    expect(skyUniforms(moonlight).starIntensity.value).toBeGreaterThan(0.5);
    expect(skyUniforms(moonlight).bodyDetail.value).toBe(1);
    expect(skyUniforms(sunrise).starIntensity.value).toBe(0);
    expect(skyUniforms(daylight).starIntensity.value).toBe(0);
    expect(skyUniforms(daylight).bodyDetail.value).toBe(0);
    expect(luminance(skyUniforms(moonlight).zenithColor.value)).toBeLessThan(
      luminance(skyUniforms(daylight).zenithColor.value) / 4
    );

    // Cool moonlight against warm low sun, and a bright overhead day.
    const key = (content: THREE.Object3D) => keyLight(content);
    expect(key(moonlight).color.b).toBeGreaterThan(key(moonlight).color.r);
    expect(key(sunrise).color.r).toBeGreaterThan(key(sunrise).color.b * 2);
    expect(key(sunset).color.r).toBeGreaterThan(key(sunset).color.b * 2);
    expect(key(moonlight).intensity).toBeLessThan(key(daylight).intensity / 2);
    expect(key(daylight).intensity).toBeGreaterThan(key(sunrise).intensity);

    // The sun sits low at dawn and dusk, high at noon, on opposite sides.
    const body = (content: THREE.Object3D) =>
      skyUniforms(content).bodyDirection.value as THREE.Vector3;
    for (const content of [moonlight, sunrise, daylight, sunset]) {
      expect(body(content).length()).toBeCloseTo(1, 5);
      expect(body(content).y).toBeGreaterThan(0);
    }
    expect(body(sunrise).y).toBeLessThan(0.3);
    expect(body(sunset).y).toBeLessThan(0.3);
    expect(body(daylight).y).toBeGreaterThan(0.6);
    expect(Math.sign(body(sunrise).x)).not.toBe(Math.sign(body(sunset).x));
    expect(skyUniforms(sunrise).glowStrength.value).toBeGreaterThan(
      skyUniforms(daylight).glowStrength.value
    );

    // Hemisphere fill follows the same palette.
    expect(fillLight(daylight).intensity).toBeGreaterThan(
      fillLight(moonlight).intensity
    );
    expect(luminance(fillLight(daylight).color)).toBeGreaterThan(
      luminance(fillLight(moonlight).color)
    );
  });

  it('shades the ground from its authored color and the time of day', () => {
    const bright = groundMaterial(
      build(environment({groundColor: '#a0a0a0', timeOfDay: 'daylight'}))
    );
    const dark = groundMaterial(
      build(environment({groundColor: '#101010', timeOfDay: 'daylight'}))
    );
    const night = groundMaterial(
      build(environment({groundColor: '#a0a0a0', timeOfDay: 'moonlight'}))
    );
    expect(luminance(bright.color)).toBeGreaterThan(luminance(dark.color));
    expect(luminance(bright.color)).toBeGreaterThan(luminance(night.color));
    expect(night.color.b).toBeGreaterThan(night.color.r);
    expect(bright.metalness).toBe(0);
    expect(bright.roughness).toBeGreaterThan(0.5);
    expect(night.roughness).not.toBe(bright.roughness);

    // Per-vertex variation keeps a large ground from reading as flat plastic.
    const shades = meshOf(
      build(environment({size: [20, 20]})),
      'ground'
    ).geometry.getAttribute('color');
    expect(shades.itemSize).toBe(3);
    expect(bright.vertexColors).toBe(true);
    const values = Array.from({length: shades.count}, (_, index) =>
      shades.getX(index)
    );
    expect(Math.min(...values)).toBeGreaterThan(0.5);
    expect(Math.max(...values)).toBeLessThanOrEqual(1.1);
    expect(new Set(values).size).toBeGreaterThan(20);
  });

  it('owns fresh resources per build and shares no caches', () => {
    const settings = environment();
    const first = build(settings);
    const second = build(settings);
    expect(meshOf(first, 'ground').geometry).not.toBe(
      meshOf(second, 'ground').geometry
    );
    expect(meshOf(first, 'sky').geometry).not.toBe(
      meshOf(second, 'sky').geometry
    );
    expect(groundMaterial(first)).not.toBe(groundMaterial(second));
    expect(meshOf(first, 'sky').material).not.toBe(
      meshOf(second, 'sky').material
    );
    expect(keyLight(first)).not.toBe(keyLight(second));
    expect(fillLight(first)).not.toBe(fillLight(second));
    expect(skyUniforms(first).zenithColor.value).not.toBe(
      skyUniforms(second).zenithColor.value
    );
    expect(skyUniforms(first).bodyDirection.value).not.toBe(
      skyUniforms(second).bodyDirection.value
    );

    // Editing one build's owned resources cannot reach another.
    skyUniforms(first).bodyDirection.value.set(0, 1, 0);
    groundMaterial(first).color.set('#ff00ff');
    expect(skyUniforms(second).bodyDirection.value.y).not.toBe(1);
    expect(groundMaterial(second).color.getHexString()).not.toBe('ff00ff');
    expect(signature(second)).toBe(signature(build(settings)));
  });

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
    expect(geometries).toHaveBeenCalledTimes(2);
    expect(materials).toHaveBeenCalledTimes(2);
    expect(lights).toHaveBeenCalledTimes(1);
  });

  it('releases every owned resource through the shared disposal helper', () => {
    const content = createEnvironmentContent(environment());
    const geometries = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materials = vi.spyOn(THREE.Material.prototype, 'dispose');
    const lights = vi.spyOn(THREE.DirectionalLight.prototype, 'dispose');
    disposeObjectTree(content);
    expect(geometries).toHaveBeenCalledTimes(2);
    expect(materials).toHaveBeenCalledTimes(2);
    expect(lights).toHaveBeenCalledTimes(1);
    expect(content.children).toEqual([]);
  });
});
