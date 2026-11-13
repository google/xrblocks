import * as THREE from 'three';
import {GLTFLoader, type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Options} from '../../core/Options';
import {WaitFrame} from '../../core/components/WaitFrame';
import {World} from '../../world/World';
import {SimulatorOptions} from '../SimulatorOptions';
import {SimulatorNavMesh} from '../internal/navmesh/SimulatorNavMesh';
import {SimulatorEnvironmentManager} from './SimulatorEnvironmentManager';
import {SimulatorObjectsManager} from './SimulatorObjects';
import {SimulatorScene} from './SimulatorScene';
import {SimulatorWorld} from './SimulatorWorld';

const dayURL = 'https://example.com/day.glb';
const nightURL = 'https://example.com/night.glb';
function environment(scenePath = dayURL, lighting = true) {
  return {
    manifestPath: `data:application/json,${encodeURIComponent(
      JSON.stringify({
        scenePath,
        ...(lighting
          ? {
              lighting: {
                kind: 'dayNight',
                nightScenePath: nightURL,
                pairing: 'bake-crossfade-v1',
              },
            }
          : {}),
      })
    )}`,
  };
}
function asset() {
  const scene = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial({map: new THREE.Texture()})
  );
  scene.add(mesh);
  return {scene, mesh};
}
async function fixture() {
  const renderer = {
    isWebGLRenderer: true,
    extensions: {has: () => false},
    shadowMap: {enabled: false, type: THREE.BasicShadowMap},
  };
  const scene = new SimulatorScene();
  const objects = new SimulatorObjectsManager();
  objects.init(renderer as never);
  const navMesh = new SimulatorNavMesh();
  const simulatorWorld = new SimulatorWorld();
  const world = new World();
  const options = new Options();
  options.world.enabled = false;
  options.world.planes.enabled = false;
  const timer = new THREE.Timer();
  await world.init({
    options: options.world,
    camera: new THREE.PerspectiveCamera(),
    timer,
    waitFrame: new WaitFrame(),
  });
  await simulatorWorld.init(options, world);
  const manager = new SimulatorEnvironmentManager(
    new SimulatorOptions(),
    renderer as never,
    scene,
    objects,
    navMesh,
    simulatorWorld,
    undefined,
    () => {}
  );
  return {
    manager,
    scene,
    dispose() {
      manager.dispose();
      world.dispose();
      timer.dispose();
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SimulatorEnvironmentManager', () => {
  it('loads night resources on demand and restores the day scene when disabled', async () => {
    const requests: string[] = [];
    vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((url, loaded) => {
      requests.push(url);
      loaded({scene: asset().scene} as GLTF);
    });
    const f = await fixture();
    try {
      await f.manager.setEnvironment(environment());
      expect(requests).toEqual([dayURL]);
      const dayMesh = f.scene.gltf!.scene.children[0] as THREE.Mesh;
      const original = dayMesh.material;
      await f.manager.setTimeOfDay(0.5);
      await f.manager.preloadDayNight();
      expect(requests).toEqual([dayURL, nightURL]);
      expect(f.manager.timeOfDay).toBe(0.5);
      expect(dayMesh.material).not.toBe(original);
      await f.manager.setDayNightEnabled(false);
      expect(dayMesh.material).toBe(original);
      expect(f.manager.dayNightEnabled).toBe(false);
      await f.manager.setEnvironment(environment(dayURL, false));
      await f.manager.setDayNightEnabled(true);
      expect(requests).toEqual([dayURL, nightURL, dayURL]);
      expect(f.manager.dayNightEnabled).toBe(false);
    } finally {
      f.dispose();
    }
  });

  it('disposes a stale load without replacing the newer environment', async () => {
    const stale = asset();
    const current = asset();
    const staleReleased = vi.fn();
    const currentReleased = vi.fn();
    stale.mesh.geometry.addEventListener('dispose', staleReleased);
    current.mesh.geometry.addEventListener('dispose', currentReleased);
    let finishOld: (() => void) | undefined;
    vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation((url, loaded) => {
      if (url.endsWith('old.glb'))
        finishOld = () => {
          loaded({scene: stale.scene} as GLTF);
        };
      else loaded({scene: current.scene} as GLTF);
    });
    const f = await fixture();
    let old: Promise<void> | undefined;
    try {
      old = f.manager.setEnvironment(
        environment('https://example.com/old.glb', false)
      );
      await vi.waitFor(() => {
        expect(finishOld).toBeDefined();
      });
      const active = environment(dayURL, false);
      await f.manager.setEnvironment(active);
      finishOld!();
      await old;
      expect(f.manager.activeEnvironment).toBe(active);
      expect(f.scene.gltf?.scene).toBe(current.scene);
      expect(stale.scene.parent?.parent).not.toBe(f.scene);
      expect(staleReleased).toHaveBeenCalledOnce();
      expect(currentReleased).not.toHaveBeenCalled();
      f.manager.dispose();
      expect(currentReleased).toHaveBeenCalledOnce();
      expect(f.scene.environmentRoot).toBeUndefined();
    } finally {
      finishOld?.();
      await old;
      f.dispose();
    }
  });
});
