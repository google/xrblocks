import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import type RAPIER from 'rapier3d';

import type {WebGLOrWebGPURenderer} from '../../core/RendererTypes';
import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {ModelLoader} from '../../utils/ModelLoader';
import {
  geometryIndices,
  geometryVertices,
  mergeObjectGeometry,
} from './SimulatorGeometry';
import {
  loadSimulatorSceneManifest,
  ResolvedSimulatorSceneManifest,
} from './SimulatorEnvironmentManifest';
import type {DayNightCycle} from '../lighting/DayNightCycle.js';
import {SimulatorNavMesh} from '../internal/navmesh/SimulatorNavMesh';
import {SimulatorObjectsManager} from './SimulatorObjects';
import type {SimulatorPhysics} from './SimulatorPhysics';
import {SimulatorScene} from './SimulatorScene';
import {SimulatorWorld} from './SimulatorWorld';
import type {SimulatorEnvironment, SimulatorOptions} from '../SimulatorOptions';

interface RoomPhysics {
  rigidBody: RAPIER.RigidBody;
}

function getManifestFallbackName(manifestUrl: string) {
  return new URL(manifestUrl).pathname.split('/').pop() || manifestUrl;
}

export class SimulatorEnvironmentManager {
  manifest?: ResolvedSimulatorSceneManifest;
  activeEnvironment?: SimulatorEnvironment;

  private generation = 0;
  private roomPhysics?: RoomPhysics;
  private dayNight?: DayNightCycle | null;

  constructor(
    private options: SimulatorOptions,
    private renderer: WebGLOrWebGPURenderer,
    private simulatorScene: SimulatorScene,
    private simulatorObjects: SimulatorObjectsManager,
    private navMesh: SimulatorNavMesh,
    private simulatorWorld: SimulatorWorld,
    private physics: SimulatorPhysics | undefined,
    private setVideoPath: (path?: string) => void
  ) {
    this.simulatorObjects.onChanged = this.refreshMeshes.bind(this);
  }

  /**
   * Resolves manifest names for the settings panel without loading scene assets.
   */
  async resolveEnvironmentNames(environments: SimulatorEnvironment[]) {
    await Promise.all(
      environments.map(async (environment) => {
        if (environment.name) return;
        try {
          const manifest = await loadSimulatorSceneManifest(
            environment.manifestPath
          );
          environment.name = manifest.name;
        } catch (error) {
          console.warn(
            `Failed to read simulator environment name from ${environment.manifestPath}.`,
            error
          );
        }
      })
    );
  }

  async setEnvironment(environment: SimulatorEnvironment) {
    this.dayNight?.dispose();
    this.dayNight = undefined;
    const generation = ++this.generation;
    const manifest = await loadSimulatorSceneManifest(environment.manifestPath);
    const {root, objects: objectsGroup} =
      this.simulatorScene.createEnvironmentRoot(manifest);

    let gltf: GLTF | undefined;
    let roomGeometry: THREE.BufferGeometry | undefined;
    try {
      const roomPromise = manifest.scenePath
        ? new ModelLoader().loadGLTF({
            url: manifest.scenePath,
            renderer: this.renderer,
          })
        : Promise.resolve(undefined);
      const results = await Promise.allSettled([
        roomPromise,
        this.simulatorObjects.prepareObjects(
          manifest.objects,
          manifest.manifestUrl,
          {replaceExisting: true}
        ),
        this.navMesh.prepareEnvironment(manifest, this.options),
        this.simulatorWorld.preparePlanes(manifest),
      ]);
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected'
      );
      if (failure) {
        const loadedRoom = results[0];
        if (loadedRoom.status === 'fulfilled' && loadedRoom.value) {
          root.add(loadedRoom.value.scene);
        }
        const loadedObjects = results[1];
        if (loadedObjects.status === 'fulfilled') {
          for (const record of loadedObjects.value.records) {
            objectsGroup.add(record.object);
          }
        }
        const loadedNavMesh = results[2];
        if (loadedNavMesh.status === 'fulfilled') {
          loadedNavMesh.value.debugGeometry?.dispose();
        }
        throw failure.reason;
      }
      const [loadedRoom, loadedObjects, loadedNavMesh, loadedPlanes] =
        results as [
          PromiseFulfilledResult<Awaited<typeof roomPromise>>,
          PromiseFulfilledResult<
            Awaited<ReturnType<SimulatorObjectsManager['prepareObjects']>>
          >,
          PromiseFulfilledResult<
            Awaited<ReturnType<SimulatorNavMesh['prepareEnvironment']>>
          >,
          PromiseFulfilledResult<
            Awaited<ReturnType<SimulatorWorld['preparePlanes']>>
          >,
        ];
      const preparedObjects = loadedObjects.value;
      const preparedNavMesh = loadedNavMesh.value;
      const preparedPlanes = loadedPlanes.value;
      gltf = loadedRoom.value;
      if (gltf) root.add(gltf.scene);
      for (const record of preparedObjects.records) {
        objectsGroup.add(record.object);
      }
      if (gltf && this.physics) {
        roomGeometry = mergeObjectGeometry(gltf.scene) ?? undefined;
        if (!roomGeometry) {
          throw new Error('Simulator room has no mesh geometry for physics.');
        }
      }
      if (generation !== this.generation) {
        roomGeometry?.dispose();
        preparedNavMesh.debugGeometry?.dispose();
        disposeObjectTree(root);
        return;
      }

      const previousRoot = this.simulatorScene.environmentRoot;
      this.disposeRoomPhysics();
      this.simulatorObjects.reset();
      this.simulatorScene.commitEnvironment(root, gltf);
      this.simulatorObjects.setEnvironmentGroup(objectsGroup);
      this.simulatorObjects.activatePrepared(preparedObjects, objectsGroup);
      this.createRoomPhysics(gltf?.scene, roomGeometry);
      roomGeometry = undefined;
      this.navMesh.commitEnvironment(preparedNavMesh);
      this.simulatorWorld.commitPlanes(preparedPlanes);
      this.refreshMeshes();
      this.setVideoPath(manifest.videoPath);
      environment.name =
        environment.name ??
        manifest.name ??
        getManifestFallbackName(manifest.manifestUrl);
      this.activeEnvironment = environment;
      this.manifest = manifest;

      if (previousRoot) disposeObjectTree(previousRoot);
    } catch (error) {
      roomGeometry?.dispose();
      if (root !== this.simulatorScene.environmentRoot) {
        disposeObjectTree(root);
      }
      throw error;
    }
  }

  private createRoomPhysics(
    room?: THREE.Object3D,
    geometry?: THREE.BufferGeometry
  ) {
    if (!room || !this.physics) return;
    if (!geometry) {
      throw new Error('Simulator room has no mesh geometry for physics.');
    }
    room.updateWorldMatrix(true, true);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    room.getWorldPosition(position);
    room.getWorldQuaternion(quaternion);
    const body = this.physics.world.createRigidBody(
      this.physics.RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(quaternion)
    );
    this.physics.world.createCollider(
      this.physics.RAPIER.ColliderDesc.trimesh(
        geometryVertices(geometry),
        geometryIndices(geometry)
      ),
      body
    );
    geometry.dispose();
    this.roomPhysics = {rigidBody: body};
  }

  private disposeRoomPhysics() {
    if (this.physics && this.roomPhysics) {
      this.physics.world.removeRigidBody(this.roomPhysics.rigidBody);
    }
    this.roomPhysics = undefined;
  }

  private refreshMeshes() {
    this.simulatorWorld.commitMeshes(
      this.simulatorScene.gltf?.scene,
      this.simulatorObjects
    );
  }

  suspendSensing() {
    this.simulatorWorld.suspendSimulatorSensing();
  }

  resumeSensing() {
    this.simulatorWorld.restoreSimulatorPlanes();
    this.refreshMeshes();
  }

  /**
   * Fetches the environment's night bake for day/night lighting ahead of
   * first use. No-op when the manifest declares no day/night lighting.
   */
  async preloadDayNight() {
    await (await this.ensureDayNight())?.preload();
  }

  /**
   * Sets the time of day for the environment's day/night lighting (0 = day
   * endpoint, 1 = night endpoint). Initializes the lighting lazily on first
   * use. No-op when the manifest declares no day/night lighting.
   */
  async setTimeOfDay(t: number): Promise<void> {
    (await this.ensureDayNight())?.setTimeOfDay(t);
  }

  /** True when day/night lighting is initialized for the active environment. */
  get dayNightEnabled(): boolean {
    return !!this.dayNight;
  }

  /** Current time of day (0 = day, 1 = night); 0 while lighting is off. */
  get timeOfDay(): number {
    return this.dayNight?.timeOfDay ?? 0;
  }

  /**
   * Enables or disables day/night lighting for the active environment. The
   * DayNightCycle chunk and the night bake are only fetched on first enable,
   * never at environment load; disabling restores the day-only render and
   * frees the night resources. No-op when the manifest declares no day/night
   * lighting.
   */
  async setDayNightEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      await (await this.ensureDayNight())?.preload();
    } else if (this.dayNight) {
      this.dayNight.dispose();
      this.dayNight = undefined;
    }
  }

  /**
   * Lazily initializes the environment's day/night lighting. Returns the
   * cached cycle, or null when the active environment declares no day/night
   * lighting (or the backend cannot render it).
   */
  private async ensureDayNight(): Promise<DayNightCycle | null> {
    if (this.dayNight !== undefined) return this.dayNight;
    const lighting = this.manifest?.lighting;
    const root = this.simulatorScene.environmentRoot;
    const dayScene = this.simulatorScene.gltf?.scene;
    if (!lighting || !root || !dayScene) {
      this.dayNight = null;
      return null;
    }
    const generation = this.generation;
    try {
      const {DayNightCycle} = await import('../lighting/DayNightCycle.js');
      const dayNight = await DayNightCycle.create({
        renderer: this.renderer,
        root,
        dayScene,
        loader: new ModelLoader(),
        lighting,
      });
      if (generation !== this.generation) {
        dayNight?.dispose();
        return null;
      }
      this.dayNight = dayNight ?? null;
    } catch (error) {
      console.warn('Simulator day/night lighting failed to initialize.', error);
      this.dayNight = null;
    }
    return this.dayNight;
  }

  dispose() {
    this.dayNight?.dispose();
    this.dayNight = undefined;
    this.generation++;
    this.simulatorWorld.suspendSimulatorSensing();
    this.disposeRoomPhysics();
    this.simulatorObjects.dispose();
    this.navMesh.dispose();
    const root = this.simulatorScene.environmentRoot;
    root?.removeFromParent();
    if (root) disposeObjectTree(root);
    this.simulatorScene.clearEnvironment();
    this.activeEnvironment = undefined;
    this.manifest = undefined;
    this.setVideoPath(undefined);
  }
}
