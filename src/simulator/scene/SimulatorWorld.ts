import * as THREE from 'three';

import {Options} from '../../core/Options';
import {
  SimulatorPlane,
  SimulatorPlaneType,
} from '../../world/planes/SimulatorPlane';
import {World} from '../../world/World';
import {SimulatorMesh} from '../../world/mesh/SimulatorMesh';
import type {SimulatorPlaneTrackingMode} from '../SimulatorOptions';
import {
  geometryIndices,
  geometryVertices,
  mergeObjectGeometry,
} from './SimulatorGeometry';
import {ResolvedSimulatorSceneManifest} from './SimulatorEnvironmentManifest';
import {SimulatorObjectsManager} from './SimulatorObjects';

interface PlaneData {
  type: SimulatorPlaneType;
  label?: string;
  area: number;
  position: {x: number; y: number; z: number};
  quaternion: number[];
  polygon: {x: number; y: number}[];
}

/** World-sensing adapters for the simulator environment. */
export class SimulatorWorld {
  private options!: Options;
  private world!: World;
  private hardcodedPlanes?: SimulatorPlane[];
  private trackedPlanes?: SimulatorPlane[];
  private activeManifest?: ResolvedSimulatorSceneManifest;
  private planeTrackingMode: SimulatorPlaneTrackingMode = 'auto';
  private planeLoadGeneration = 0;
  private suspended = false;

  async init(options: Options, world: World) {
    this.options = options;
    this.world = world;
    this.planeTrackingMode = options.simulator.planeTracking.mode;
    await world.initializedPromise;
  }

  get currentPlaneTrackingMode(): SimulatorPlaneTrackingMode {
    return this.planeTrackingMode;
  }

  /** True when the active environment manifest supplied non-empty hardcoded planes. */
  get hasHardcodedPlanes(): boolean {
    return Boolean(this.hardcodedPlanes && this.hardcodedPlanes.length > 0);
  }

  /** True when realistic depth-based plane tracking should drive simulator planes. */
  get isRealisticPlaneTrackingActive(): boolean {
    if (!this.options?.world.planes.enabled) return false;
    if (this.planeTrackingMode === 'realistic') return true;
    if (this.planeTrackingMode === 'hardcoded') return false;
    return !this.hasHardcodedPlanes;
  }

  async preparePlanes(manifest: ResolvedSimulatorSceneManifest) {
    if (!this.options.world.planes.enabled) return undefined;
    if (this.planeTrackingMode === 'realistic') return undefined;
    return this.loadHardcodedPlanes(manifest);
  }

  private async loadHardcodedPlanes(
    manifest: ResolvedSimulatorSceneManifest
  ): Promise<SimulatorPlane[]> {
    if (!manifest.scenePlanesPath) return [];
    // Plane sidecars are frequently regenerated while authoring environments.
    const response = await fetch(manifest.scenePlanesPath, {cache: 'no-store'});
    if (!response.ok) {
      throw new Error(
        `Failed to load simulator planes at ${manifest.scenePlanesPath}: ${response.status} ${response.statusText}`
      );
    }
    const data = (await response.json()) as {planes?: PlaneData[]};
    if (!Array.isArray(data.planes)) {
      throw new Error(
        `Invalid simulator planes at ${manifest.scenePlanesPath}: expected planes array.`
      );
    }

    const rootPosition = new THREE.Vector3().fromArray(
      manifest.position ?? [0, 0, 0]
    );
    const rootQuaternion = new THREE.Quaternion().fromArray(
      manifest.quaternion ?? [0, 0, 0, 1]
    );
    const rootScale = new THREE.Vector3().fromArray(
      manifest.scale ?? [1, 1, 1]
    );
    const matrix = new THREE.Matrix4().compose(
      rootPosition,
      rootQuaternion,
      rootScale
    );

    return data.planes.map((plane): SimulatorPlane => {
      const position = new THREE.Vector3(
        plane.position.x,
        plane.position.y,
        plane.position.z
      ).applyMatrix4(matrix);
      const quaternion = rootQuaternion
        .clone()
        .multiply(new THREE.Quaternion().fromArray(plane.quaternion));
      return {
        type: plane.type,
        area: plane.area * Math.abs(rootScale.x * rootScale.z),
        position,
        quaternion,
        polygon: plane.polygon.map(
          (point) =>
            new THREE.Vector2(point.x * rootScale.x, point.y * rootScale.z)
        ),
        label: plane.label,
      };
    });
  }

  commitPlanes(
    planes?: SimulatorPlane[],
    manifest?: ResolvedSimulatorSceneManifest
  ) {
    this.planeLoadGeneration++;
    this.activeManifest = manifest;
    this.trackedPlanes = undefined;
    if (planes !== undefined) {
      this.hardcodedPlanes = planes;
    } else if (!manifest?.scenePlanesPath) {
      this.hardcodedPlanes = [];
    } else {
      this.hardcodedPlanes = undefined;
    }
    this.applyActivePlanes();
  }

  /**
   * Switches the simulator plane tracking mode at runtime.
   * Updates mode synchronously before any on-demand hardcoded plane fetch.
   */
  async setPlaneTrackingMode(mode: SimulatorPlaneTrackingMode): Promise<void> {
    const wasRealistic = this.isRealisticPlaneTrackingActive;
    this.planeTrackingMode = mode;
    if (this.options) {
      this.options.simulator.planeTracking.mode = mode;
    }
    const generation = ++this.planeLoadGeneration;
    if (!this.options?.world.planes.enabled) return;

    if (mode === 'realistic') {
      if (!wasRealistic) {
        this.trackedPlanes = undefined;
      }
      this.applyActivePlanes();
      return;
    }

    if (this.hardcodedPlanes === undefined && this.activeManifest) {
      const manifest = this.activeManifest;
      this.trackedPlanes = undefined;
      if (!this.suspended) {
        this.world.planes?.setSimulatorPlanes([]);
      }
      const loaded = await this.loadHardcodedPlanes(manifest);
      if (
        generation !== this.planeLoadGeneration ||
        this.activeManifest !== manifest
      ) {
        return;
      }
      this.hardcodedPlanes = loaded;
    }

    if (!this.isRealisticPlaneTrackingActive) {
      this.trackedPlanes = undefined;
    }
    this.applyActivePlanes();
  }

  /** Publishes planes produced by the depth-based WebWorker plane tracker. */
  setTrackedPlanes(planes: SimulatorPlane[]) {
    if (!this.isRealisticPlaneTrackingActive || this.suspended) return;
    this.trackedPlanes = planes;
    this.world.planes?.setSimulatorPlanes(planes);
  }

  private applyActivePlanes() {
    if (
      this.suspended ||
      !this.options?.world.planes.enabled ||
      !this.world?.planes
    ) {
      return;
    }
    if (this.isRealisticPlaneTrackingActive) {
      this.world.planes.setSimulatorPlanes(this.trackedPlanes ?? []);
    } else if (this.hardcodedPlanes) {
      this.world.planes.setSimulatorPlanes(this.hardcodedPlanes);
    } else {
      this.world.planes.setSimulatorPlanes([]);
    }
  }

  suspendSimulatorSensing() {
    this.suspended = true;
    this.world.planes?.clearSimulatorPlanes();
    this.world.meshes?.clearSimulatorMeshes();
  }

  restoreSimulatorPlanes() {
    this.suspended = false;
    this.applyActivePlanes();
  }

  commitMeshes(
    room: THREE.Object3D | undefined,
    objects: SimulatorObjectsManager
  ) {
    if (!this.world.meshes) return;
    const sources: SimulatorMesh[] = [];
    if (room) sources.push(...this.createRoomMeshSources(room));
    for (const record of objects.getMeshRecords()) {
      const source = this.createMeshSource(record.object, 'other', record.id);
      if (source) sources.push(source);
    }
    const detectedMeshes = this.world.meshes.setSimulatorMeshes(sources);
    const objectMeshes = new Map(
      sources.flatMap((source, index) =>
        source.simulatorObjectId
          ? [[source.simulatorObjectId, detectedMeshes[index]] as const]
          : []
      )
    );
    objects.setDetectedMeshes(objectMeshes);
  }

  /** Preserves the original simulator behavior of exposing each room submesh. */
  private createRoomMeshSources(root: THREE.Object3D) {
    root.updateWorldMatrix(true, true);
    const sources: SimulatorMesh[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      sources.push({
        vertices: geometryVertices(geometry),
        indices: geometryIndices(geometry),
        lastChangedTime: 0,
      });
      geometry.dispose();
    });
    return sources;
  }

  private createMeshSource(
    object: THREE.Object3D,
    semanticLabel: string,
    simulatorObjectId?: string
  ): SimulatorMesh | undefined {
    const geometry = mergeObjectGeometry(object);
    if (!geometry) return undefined;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    object.getWorldPosition(position);
    object.getWorldQuaternion(quaternion);
    const source: SimulatorMesh = {
      vertices: geometryVertices(geometry),
      indices: geometryIndices(geometry),
      lastChangedTime: 0,
      semanticLabel,
      position,
      quaternion,
      simulatorObjectId,
    };
    geometry.dispose();
    return source;
  }
}
