import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import type {Pathfinding as PathfindingType} from 'three-pathfinding';

import {SimulatorEnvironment, SimulatorOptions} from './SimulatorOptions';

const DEFAULT_ZONE_ID = 'simulator';
const RANDOM_PATH_SAMPLE_ATTEMPTS = 8;

type PathfindingConstructor = {
  new (): PathfindingType;
  createZone: (geometry: THREE.BufferGeometry, tolerance?: number) => unknown;
};
type PathfindingNode = ReturnType<PathfindingType['getClosestNode']>;
type PathfindingZone = {
  groups: PathfindingNode[][];
  vertices: THREE.Vector3[];
};

export interface SimulatorNavMeshPath {
  target: THREE.Vector3;
  path: THREE.Vector3[];
}

const desiredGroundPosition = new THREE.Vector3();
const startGroundPosition = new THREE.Vector3();
const clampedGroundPosition = new THREE.Vector3();
const initialScenePosition = new THREE.Vector3();
const targetWorldPosition = new THREE.Vector3();
const randomTriangleA = new THREE.Vector3();
const randomTriangleB = new THREE.Vector3();
const randomTriangleC = new THREE.Vector3();
const randomTriangleAB = new THREE.Vector3();
const randomTriangleAC = new THREE.Vector3();

export class SimulatorNavMesh {
  enabled = false;
  ready = false;

  private Pathfinding?: PathfindingConstructor;
  private pathfinding?: PathfindingType;
  private zone?: PathfindingZone;
  private zoneId = DEFAULT_ZONE_ID;
  private groupId: number | null = null;
  private currentNode: PathfindingNode | null = null;
  private eyeHeight = 1.5;

  get constrained() {
    return this.enabled && this.ready;
  }

  async init(options: SimulatorOptions) {
    this.enabled = options.navMesh.enabled;
    this.eyeHeight = options.navMesh.eyeHeight;
    const activeEnv =
      options.environments[options.activeEnvironmentIndex] ?? null;
    await this.setEnvironment(activeEnv, options);
  }

  async setEnvironment(
    environment: SimulatorEnvironment | null,
    options: SimulatorOptions
  ) {
    this.enabled = options.navMesh.enabled;
    this.eyeHeight = options.navMesh.eyeHeight;
    this.ready = false;
    this.groupId = null;
    this.currentNode = null;
    this.pathfinding = undefined;
    this.zone = undefined;

    if (!this.enabled) return;
    if (!environment?.navMeshPath) {
      console.warn(
        'SimulatorNavMesh: navmesh is enabled, but the active environment has no navMeshPath.'
      );
      return;
    }

    try {
      initialScenePosition.set(
        options.initialScenePosition.x,
        options.initialScenePosition.y,
        options.initialScenePosition.z
      );
      const geometry = await this.loadGeometry(
        environment.navMeshPath,
        initialScenePosition
      );
      try {
        await this.setGeometry(geometry);
      } finally {
        geometry.dispose();
      }
    } catch (error) {
      console.warn(
        `SimulatorNavMesh: failed to load navmesh at ${environment.navMeshPath}.`,
        error
      );
    }
  }

  async setGeometry(geometry: THREE.BufferGeometry) {
    const Pathfinding = await this.loadPathfinding();
    const zone = Pathfinding.createZone(geometry) as PathfindingZone;
    this.pathfinding = new Pathfinding();
    this.pathfinding.setZoneData(this.zoneId, zone);
    this.zone = zone;
    this.ready = true;
    this.groupId = null;
    this.currentNode = null;
  }

  applyUserMovement(
    camera: THREE.Camera,
    desiredCameraPosition: THREE.Vector3
  ) {
    if (!this.constrained || !this.pathfinding) {
      camera.position.copy(desiredCameraPosition);
      return;
    }

    startGroundPosition.copy(camera.position);
    startGroundPosition.y -= this.eyeHeight;
    desiredGroundPosition.copy(desiredCameraPosition);
    desiredGroundPosition.y -= this.eyeHeight;

    if (this.groupId === null || this.currentNode === null) {
      this.groupId = this.pathfinding.getGroup(
        this.zoneId,
        startGroundPosition
      ) as number | null;
      if (this.groupId === null) {
        camera.position.copy(desiredCameraPosition);
        return;
      }
      this.currentNode = this.pathfinding.getClosestNode(
        startGroundPosition,
        this.zoneId,
        this.groupId,
        true
      );
      this.currentNode ??= this.pathfinding.getClosestNode(
        startGroundPosition,
        this.zoneId,
        this.groupId,
        false
      );
    }

    if (!this.currentNode || this.groupId === null) {
      camera.position.copy(desiredCameraPosition);
      return;
    }

    this.currentNode = this.pathfinding.clampStep(
      startGroundPosition,
      desiredGroundPosition,
      this.currentNode,
      this.zoneId,
      this.groupId,
      clampedGroundPosition
    );
    camera.position.set(
      clampedGroundPosition.x,
      clampedGroundPosition.y + this.eyeHeight,
      clampedGroundPosition.z
    );
  }

  findPathTo(
    startCameraPosition: THREE.Vector3,
    targetGroundPosition: THREE.Vector3
  ) {
    if (!this.constrained || !this.pathfinding) return null;
    const start = startGroundPosition.copy(startCameraPosition);
    start.y -= this.eyeHeight;
    const groupId = this.getGroup(start);
    if (groupId === null) return null;
    return this.pathfinding.findPath(
      start,
      targetGroundPosition,
      this.zoneId,
      groupId
    );
  }

  findRandomPathFrom(
    startCameraPosition: THREE.Vector3
  ): SimulatorNavMeshPath | null {
    if (!this.constrained || !this.pathfinding || !this.zone) return null;
    const start = startGroundPosition.copy(startCameraPosition);
    start.y -= this.eyeHeight;
    const groupId = this.getGroup(start);
    if (groupId === null) return null;

    for (let i = 0; i < RANDOM_PATH_SAMPLE_ATTEMPTS; i++) {
      const target = this.getRandomPointInGroup(groupId);
      if (!target) continue;
      const path = this.pathfinding.findPath(
        start,
        target,
        this.zoneId,
        groupId
      );
      if (path) return {target, path};
    }
    return null;
  }

  isGroundPositionReachable(
    startCameraPosition: THREE.Vector3,
    targetGroundPosition: THREE.Vector3
  ) {
    return this.isLocationReachable(startCameraPosition, targetGroundPosition);
  }

  isLocationReachable(
    startCameraPosition: THREE.Vector3,
    targetGroundPosition: THREE.Vector3
  ) {
    return this.findPathTo(startCameraPosition, targetGroundPosition) !== null;
  }

  isObjectReachable(
    startCameraPosition: THREE.Vector3,
    object: THREE.Object3D
  ) {
    object.getWorldPosition(targetWorldPosition);
    return this.isGroundPositionReachable(
      startCameraPosition,
      targetWorldPosition
    );
  }

  private getGroup(position: THREE.Vector3) {
    if (!this.pathfinding) return null;
    return this.pathfinding.getGroup(this.zoneId, position) as number | null;
  }

  private getRandomPointInGroup(groupId: number) {
    const group = this.zone?.groups[groupId];
    if (!group) return null;

    let totalArea = 0;
    const areas = group.map((node) => {
      const area = this.getNodeArea(node);
      totalArea += area;
      return totalArea;
    });
    if (totalArea <= 0) return null;

    const targetArea = Math.random() * totalArea;
    const nodeIndex = areas.findIndex((area) => area >= targetArea);
    const node = group[nodeIndex === -1 ? group.length - 1 : nodeIndex];
    return this.sampleNode(node);
  }

  private getNodeArea(node: PathfindingNode) {
    if (!node || !this.zone) return 0;
    const [a, b, c] = node.vertexIds.map((id) => this.zone!.vertices[id]);
    randomTriangleAB.subVectors(b, a);
    randomTriangleAC.subVectors(c, a);
    return randomTriangleAB.cross(randomTriangleAC).length() * 0.5;
  }

  private sampleNode(node: PathfindingNode) {
    if (!node || !this.zone) return null;
    const [a, b, c] = node.vertexIds.map((id) => this.zone!.vertices[id]);
    randomTriangleA.copy(a);
    randomTriangleB.copy(b);
    randomTriangleC.copy(c);

    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }

    return new THREE.Vector3()
      .copy(randomTriangleA)
      .addScaledVector(
        randomTriangleAB.subVectors(randomTriangleB, randomTriangleA),
        u
      )
      .addScaledVector(
        randomTriangleAC.subVectors(randomTriangleC, randomTriangleA),
        v
      );
  }

  private async loadGeometry(
    path: string,
    sceneOffset: THREE.Vector3
  ): Promise<THREE.BufferGeometry> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(path);
    try {
      gltf.scene.position.copy(sceneOffset);
      gltf.scene.updateMatrixWorld(true);

      const navMesh = this.findFirstMesh(gltf.scene);

      if (!navMesh) {
        throw new Error('No mesh found in navmesh glTF/GLB.');
      }

      const geometry = navMesh.geometry.clone();
      geometry.applyMatrix4(navMesh.matrixWorld);
      return geometry;
    } finally {
      this.disposeGLTFResources(gltf);
    }
  }

  private disposeGLTFResources(gltf: GLTF) {
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        this.disposeMaterial(material);
      }
    });
  }

  private disposeMaterial(material?: THREE.Material) {
    if (!material) return;
    for (const value of Object.values(
      material as unknown as Record<string, unknown>
    )) {
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    }
    material.dispose();
  }

  private findFirstMesh(root: THREE.Object3D): THREE.Mesh | null {
    const queue = [root];
    while (queue.length > 0) {
      const object = queue.shift()!;
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        return mesh;
      }
      queue.push(...object.children);
    }
    return null;
  }

  private async loadPathfinding() {
    if (!this.Pathfinding) {
      this.Pathfinding = (await import('three-pathfinding')).Pathfinding;
    }
    return this.Pathfinding;
  }
}
