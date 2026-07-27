import * as THREE from 'three';
import type RAPIER from 'rapier3d';

import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {ModelLoader} from '../../utils/ModelLoader';
import type {DetectedMesh} from '../../world/mesh/DetectedMesh';
import {
  SimulatorObjectDefinition,
  SimulatorPhysicsMode,
  SimulatorQuaternionTuple,
  SimulatorVector3Tuple,
} from './SimulatorEnvironmentManifest';
import {geometryVertices, mergeObjectGeometry} from './SimulatorGeometry';
import type {SimulatorPhysics} from './SimulatorPhysics';

export interface SimulatorObject {
  id: string;
  object: THREE.Object3D;
  definition: SimulatorObjectDefinition;
}

/** Mutable fields on an existing simulator object. Asset ownership and IDs
 * remain stable; remove and re-add an object to change either of those. */
export interface SimulatorObjectUpdate {
  id: string;
  position?: SimulatorVector3Tuple;
  quaternion?: SimulatorQuaternionTuple;
  scale?: SimulatorVector3Tuple;
  visible?: boolean;
  detectObject?: boolean;
  /** Use null to clear an existing semantic label. */
  label?: string | null;
  data?: unknown;
  physics?: SimulatorPhysicsMode;
}

/** @internal */
interface SimulatorObjectRecord extends SimulatorObject {
  rigidBody?: RAPIER.RigidBody;
  detectedMesh?: DetectedMesh;
  physicsGeometry?: THREE.BufferGeometry;
  ownsObject: boolean;
  preserveWorldTransform: boolean;
}

/** @internal */
export interface PreparedSimulatorObjects {
  records: SimulatorObjectRecord[];
  nextId: number;
}

const worldPosition = new THREE.Vector3();
const worldQuaternion = new THREE.Quaternion();
const localPosition = new THREE.Vector3();
const parentQuaternion = new THREE.Quaternion();

export interface SimulatorObjects {
  addObjects(
    definitions: SimulatorObjectDefinition[],
    options?: {baseUrl?: string}
  ): Promise<SimulatorObject[]>;
  get(ids?: string[]): SimulatorObject[];
  updateObjects(updates: SimulatorObjectUpdate[]): Promise<SimulatorObject[]>;
  removeObjects(ids: string[]): this;
  clear(): this;
}

/** @internal */
export class SimulatorObjectsManager implements SimulatorObjects {
  onChanged?: () => void;
  private records = new Map<string, SimulatorObjectRecord>();
  private nextId = 1;
  private group?: THREE.Group;
  private physics?: SimulatorPhysics;
  private renderer?: THREE.WebGLRenderer;

  init(renderer: THREE.WebGLRenderer, physics?: SimulatorPhysics) {
    this.renderer = renderer;
    this.physics = physics;
  }

  async prepareObjects(
    definitions: SimulatorObjectDefinition[],
    baseUrl = document.baseURI,
    {replaceExisting = false}: {replaceExisting?: boolean} = {}
  ): Promise<PreparedSimulatorObjects> {
    const assignedIds = new Set(replaceExisting ? [] : this.records.keys());
    const assignedObjects = new Set<THREE.Object3D>(
      replaceExisting
        ? []
        : Array.from(this.records.values(), (record) => record.object)
    );
    let nextId = replaceExisting ? 1 : this.nextId;
    const normalized = definitions.map((definition) => {
      let id = definition.id;
      while (!id) {
        const candidate = `simulator-object-${nextId++}`;
        if (!assignedIds.has(candidate)) id = candidate;
      }
      if (assignedIds.has(id)) {
        throw new Error(`Simulator object id '${id}' is already in use.`);
      }
      assignedIds.add(id);
      if (!!definition.assetPath === !!definition.object) {
        throw new Error(
          `Simulator object '${id}' must provide exactly one of assetPath or object.`
        );
      }
      if (definition.object && assignedObjects.has(definition.object)) {
        throw new Error(
          `Simulator object '${id}' uses the same runtime object more than once.`
        );
      }
      if (definition.object) assignedObjects.add(definition.object);
      if (definition.detectObject && !definition.label) {
        throw new Error(
          `Simulator object '${id}' requires label when detectObject is true.`
        );
      }
      const physics = definition.physics ?? false;
      if (physics && !this.physics) {
        throw new Error(
          `Simulator object '${id}' requires physics, but simulator physics is not enabled.`
        );
      }
      return {definition, id};
    });

    const settled = await Promise.allSettled(
      normalized.map(async ({definition, id}) => {
        if (definition.object)
          return {definition, id, object: definition.object};
        const assetUrl = new URL(definition.assetPath!, baseUrl).href;
        const gltf = await new ModelLoader().loadGLTF({
          url: assetUrl,
          renderer: this.renderer,
        });
        return {definition, id, object: gltf.scene};
      })
    );
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failure) {
      for (const result of settled) {
        if (result.status === 'fulfilled' && !result.value.definition.object) {
          disposeObjectTree(result.value.object);
        }
      }
      throw failure.reason;
    }
    const loaded = settled.map(
      (result) =>
        (
          result as PromiseFulfilledResult<{
            definition: SimulatorObjectDefinition;
            id: string;
            object: THREE.Object3D;
          }>
        ).value
    );
    const records: SimulatorObjectRecord[] = [];
    try {
      for (const {definition, id, object} of loaded) {
        const hasTransform =
          !!definition.position ||
          !!definition.quaternion ||
          !!definition.scale;
        object.name ||= id;
        if (definition.position) object.position.fromArray(definition.position);
        if (definition.quaternion)
          object.quaternion.fromArray(definition.quaternion);
        if (definition.scale) object.scale.fromArray(definition.scale);
        object.visible = definition.visible ?? true;
        const physicsGeometry =
          (definition.physics ?? false)
            ? (mergeObjectGeometry(object) ?? undefined)
            : undefined;
        if ((definition.physics ?? false) && !physicsGeometry) {
          throw new Error(
            `Simulator object '${id}' has no mesh geometry for physics.`
          );
        }
        records.push({
          id,
          object,
          definition: {...definition, id},
          physicsGeometry,
          ownsObject: !definition.object,
          preserveWorldTransform: !!definition.object?.parent && !hasTransform,
        });
      }
    } catch (error) {
      for (const record of records) record.physicsGeometry?.dispose();
      for (const entry of loaded) {
        if (!entry.definition.object) disposeObjectTree(entry.object);
      }
      throw error;
    }
    return {records, nextId};
  }

  activatePrepared(
    prepared: PreparedSimulatorObjects,
    targetGroup: THREE.Group
  ) {
    for (const record of prepared.records) {
      if (record.object.parent !== targetGroup) {
        if (record.preserveWorldTransform) targetGroup.attach(record.object);
        else targetGroup.add(record.object);
      }
      this.createPhysics(record);
      this.records.set(record.id, record);
    }
    this.group = targetGroup;
    this.nextId = prepared.nextId;
    return prepared.records as SimulatorObject[];
  }

  setEnvironmentGroup(group: THREE.Group) {
    this.group = group;
    this.nextId = 1;
  }

  async addObjects(
    definitions: SimulatorObjectDefinition[],
    {baseUrl = document.baseURI}: {baseUrl?: string} = {}
  ) {
    if (!this.group) {
      throw new Error('Simulator environment is not ready.');
    }
    const prepared = await this.prepareObjects(definitions, baseUrl);
    try {
      const activated = this.activatePrepared(prepared, this.group);
      if (activated.length > 0) this.onChanged?.();
      return activated;
    } catch (error) {
      for (const record of prepared.records) {
        this.disposeRecord(record);
        this.records.delete(record.id);
      }
      throw error;
    }
  }

  get(ids?: string[]) {
    if (!ids) return Array.from(this.records.values()) as SimulatorObject[];
    return ids
      .map((id) => this.records.get(id))
      .filter((record): record is SimulatorObjectRecord => !!record);
  }

  async updateObjects(updates: SimulatorObjectUpdate[]) {
    const seen = new Set<string>();
    const entries = updates.map((update) => {
      if (seen.has(update.id)) {
        throw new Error(
          `Simulator object '${update.id}' is updated more than once.`
        );
      }
      seen.add(update.id);
      const record = this.records.get(update.id);
      if (!record) {
        throw new Error(`Simulator object '${update.id}' does not exist.`);
      }
      this.validateUpdate(update);
      return {record, update};
    });

    const snapshots = entries.map(({record}) => ({
      record,
      definition: {...record.definition},
      position: record.object.position.clone(),
      quaternion: record.object.quaternion.clone(),
      scale: record.object.scale.clone(),
      visible: record.object.visible,
    }));

    const geometries = new Map<SimulatorObjectRecord, THREE.BufferGeometry>();
    const physicsUpdates = new Set(
      entries
        .filter(({update}) =>
          ['position', 'quaternion', 'scale', 'physics'].some((key) =>
            Object.prototype.hasOwnProperty.call(update, key)
          )
        )
        .map(({record}) => record)
    );
    try {
      for (const {record, update} of entries) {
        this.applyUpdate(record, update);
        if (
          physicsUpdates.has(record) &&
          (record.definition.physics ?? false) &&
          this.physics
        ) {
          const geometry = mergeObjectGeometry(record.object);
          if (!geometry) {
            throw new Error(
              `Simulator object '${record.id}' has no mesh geometry for physics.`
            );
          }
          geometries.set(record, geometry);
        }
      }

      for (const {record} of entries) {
        if (!physicsUpdates.has(record)) continue;
        this.removePhysics(record);
        record.physicsGeometry = geometries.get(record);
        this.createPhysics(record);
      }
    } catch (error) {
      for (const geometry of geometries.values()) geometry.dispose();
      for (const snapshot of snapshots) {
        if (physicsUpdates.has(snapshot.record))
          this.removePhysics(snapshot.record);
        snapshot.record.definition = snapshot.definition;
        snapshot.record.object.position.copy(snapshot.position);
        snapshot.record.object.quaternion.copy(snapshot.quaternion);
        snapshot.record.object.scale.copy(snapshot.scale);
        snapshot.record.object.visible = snapshot.visible;
        if (
          physicsUpdates.has(snapshot.record) &&
          (snapshot.definition.physics ?? false) &&
          this.physics
        ) {
          snapshot.record.physicsGeometry =
            mergeObjectGeometry(snapshot.record.object) ?? undefined;
          this.createPhysics(snapshot.record);
        }
      }
      throw error;
    }

    if (entries.length > 0) this.onChanged?.();
    return entries.map(({record}) => record as SimulatorObject);
  }

  private validateUpdate(update: SimulatorObjectUpdate) {
    const finiteTuple = (value: number[] | undefined, length: number) =>
      value === undefined ||
      (value.length === length && value.every(Number.isFinite));
    if (!finiteTuple(update.position, 3)) {
      throw new Error(
        `Simulator object '${update.id}' has an invalid position.`
      );
    }
    if (
      !finiteTuple(update.quaternion, 4) ||
      update.quaternion?.every((component) => component === 0)
    ) {
      throw new Error(
        `Simulator object '${update.id}' has an invalid quaternion.`
      );
    }
    if (
      !finiteTuple(update.scale, 3) ||
      update.scale?.some((component) => component === 0)
    ) {
      throw new Error(`Simulator object '${update.id}' has an invalid scale.`);
    }
    if (update.label !== undefined && update.label !== null && !update.label) {
      throw new Error(`Simulator object '${update.id}' has an invalid label.`);
    }
    if (update.physics && !this.physics) {
      throw new Error(
        `Simulator object '${update.id}' requires physics, but simulator physics is not enabled.`
      );
    }
    const detectObject = update.detectObject;
    const label = update.label;
    if (detectObject && label === null) {
      throw new Error(
        `Simulator object '${update.id}' requires label when detectObject is true.`
      );
    }
  }

  private applyUpdate(
    record: SimulatorObjectRecord,
    update: SimulatorObjectUpdate
  ) {
    if (update.position) record.object.position.fromArray(update.position);
    if (update.quaternion)
      record.object.quaternion.fromArray(update.quaternion).normalize();
    if (update.scale) record.object.scale.fromArray(update.scale);
    if (update.visible !== undefined) record.object.visible = update.visible;

    const definition = record.definition;
    if (update.position) definition.position = [...update.position];
    if (update.quaternion) definition.quaternion = [...update.quaternion];
    if (update.scale) definition.scale = [...update.scale];
    if (update.visible !== undefined) definition.visible = update.visible;
    if (update.detectObject !== undefined)
      definition.detectObject = update.detectObject;
    if (update.label !== undefined)
      definition.label = update.label ?? undefined;
    if (Object.prototype.hasOwnProperty.call(update, 'data'))
      definition.data = update.data;
    if (update.physics !== undefined) definition.physics = update.physics;
    if (definition.detectObject && !definition.label) {
      throw new Error(
        `Simulator object '${record.id}' requires label when detectObject is true.`
      );
    }
  }

  getMeshRecords(): SimulatorObject[] {
    return Array.from(this.records.values());
  }

  setDetectedMeshes(meshes: Map<string, DetectedMesh>) {
    for (const record of this.records.values()) {
      record.detectedMesh = meshes.get(record.id);
    }
  }

  removeObjects(ids: string[]) {
    const changed = this.removeRecords(ids);
    if (changed) this.onChanged?.();
    return this;
  }

  private removeRecords(ids: string[]) {
    let changed = false;
    for (const id of ids) {
      const record = this.records.get(id);
      if (!record) continue;
      this.disposeRecord(record);
      this.records.delete(id);
      changed = true;
    }
    return changed;
  }

  clear() {
    const changed = this.removeRecords(Array.from(this.records.keys()));
    if (changed) this.onChanged?.();
    return this;
  }

  reset() {
    this.removeRecords(Array.from(this.records.keys()));
    this.nextId = 1;
  }

  physicsStep() {
    for (const record of this.records.values()) {
      if (record.definition.physics !== 'dynamic' || !record.rigidBody)
        continue;
      const translation = record.rigidBody.translation();
      const rotation = record.rigidBody.rotation();
      worldPosition.set(translation.x, translation.y, translation.z);
      worldQuaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      const parent = record.object.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        localPosition.copy(worldPosition);
        parent.worldToLocal(localPosition);
        parent.getWorldQuaternion(parentQuaternion).invert();
        record.object.position.copy(localPosition);
        record.object.quaternion.copy(
          parentQuaternion.multiply(worldQuaternion)
        );
      } else {
        record.object.position.copy(worldPosition);
        record.object.quaternion.copy(worldQuaternion);
      }
      record.object.updateWorldMatrix(true, true);
      if (record.detectedMesh) {
        record.detectedMesh.position.copy(worldPosition);
        record.detectedMesh.quaternion.copy(worldQuaternion);
        record.detectedMesh.updateWorldMatrix(true, true);
        const virtualBody = record.detectedMesh.getRigidBody;
        virtualBody?.setTranslation(worldPosition, false);
        virtualBody?.setRotation(worldQuaternion, false);
      }
    }
  }

  private createPhysics(record: SimulatorObjectRecord) {
    const mode = record.definition.physics ?? false;
    if (!mode || !this.physics) return;
    const geometry = record.physicsGeometry;
    if (!geometry) {
      throw new Error(
        `Simulator object '${record.id}' has no mesh geometry for physics.`
      );
    }
    record.object.getWorldPosition(worldPosition);
    record.object.getWorldQuaternion(worldQuaternion);
    const bodyDesc = this.createBodyDesc(mode)
      .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
      .setRotation(worldQuaternion);
    const body = this.physics.world.createRigidBody(bodyDesc);
    const vertices = geometryVertices(geometry);
    let colliderDesc = this.physics.RAPIER.ColliderDesc.convexHull(vertices);
    if (!colliderDesc) {
      geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      geometry.boundingBox!.getSize(size).multiplyScalar(0.5);
      colliderDesc = this.physics.RAPIER.ColliderDesc.cuboid(
        Math.max(size.x, 0.001),
        Math.max(size.y, 0.001),
        Math.max(size.z, 0.001)
      );
    }
    record.rigidBody = body;
    this.physics.world.createCollider(colliderDesc, body);
    geometry.dispose();
    record.physicsGeometry = undefined;
  }

  private removePhysics(record: SimulatorObjectRecord) {
    if (this.physics && record.rigidBody) {
      this.physics.world.removeRigidBody(record.rigidBody);
      record.rigidBody = undefined;
    }
    record.physicsGeometry?.dispose();
    record.physicsGeometry = undefined;
  }

  private createBodyDesc(mode: Exclude<SimulatorPhysicsMode, false>) {
    return mode === 'dynamic'
      ? this.physics!.RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true)
      : this.physics!.RAPIER.RigidBodyDesc.fixed();
  }

  private disposeRecord(record: SimulatorObjectRecord) {
    this.removePhysics(record);
    record.object.removeFromParent();
    if (record.ownsObject) disposeObjectTree(record.object);
  }

  dispose() {
    this.reset();
    this.onChanged = undefined;
    this.group = undefined;
    this.physics = undefined;
    this.renderer = undefined;
  }
}
