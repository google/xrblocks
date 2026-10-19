/** Structural Rapier contracts shared by the standard, compat and SIMD builds.
 * Only the API used by the SDK is required; no package-private classes cross
 * this boundary. Applications retain their chosen module for additional APIs.
 */
export interface RapierVector {
  x: number;
  y: number;
  z: number;
}

export interface RapierRotation extends RapierVector {
  w: number;
}

export interface RapierRigidBodyDesc {
  setTranslation(x: number, y: number, z: number): RapierRigidBodyDesc;
  setRotation(rotation: RapierRotation): RapierRigidBodyDesc;
  setCcdEnabled(enabled: boolean): RapierRigidBodyDesc;
}

export interface RapierColliderDesc {
  setDensity(density: number): RapierColliderDesc;
  setFriction(friction: number): RapierColliderDesc;
  setRestitution(restitution: number): RapierColliderDesc;
}

export interface RapierRigidBody {
  translation(): RapierVector;
  rotation(): RapierRotation;
  setTranslation(translation: RapierVector, wakeUp: boolean): void;
  setRotation(rotation: RapierRotation, wakeUp: boolean): void;
  setEnabled(enabled: boolean): void;
}

export interface RapierCollider {
  readonly handle: number;
}

export interface RapierCharacterController {
  computeColliderMovement(
    collider: RapierCollider,
    movement: RapierVector
  ): void;
  computedMovement(): RapierVector;
  setSlideEnabled(enabled: boolean): void;
  setApplyImpulsesToDynamicBodies(enabled: boolean): void;
  setCharacterMass(mass: number): void;
}

export interface RapierEventQueue {
  free(): void;
  drainCollisionEvents(
    callback: (handle1: number, handle2: number, started: boolean) => void
  ): void;
}

export interface RapierShape {
  readonly type: number;
}

export interface RapierWorld {
  timestep: number;
  step(eventQueue?: RapierEventQueue): void;
  free(): void;
  createRigidBody(desc: RapierRigidBodyDesc): RapierRigidBody;
  removeRigidBody(body: RapierRigidBody): void;
  createCollider(
    desc: RapierColliderDesc,
    parent?: RapierRigidBody
  ): RapierCollider;
  removeCollider(collider: RapierCollider, wakeUp: boolean): void;
  createCharacterController(offset: number): RapierCharacterController;
  removeCharacterController(controller: RapierCharacterController): void;
  castShape(
    position: RapierVector,
    rotation: RapierRotation,
    velocity: RapierVector,
    shape: RapierShape,
    targetDistance: number,
    maxToi: number,
    stopAtPenetration: boolean,
    filterFlags?: number
  ): {time_of_impact: number} | null;
}

/** The module supplied by an application through options.physics.RAPIER. */
export interface RAPIERCompat {
  init?(): Promise<void>;
  World: new (gravity: RapierVector) => RapierWorld;
  EventQueue: new (autoDrain: boolean) => RapierEventQueue;
  Ball: new (radius: number) => RapierShape;
  RigidBodyDesc: {
    fixed(): RapierRigidBodyDesc;
    dynamic(): RapierRigidBodyDesc;
    kinematicPositionBased(): RapierRigidBodyDesc;
  };
  ColliderDesc: {
    ball(radius: number): RapierColliderDesc;
    cuboid(hx: number, hy: number, hz: number): RapierColliderDesc;
    convexHull(vertices: Float32Array): RapierColliderDesc | null;
    trimesh(vertices: Float32Array, indices: Uint32Array): RapierColliderDesc;
  };
  QueryFilterFlags: {ONLY_FIXED: number};
}
