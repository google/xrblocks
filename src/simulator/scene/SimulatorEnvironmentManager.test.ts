import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {WebGLOrWebGPURenderer} from '../../core/RendererTypes';
import type {SimulatorOptions} from '../SimulatorOptions';
import {SimulatorEnvironmentManager} from './SimulatorEnvironmentManager';
import type {
  ResolvedSimulatorSceneManifest,
  SimulatorDayNightLightingDefinition,
} from './SimulatorEnvironmentManifest';
import {SimulatorScene} from './SimulatorScene';
import type {SimulatorObjectsManager} from './SimulatorObjects';
import type {SimulatorNavMesh} from '../internal/navmesh/SimulatorNavMesh';
import type {SimulatorWorld} from './SimulatorWorld';

const hoisted = vi.hoisted(() => ({
  loadGLTF: undefined as unknown as (options: {
    url: string;
    renderer?: unknown;
  }) => Promise<{scene: THREE.Group}>,
}));

vi.mock('../../utils/ModelLoader', () => ({
  ModelLoader: class {
    async loadGLTF(options: {url: string; renderer?: unknown}) {
      return hoisted.loadGLTF(options);
    }
  },
}));

const DAY_URL = 'https://assets.example.com/day.glb';
const NIGHT_URL = 'https://assets.example.com/night.glb';

function manifestPath() {
  return `data:application/json,${encodeURIComponent(
    JSON.stringify({
      name: 'Daytime Loft',
      scenePath: DAY_URL,
      lighting: {
        kind: 'dayNight',
        nightScenePath: NIGHT_URL,
        pairing: 'bake-crossfade-v1',
      },
    })
  )}`;
}

function createManager() {
  const simulatorScene = new SimulatorScene();
  const simulatorObjects = {
    onChanged: undefined as (() => void) | undefined,
    prepareObjects: vi.fn(async () => ({records: []})),
    reset: vi.fn(),
    setEnvironmentGroup: vi.fn(),
    activatePrepared: vi.fn(),
    getMeshRecords: vi.fn(() => []),
    dispose: vi.fn(),
  };
  const navMesh = {
    prepareEnvironment: vi.fn(async () => ({debugGeometry: undefined})),
    commitEnvironment: vi.fn(),
    dispose: vi.fn(),
  };
  const simulatorWorld = {
    preparePlanes: vi.fn(async () => ({})),
    commitPlanes: vi.fn(),
    commitMeshes: vi.fn(),
    suspendSimulatorSensing: vi.fn(),
    restoreSimulatorPlanes: vi.fn(),
  };
  const renderer = {
    isWebGLRenderer: true,
    autoClear: true,
    shadowMap: {
      enabled: false,
      type: THREE.BasicShadowMap,
      autoUpdate: true,
      needsUpdate: false,
    },
  };
  const setVideoPath = vi.fn();
  const manager = new SimulatorEnvironmentManager(
    {environments: []} as unknown as SimulatorOptions,
    renderer as unknown as WebGLOrWebGPURenderer,
    simulatorScene,
    simulatorObjects as unknown as SimulatorObjectsManager,
    navMesh as unknown as SimulatorNavMesh,
    simulatorWorld as unknown as SimulatorWorld,
    undefined,
    setVideoPath
  );
  return {manager, simulatorScene};
}

describe('SimulatorEnvironmentManager day/night lighting', () => {
  beforeEach(() => {
    hoisted.loadGLTF = vi.fn(async () => ({scene: new THREE.Group()}));
  });

  it('loads the night bake only once the user enables it', async () => {
    const {manager} = createManager();
    await manager.setEnvironment({manifestPath: manifestPath()});

    // The day bake loads at environment set; the DayNightCycle chunk and the
    // night bake stay unloaded until enabled.
    expect(hoisted.loadGLTF).toHaveBeenCalledTimes(1);
    expect(hoisted.loadGLTF.mock.calls[0][0].url).toBe(DAY_URL);
    expect(manager.dayNightEnabled).toBe(false);
    const lighting = manager.manifest
      ?.lighting as SimulatorDayNightLightingDefinition;
    expect(lighting).toEqual({
      kind: 'dayNight',
      nightScenePath: NIGHT_URL,
      pairing: 'bake-crossfade-v1',
    });

    await manager.setDayNightEnabled(true);
    expect(manager.dayNightEnabled).toBe(true);
    expect(hoisted.loadGLTF).toHaveBeenCalledTimes(2);
    expect(hoisted.loadGLTF.mock.calls[1][0].url).toBe(NIGHT_URL);

    await manager.setTimeOfDay(0.5);

    await manager.setDayNightEnabled(false);
    expect(manager.dayNightEnabled).toBe(false);
    manager.dispose();
  });

  it('initializes the lighting lazily on first setTimeOfDay', async () => {
    const {manager} = createManager();
    await manager.setEnvironment({manifestPath: manifestPath()});
    expect(manager.dayNightEnabled).toBe(false);

    await manager.setTimeOfDay(0.25);
    expect(manager.dayNightEnabled).toBe(true);
    expect(hoisted.loadGLTF.mock.calls.map(([options]) => options.url)).toEqual(
      [DAY_URL, NIGHT_URL]
    );
    manager.dispose();
  });

  it('stays lazy when the manifest declares no lighting', async () => {
    const {manager} = createManager();
    await manager.setEnvironment({
      manifestPath: `data:application/json,${encodeURIComponent(
        JSON.stringify({name: 'Plain Room', scenePath: DAY_URL})
      )}`,
    });
    await manager.preloadDayNight();
    await manager.setTimeOfDay(0.5);
    await manager.setDayNightEnabled(true);
    expect(manager.dayNightEnabled).toBe(false);
    expect(manager.manifest?.lighting).toBeUndefined();
    expect(hoisted.loadGLTF).toHaveBeenCalledTimes(1);
    manager.dispose();
  });

  it('resolves a stale generation without keeping the old cycle', async () => {
    const {manager} = createManager();
    const first = manager.setEnvironment({manifestPath: manifestPath()});
    const second = manager.setEnvironment({manifestPath: manifestPath()});
    await Promise.all([first, second]);
    await manager.preloadDayNight();
    expect(hoisted.loadGLTF.mock.calls.map(([options]) => options.url)).toEqual(
      [DAY_URL, DAY_URL, NIGHT_URL]
    );
    manager.dispose();
    expect(manager.manifest).toBeUndefined();
  });
});

describe('SimulatorEnvironmentManager lighting types', () => {
  it('keeps the resolved manifest shape addressable', async () => {
    const {manager, simulatorScene} = createManager();
    await manager.setEnvironment({manifestPath: manifestPath()});
    const manifest = manager.manifest as ResolvedSimulatorSceneManifest;
    expect(manifest.scenePath).toBe(DAY_URL);
    expect(simulatorScene.environmentRoot).toBeTruthy();
    manager.dispose();
  });
});
