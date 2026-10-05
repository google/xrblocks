import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import type {ModelLoader} from '../../utils/ModelLoader';
import type {SimulatorDayNightLightingDefinition} from '../scene/SimulatorEnvironmentManifest';
import {DayNightCycle, stripHemisphereIrradiance} from './DayNightCycle';
import {dayNightSchedule} from './dayNightSchedule';

// Vitest runs with the repository root as the working directory.
const REPO_ROOT = process.cwd();

const LIGHTING: SimulatorDayNightLightingDefinition = {
  kind: 'dayNight',
  nightScenePath: 'https://assets.example.com/night.glb',
  pairing: 'bake-crossfade-v1',
};

interface FakeRenderer {
  isWebGLRenderer: boolean;
  autoClear: boolean;
  shadowMap: {
    enabled: boolean;
    type: THREE.ShadowMapType;
    autoUpdate: boolean;
    needsUpdate: boolean;
  };
}

function createRenderer(): FakeRenderer {
  return {
    isWebGLRenderer: true,
    autoClear: true,
    shadowMap: {
      enabled: false,
      type: THREE.BasicShadowMap,
      autoUpdate: true,
      needsUpdate: false,
    },
  };
}

/** Non-indexed quad (two triangles) from four counter-clockwise corners. */
function quadGeometry(corners: number[][]): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const i of [0, 1, 2, 0, 2, 3]) {
    positions.push(...corners[i]);
    uvs.push(0, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

function bakeMesh(
  geometry: THREE.BufferGeometry,
  materialName: string,
  map = new THREE.Texture()
): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({map});
  material.name = materialName;
  return new THREE.Mesh(geometry, material);
}

function xzQuad(x0: number, x1: number, y0: number, y1: number, z: number) {
  return [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
  ];
}

interface Fixture {
  root: THREE.Group;
  wall: THREE.Mesh;
  rug: THREE.Mesh;
  sky: THREE.Mesh;
  renderer: FakeRenderer;
  loadGLTF: ReturnType<typeof vi.fn>;
  cycle: DayNightCycle;
  wallOriginal: {
    geometry: THREE.BufferGeometry;
    material: THREE.MeshBasicMaterial;
  };
  rugOriginalMaterial: THREE.MeshBasicMaterial;
}

/**
 * Builds a miniature bake pair matching the loft's structure: a room shell
 * whose night bake carries extra window-shade triangles, a day-only rug, an
 * outdoor mesh, and the biggest-box sky.
 */
async function createFixture(): Promise<Fixture> {
  const root = new THREE.Group();
  const dayScene = new THREE.Group();
  root.add(dayScene);

  const dayMap = new THREE.Texture();
  const nightMap = new THREE.Texture();
  const wallGeometry = quadGeometry(xzQuad(0, 2, 0, 2, 0));
  const wall = bakeMesh(wallGeometry, 'Bake home office', dayMap);
  const wallOriginal = {
    geometry: wall.geometry,
    material: wall.material as THREE.MeshBasicMaterial,
  };
  dayScene.add(wall);

  const rug = bakeMesh(
    quadGeometry(xzQuad(-1, 1, -1, 1, 0.02)),
    'Day rug',
    new THREE.Texture()
  );
  const rugOriginalMaterial = rug.material as THREE.MeshBasicMaterial;
  dayScene.add(rug);

  const skyGeometry = quadGeometry([
    [-5, -5, -5],
    [5, -5, 5],
    [5, 5, 5],
    [-5, 5, -5],
  ]);
  const sky = bakeMesh(skyGeometry, 'Sky bake', new THREE.Texture());
  dayScene.add(sky);

  const outdoor = bakeMesh(
    quadGeometry(xzQuad(3, 4, 0, 1, 0.05)),
    'outside bake',
    new THREE.Texture()
  );
  dayScene.add(outdoor);

  // Night bake: same bodies plus window-shade triangles inside the wall's
  // bounds (>= 12 night-only vertex positions).
  const nightScene = new THREE.Group();
  const nightWall = bakeMesh(
    wallGeometry.clone(),
    'Bake home office',
    nightMap
  );
  const extra: number[] = [];
  for (const [y0, y1] of [
    [1, 1.15],
    [1.2, 1.35],
    [1.4, 1.55],
  ]) {
    const quad = quadGeometry(xzQuad(0.2, 0.9, y0, y1, 0.01));
    extra.push(...Array.from(quad.getAttribute('position').array));
    quad.dispose();
  }
  const nightPositions = [
    ...Array.from(nightWall.geometry.getAttribute('position').array),
    ...extra,
  ];
  const nightWallGeometry = new THREE.BufferGeometry();
  nightWallGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(nightPositions, 3)
  );
  nightWallGeometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      new Array((nightPositions.length / 3) * 2).fill(0),
      2
    )
  );
  nightWall.geometry = nightWallGeometry;
  nightScene.add(nightWall);
  nightScene.add(
    bakeMesh(skyGeometry.clone(), 'Sky bake', new THREE.Texture())
  );
  nightScene.add(
    bakeMesh(
      quadGeometry(xzQuad(3, 4, 0, 1, 0.05)),
      'outside bake',
      new THREE.Texture()
    )
  );

  const renderer = createRenderer();
  const loadGLTF = vi.fn(async () => ({scene: nightScene}));
  const cycle = await DayNightCycle.create({
    renderer,
    root,
    dayScene,
    loader: {loadGLTF} as unknown as ModelLoader,
    lighting: LIGHTING,
  });
  if (!cycle) throw new Error('expected a DayNightCycle for a WebGL renderer');
  return {
    root,
    wall,
    rug,
    sky,
    renderer,
    loadGLTF,
    cycle,
    wallOriginal,
    rugOriginalMaterial,
  };
}

function findOverlays(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.Material;
    if (material.customProgramCacheKey?.() === 'daynight-overlay')
      out.push(mesh);
  });
  return out;
}

function findSun(root: THREE.Object3D): THREE.DirectionalLight {
  let sun: THREE.DirectionalLight | undefined;
  root.traverse((object) => {
    const light = object as THREE.DirectionalLight;
    if (light.isDirectionalLight && light.castShadow) sun = light;
  });
  if (!sun) throw new Error('expected a shadow-casting sun light');
  return sun;
}

describe('DayNightCycle.create', () => {
  it('returns null for non-WebGL renderers without loading anything', async () => {
    const loadGLTF = vi.fn();
    const cycle = await DayNightCycle.create({
      renderer: {isWebGLRenderer: false},
      root: new THREE.Group(),
      dayScene: new THREE.Group(),
      loader: {loadGLTF} as unknown as ModelLoader,
      lighting: LIGHTING,
    });
    expect(cycle).toBeNull();
    expect(loadGLTF).not.toHaveBeenCalled();
  });
});

describe('DayNightCycle', () => {
  it('loads the night bake lazily on preload', async () => {
    const fixture = await createFixture();
    expect(fixture.loadGLTF).not.toHaveBeenCalled();
    await fixture.cycle.preload();
    expect(fixture.loadGLTF).toHaveBeenCalledWith({
      url: LIGHTING.nightScenePath,
      renderer: fixture.renderer,
    });
    expect(fixture.cycle.preloaded).toBe(true);
  });

  it('fires the preload from the first scrub', async () => {
    const fixture = await createFixture();
    fixture.cycle.setTimeOfDay(0.5);
    await fixture.cycle.preload();
    expect(fixture.loadGLTF).toHaveBeenCalledTimes(1);
    expect(fixture.cycle.timeOfDay).toBe(0.5);
  });

  it('clamps the scrub to [0, 1]', async () => {
    const fixture = await createFixture();
    fixture.cycle.setTimeOfDay(2);
    expect(fixture.cycle.timeOfDay).toBe(1);
    fixture.cycle.setTimeOfDay(-1);
    expect(fixture.cycle.timeOfDay).toBe(0);
  });

  it('blends paired bodies and drives the schedule state', async () => {
    const fixture = await createFixture();
    await fixture.cycle.preload();
    const {wall, rug, root} = fixture;

    // MAIN BODY: day geometry with the day/night blended texture.
    const blend = wall.material as THREE.MeshBasicMaterial;
    expect(blend).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(blend.map).toBe(fixture.wallOriginal.material.map);
    expect(wall.geometry).not.toBe(fixture.wallOriginal.geometry);

    fixture.cycle.setTimeOfDay(0.5);
    const values = dayNightSchedule(0.5);
    expect(blend.userData.pendingMixU).toBeCloseTo(values.mixU);

    // Day-only rug fades out before the night half.
    const rugMaterial = rug.material as THREE.MeshBasicMaterial;
    expect(rugMaterial.transparent).toBe(true);
    expect(rugMaterial.polygonOffset).toBe(true);
    expect(rugMaterial.opacity).toBeCloseTo(values.rugOpacity);
    fixture.cycle.setTimeOfDay(1);
    expect(rugMaterial.opacity).toBeCloseTo(0);
    expect(rug.visible).toBe(false);

    // Sun arc: zero additive strength at both endpoints.
    const sun = findSun(root);
    fixture.cycle.setTimeOfDay(0);
    expect(sun.intensity).toBe(0);
    fixture.cycle.setTimeOfDay(1);
    expect(sun.intensity).toBe(0);
    fixture.cycle.setTimeOfDay(0.5);
    expect(sun.intensity).toBeCloseTo(dayNightSchedule(0.5).sunIntensity);
  });

  it('rolls the night-only blinds about their housing top', async () => {
    const fixture = await createFixture();
    await fixture.cycle.preload();
    const {root} = fixture;
    const shade = root.children.find(
      (child) =>
        child instanceof THREE.Mesh && Math.abs(child.position.y - 1.55) < 1e-3 // float32-rounded topY
    ) as THREE.Mesh | undefined;
    expect(shade).toBeInstanceOf(THREE.Mesh);

    fixture.cycle.setTimeOfDay(0);
    expect(shade!.visible).toBe(false);
    fixture.cycle.setTimeOfDay(0.5);
    const values = dayNightSchedule(0.5);
    expect(shade!.visible).toBe(true);
    expect((shade!.material as THREE.Material).opacity).toBeCloseTo(
      values.blindsHardware
    );
    expect(shade!.scale.y).toBeCloseTo(0.04 + 0.96 * values.blindsRoll);
    fixture.cycle.setTimeOfDay(1);
    expect(shade!.scale.y).toBeCloseTo(1);
  });

  it('hides the additive overlays at both endpoints', async () => {
    const fixture = await createFixture();
    await fixture.cycle.preload();
    const overlays = findOverlays(fixture.root);
    // One shared-geometry overlay per sunlit body plus one per blind; the
    // outdoor and sky bodies stay baked and get none.
    expect(overlays).toHaveLength(2);

    fixture.cycle.setTimeOfDay(0);
    expect(overlays.every((overlay) => !overlay.visible)).toBe(true);
    fixture.cycle.setTimeOfDay(1);
    expect(overlays.every((overlay) => !overlay.visible)).toBe(true);
    fixture.cycle.setTimeOfDay(0.5);
    expect(overlays.every((overlay) => overlay.visible)).toBe(true);
    const material = overlays[0].material as THREE.MeshPhongMaterial;
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    // Additive layer is lit by the rig lights only.
    expect(material.customProgramCacheKey()).toBe('daynight-overlay');
  });

  it('refreshes the sun shadow map per scrub and restores renderer state', async () => {
    const fixture = await createFixture();
    await fixture.cycle.preload();
    const {renderer, root} = fixture;
    const sun = findSun(root);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    // Global autoUpdate is left on so app-owned lights keep updating their
    // shadows; only the sun's own map is refreshed per time of day.
    expect(renderer.shadowMap.autoUpdate).toBe(true);
    expect(sun.shadow.autoUpdate).toBe(false);
    expect(sun.shadow.needsUpdate).toBe(true);

    sun.shadow.needsUpdate = false;
    fixture.cycle.setTimeOfDay(0.75);
    expect(sun.shadow.needsUpdate).toBe(true);

    fixture.cycle.dispose();
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(renderer.shadowMap.type).toBe(THREE.BasicShadowMap);
  });

  it('restores the replaced day materials and geometries on dispose', async () => {
    const fixture = await createFixture();
    await fixture.cycle.preload();
    fixture.cycle.dispose();
    expect(fixture.wall.material).toBe(fixture.wallOriginal.material);
    expect(fixture.wall.geometry).toBe(fixture.wallOriginal.geometry);
    expect(fixture.rug.material).toBe(fixture.rugOriginalMaterial);
  });

  it('keeps the baked material flags on the blend material', async () => {
    const fixture = await createFixture();
    // The real bake materials are DoubleSide (the sky dome is seen from
    // inside); a fresh material would flip faces the moment the cycle turns
    // on. Every authored flag must survive the swap.
    const base = fixture.wall.material as THREE.MeshBasicMaterial;
    base.side = THREE.DoubleSide;
    base.toneMapped = false;
    base.color.setHex(0xff8800);
    await fixture.cycle.preload();
    const blend = fixture.wall.material as THREE.MeshBasicMaterial;
    expect(blend).not.toBe(base);
    expect(blend.side).toBe(THREE.DoubleSide);
    expect(blend.toneMapped).toBe(false);
    expect(blend.color.getHex()).toBe(0xff8800);
  });

  it('crossfades a paired sky in place instead of a second sky sphere', async () => {
    const fixture = await createFixture();
    await fixture.cycle.preload();
    const skyMaterial = fixture.sky.material as THREE.MeshBasicMaterial;
    expect(skyMaterial.customProgramCacheKey?.()).toBe('daynight-blend');
    // A sky clone would z-fight the original the moment the cycle turns on.
    let clones = 0;
    fixture.root.traverse((object) => {
      const material = (object as THREE.Mesh).material as
        | THREE.Material
        | undefined;
      if (material?.customProgramCacheKey?.() === 'daynight-sky') clones++;
    });
    expect(clones).toBe(0);
  });

  it('restores the node transforms on dispose', async () => {
    const fixture = await createFixture();
    const {wall} = fixture;
    wall.position.set(0.5, 1, -2);
    wall.rotation.set(0, 0.3, 0);
    wall.scale.set(1, 2, 1);
    await fixture.cycle.preload();
    // The bake resets the node; the transform lives in the geometry now.
    expect(wall.position.lengthSq()).toBe(0);
    fixture.cycle.dispose();
    // Restoring the original geometry without the node transform would leave
    // every mesh scrambled.
    expect(wall.position.toArray()).toEqual([0.5, 1, -2]);
    expect(wall.scale.toArray()).toEqual([1, 2, 1]);
    expect(wall.rotation.y).toBeCloseTo(0.3);
  });
});

describe('stripHemisphereIrradiance', () => {
  it('removes only the hemisphere accumulation from the lighting chunk', () => {
    const stripped = stripHemisphereIrradiance(
      THREE.ShaderChunk.lights_fragment_begin
    );
    expect(stripped).toBeTruthy();
    expect(stripped).not.toContain('getHemisphereLightIrradiance');
    expect(stripped).toContain('NUM_DIR_LIGHTS');
  });

  it('fails safe on unexpected chunk shapes', () => {
    expect(stripHemisphereIrradiance('no markers here')).toBeNull();
  });

  it('patches the stock Phong fragment shader', () => {
    expect(THREE.ShaderLib.phong.fragmentShader).toContain(
      '#include <lights_fragment_begin>'
    );
    expect(
      stripHemisphereIrradiance(THREE.ShaderChunk.lights_fragment_begin)
    ).not.toBe(THREE.ShaderChunk.lights_fragment_begin);
  });
});

describe('lazy day/night chunking', () => {
  it('loads the DayNightCycle module only through a dynamic import', () => {
    const manager = readFileSync(
      path.join(
        REPO_ROOT,
        'src',
        'simulator',
        'scene',
        'SimulatorEnvironmentManager.ts'
      ),
      'utf8'
    );
    expect(manager).toContain("await import('../lighting/DayNightCycle.js')");
    // Only the type may be imported statically so the bundle stays lazy.
    expect(manager).toContain(
      "import type {DayNightCycle} from '../lighting/DayNightCycle.js'"
    );
    expect(manager).not.toMatch(/import \{DayNightCycle\} from/);

    const barrel = readFileSync(
      path.join(REPO_ROOT, 'src', 'xrblocks.ts'),
      'utf8'
    );
    expect(barrel).not.toContain('lighting/DayNightCycle');
  });

  it('keeps the pairing code out of the main chunk', () => {
    const mainChunk = path.join(REPO_ROOT, 'build', 'xrblocks.js');
    if (!existsSync(mainChunk)) return; // source-level proof above still runs
    const bundle = readFileSync(mainChunk, 'utf8');
    expect(bundle).not.toContain('clusterBlinds');
  });
});
