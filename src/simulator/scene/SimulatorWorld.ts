import * as THREE from 'three';

import {Options} from '../../core/Options';
import {
  SimulatorPlane,
  SimulatorPlaneType,
} from '../../world/planes/SimulatorPlane';
import {World} from '../../world/World';
import {SimulatorMesh} from '../../world/mesh/SimulatorMesh';
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
  private simulatorPlanes?: SimulatorPlane[];

  async init(options: Options, world: World) {
    this.options = options;
    this.world = world;
    await world.initializedPromise;
  }

  async preparePlanes(manifest: ResolvedSimulatorSceneManifest) {
    if (!this.options.world.planes.enabled) return undefined;
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

  commitPlanes(planes?: SimulatorPlane[]) {
    this.simulatorPlanes = planes;
    if (planes && this.world.planes) {
      this.world.planes.setSimulatorPlanes(planes);
    }
  }

  suspendSimulatorSensing() {
    this.world.planes?.clearSimulatorPlanes();
    this.world.meshes?.clearSimulatorMeshes();
  }

  restoreSimulatorPlanes() {
    if (this.simulatorPlanes) {
      this.world.planes?.setSimulatorPlanes(this.simulatorPlanes);
    }
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
