import * as THREE from 'three';

import {AnchorManager, TrackedAnchor} from './AnchorManager';
import {AnchorRecord} from './AnchorTypes';

/**
 * Builds the object to represent a restored anchor.
 *
 * Returning null skips the record, which is how an app ignores anchors it no
 * longer has content for.
 *
 * @param label - The label the anchor was saved with.
 * @param record - The full saved record.
 * @returns The object to place, or null to skip.
 */
export type AnchoredObjectFactory = (
  label: string,
  record: AnchorRecord
) => THREE.Object3D | null;

/**
 * Builds a pose, using the platform type when it exists.
 *
 * XRRigidTransform is a browser global that is absent outside a WebXR-capable
 * page, so constructing it unconditionally would make this unusable under test
 * and in the simulator. The simulated path only reads position and orientation,
 * and a real device always provides the constructor.
 *
 * @param position - World position.
 * @param quaternion - World orientation.
 * @returns A pose accepted by the anchor subsystem.
 */
function makePose(
  position: THREE.Vector3,
  quaternion: THREE.Quaternion
): XRRigidTransform {
  const p = {x: position.x, y: position.y, z: position.z};
  const o = {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
  const Ctor = (
    globalThis as unknown as {
      XRRigidTransform?: new (p: object, o: object) => XRRigidTransform;
    }
  ).XRRigidTransform;
  return Ctor
    ? new Ctor(p, o)
    : ({position: p, orientation: o} as unknown as XRRigidTransform);
}

/**
 * Keeps `THREE.Object3D`s attached to spatial anchors.
 *
 * {@link AnchorManager} deals in anchors and poses; every app on top of it
 * otherwise repeats the same work of holding a map from anchor to object and
 * copying poses across each frame. This owns that, so an app anchors an object
 * and then forgets about it.
 */
export class AnchoredObjects {
  private readonly objects = new Map<string, THREE.Object3D>();

  /**
   * @param manager - The anchor subsystem to attach through.
   * @param parent - Object to add anchored content to, usually the scene.
   */
  constructor(
    private readonly manager: AnchorManager,
    private readonly parent: THREE.Object3D
  ) {}

  /**
   * Anchors an object where it currently sits, and saves it.
   *
   * @param object - Object to pin. Added to the parent if not already in it.
   * @param label - Label to restore it by later.
   * @returns The tracked anchor, or null when anchoring is unavailable.
   */
  async anchor(
    object: THREE.Object3D,
    label: string
  ): Promise<TrackedAnchor | null> {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    object.getWorldPosition(position);
    object.getWorldQuaternion(quaternion);

    const tracked = await this.manager.create(
      makePose(position, quaternion),
      label
    );
    if (!tracked) return null;

    await this.manager.persist(tracked.id);
    if (object.parent !== this.parent) this.parent.add(object);
    this.objects.set(tracked.id, object);
    return tracked;
  }

  /**
   * Rebuilds objects for every anchor saved in a previous session.
   *
   * @param factory - Builds the object for a restored anchor.
   * @returns How many objects were restored.
   */
  async restore(factory: AnchoredObjectFactory): Promise<number> {
    let restored = 0;
    for (const result of await this.manager.restoreAll()) {
      if (result.status !== 'restored' || !result.anchor) continue;
      const object = factory(result.record.label, result.record);
      if (!object) continue;
      this.parent.add(object);
      this.objects.set(result.anchor.id, object);
      restored++;
    }
    return restored;
  }

  /**
   * Moves every attached object onto its anchor's current pose.
   *
   * Call once per frame. Anchors drift as the platform refines its map of the
   * room, which is the whole point of anchoring rather than storing a position.
   *
   * @param referenceSpace - Space to read poses in. Not needed for simulated
   *     anchors, which hold their own pose.
   */
  update(referenceSpace?: XRReferenceSpace): void {
    for (const [id, object] of this.objects) {
      const pose = this.manager.getPose(id, referenceSpace);
      if (!pose) continue;
      const {position, orientation} = pose.transform;
      object.position.set(position.x, position.y, position.z);
      object.quaternion.set(
        orientation.x,
        orientation.y,
        orientation.z,
        orientation.w
      );
    }
  }

  /**
   * Detaches an anchored object and forgets its anchor.
   * @param id - Id of the anchor to remove.
   */
  remove(id: string): void {
    const object = this.objects.get(id);
    if (object) {
      this.parent.remove(object);
      this.objects.delete(id);
    }
    this.manager.delete(id);
  }

  /**
   * The object attached to an anchor.
   * @param id - Id of the anchor.
   * @returns The object, or undefined.
   */
  get(id: string): THREE.Object3D | undefined {
    return this.objects.get(id);
  }

  /**
   * Every attached object, keyed by anchor id.
   * @returns The attached objects.
   */
  getAll(): ReadonlyMap<string, THREE.Object3D> {
    return this.objects;
  }

  /** Detaches everything and forgets every saved anchor. */
  clear(): void {
    for (const id of [...this.objects.keys()]) this.remove(id);
    this.manager.forgetAll();
  }
}
