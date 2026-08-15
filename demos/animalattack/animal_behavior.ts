import * as THREE from 'three';
import {InteractionUtils} from './interaction_utils.js';

const ENV_HIT_DISTANCE_MAX = 8;
const DRAG_LERP_POS = 0.5;
const DRAG_LERP_QUAT = 0.2;
const ACTIVE_Y_THRESHOLD = -50;
const TARGET_REACHED_DISTANCE = 0.05;
const DEFAULT_SPEED = 0.15;
const DEFAULT_TURN_SPEED = 2.0;

const DASH_RADIUS = 3.5;
const NORMAL_RADIUS = 1.5;
const WANDER_VERT_RANGE_DASH_MIN = 1.5;
const WANDER_VERT_RANGE_DASH_MAX = 3.5;
const WANDER_VERT_RANGE_NORMAL_MIN = 0.8;
const WANDER_VERT_RANGE_NORMAL_MAX = 2.0;
const WANDER_VERT_ACTION_THRESHOLD_LOW = 0.2;
const WANDER_VERT_ACTION_THRESHOLD_MID = 0.4;
const MIN_SPEED_VERTICAL_ACTION = 0.8;
const RANDOM_Y_SPREAD = 1.0;
const WANDER_SPREAD_MANUAL = 1.0;
const WANDER_SPREAD_RAIN = 6.0;
const WANDER_Y_SPREAD_MIN = 1.5;
const WANDER_Y_SPREAD_MAX = 4.0;
const FLOOR_OFFSET = 0.3;

const ARC_HEIGHT_MIN = 0.2;
const ARC_HEIGHT_MULT = 0.4;

const DASH_PROBABILITY = 0.4;
const SPEED_DASH_MIN = 3.0;
const SPEED_DASH_MAX = 7.0;
const SPEED_NORMAL_MIN = 0.5;
const SPEED_NORMAL_MAX = 1.2;
const TURN_SPEED_MIN = 1.5;
const TURN_SPEED_MAX = 3.5;

const TARGET_QUAT_THRESHOLD = 0.005;
const TARGET_DIST_THRESHOLD = 0.001;

const BOB_SINE_MULT = 3.0;
const BOB_AMP = 0.005;

const FALL_SPEED = 12.0;
const FALL_GROUND_OFFSET = 1.5;

const BREATH_FREQ = 4;
const BREATH_AMP = 0.03;
const TALK_FREQ = 20;
const TALK_AMP = 0.15;

/**
 * Reusable vectors for intermediate math calculations during frame updates.
 * Multiple vectors are required to avoid overwriting values during chained operations
 * (e.g., cross products or interpolations) without allocating new memory and causing GC stutter.
 */
const sharedVectorA = new THREE.Vector3();
const sharedVectorB = new THREE.Vector3();
const sharedVectorC = new THREE.Vector3();
const sharedVectorD = new THREE.Vector3();

/** Reusable quaternions for rotation math without GC overhead. */
const sharedQuatA = new THREE.Quaternion();
const sharedQuatB = new THREE.Quaternion();

/** Reusable raycaster for intersection tests without GC overhead. */
const sharedRaycaster = new THREE.Raycaster();

/** Defines and updates behavioral states like wandering, falling, and dragging for animals. */
export class AnimalBehavior {
  /** Updates the transformation of an animal being actively dragged by the user. */
  public static updateDragTransform(
    isDragging: boolean,
    draggedAnimal: THREE.Object3D | null,
    dragSource: THREE.Object3D | null,
    raycaster: THREE.Raycaster,
    camera: THREE.Camera | null,
    depthMesh: THREE.Object3D | null | undefined,
    dragDistance: number
  ) {
    if (!isDragging || !draggedAnimal || !camera) return;

    if (dragSource) {
      dragSource.updateMatrixWorld(true);
      InteractionUtils.setRaycasterFromXRController(raycaster, dragSource);
    }

    const envHits = depthMesh ? raycaster.intersectObject(depthMesh) : [];
    const isEnvHit =
      envHits.length > 0 && envHits[0].distance < ENV_HIT_DISTANCE_MAX;
    const targetPoint = isEnvHit
      ? envHits[0].point
      : sharedVectorA
          .copy(raycaster.ray.origin)
          .add(
            sharedVectorB
              .copy(raycaster.ray.direction)
              .multiplyScalar(dragDistance)
          );

    draggedAnimal.position.lerp(targetPoint, DRAG_LERP_POS);

    const lookTarget = sharedVectorC.copy(camera.position);
    if (isEnvHit) lookTarget.y = draggedAnimal.position.y;

    const currentQuat = sharedQuatA.copy(draggedAnimal.quaternion);
    draggedAnimal.lookAt(lookTarget);
    const targetQuat = sharedQuatB.copy(draggedAnimal.quaternion);
    draggedAnimal.quaternion
      .copy(currentQuat)
      .slerp(targetQuat, DRAG_LERP_QUAT);
  }

  /** Advances the wander logic, assigning new targets and moving animals towards them. */
  public static updateWandering(
    spawnedAnimals: Map<number, THREE.Object3D>,
    depthMesh: THREE.Object3D | null | undefined,
    deltaTime: number,
    time: number,
    draggedAnimal: THREE.Object3D | null,
    camera: THREE.Camera | null
  ) {
    const downVector = sharedVectorD.set(0, -1, 0);

    for (const animal of spawnedAnimals.values()) {
      const {userData, position} = animal;

      if (
        animal === draggedAnimal ||
        position.y <= ACTIVE_Y_THRESHOLD ||
        userData.isFalling
      ) {
        if (userData) userData.hasTarget = false;
        continue;
      }

      if (!userData.targetPosition) {
        Object.assign(userData, {
          targetPosition: new THREE.Vector3(),
          targetQuat: new THREE.Quaternion(),
          isTurning: false,
          hasTarget: false,
          speed: DEFAULT_SPEED,
          turnSpeed: DEFAULT_TURN_SPEED,
          pauseTime: 0,
        });
      }

      if (userData.hasTarget) {
        const dist = Math.hypot(
          userData.targetPosition.x - position.x,
          userData.targetPosition.y - position.y,
          userData.targetPosition.z - position.z
        );
        if (dist < TARGET_REACHED_DISTANCE) userData.hasTarget = false;
      }

      if (!userData.hasTarget) {
        this.calculateWanderTarget(
          animal,
          camera,
          depthMesh,
          sharedRaycaster,
          downVector
        );
      }

      if (userData.hasTarget) {
        this.moveTowardsTarget(animal, deltaTime, time);
      }
    }
  }

  /** Calculates a new potential target position for a wandering animal. */
  private static computeNextPosition(
    animal: THREE.Object3D,
    isDash: boolean,
    verticalAction: number
  ) {
    const {position, quaternion, userData} = animal;
    let {x: newX, y: newY, z: newZ} = position;
    const radius = isDash ? DASH_RADIUS : NORMAL_RADIUS;

    const forward = sharedVectorA.set(0, 0, 1).applyQuaternion(quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, 1);
    forward.normalize();

    const angleOffset = THREE.MathUtils.randFloatSpread((Math.PI * 2) / 3);
    forward.applyAxisAngle(sharedVectorB.set(0, 1, 0), angleOffset);
    newX += forward.x * radius;
    newZ += forward.z * radius;

    const vertRange = isDash
      ? THREE.MathUtils.randFloat(
          WANDER_VERT_RANGE_DASH_MIN,
          WANDER_VERT_RANGE_DASH_MAX
        )
      : THREE.MathUtils.randFloat(
          WANDER_VERT_RANGE_NORMAL_MIN,
          WANDER_VERT_RANGE_NORMAL_MAX
        );

    if (verticalAction < WANDER_VERT_ACTION_THRESHOLD_LOW) {
      newY += vertRange;
      userData.speed = Math.max(userData.speed, MIN_SPEED_VERTICAL_ACTION);
    } else if (verticalAction < WANDER_VERT_ACTION_THRESHOLD_MID) {
      newY -= vertRange;
      userData.speed = Math.max(userData.speed, MIN_SPEED_VERTICAL_ACTION);
    } else {
      newY += THREE.MathUtils.randFloatSpread(RANDOM_Y_SPREAD);
    }

    return sharedVectorA.set(newX, newY, newZ);
  }

  /** Adjusts a target position to remain within allowed boundaries and above the floor. */
  private static applyWanderConstraints(
    animal: THREE.Object3D,
    pos: THREE.Vector3,
    spreadArea: number,
    depthMesh: THREE.Object3D | null | undefined,
    raycaster: THREE.Raycaster,
    downVector: THREE.Vector3
  ) {
    const {homeAnchor} = animal.userData;
    const newX = THREE.MathUtils.clamp(
      pos.x,
      homeAnchor.x - spreadArea,
      homeAnchor.x + spreadArea
    );
    const newZ = THREE.MathUtils.clamp(
      pos.z,
      homeAnchor.z - spreadArea,
      homeAnchor.z + spreadArea
    );
    let newY = THREE.MathUtils.clamp(
      pos.y,
      homeAnchor.y - WANDER_Y_SPREAD_MIN,
      homeAnchor.y + WANDER_Y_SPREAD_MAX
    );

    if (depthMesh) {
      raycaster.set(
        sharedVectorA.set(newX, animal.position.y + 2.0, newZ),
        downVector
      );
      const hits = raycaster.intersectObject(depthMesh, true);
      if (hits.length > 0) {
        const floorY = hits[0].point.y;
        if (newY < floorY + FLOOR_OFFSET)
          newY = floorY + FLOOR_OFFSET + Math.random() * RANDOM_Y_SPREAD;
      }
    }
    return sharedVectorA.set(newX, newY, newZ);
  }

  /** Prepares an arc vector to give animals a bouncing or jumping movement path. */
  private static setupParabolicMovement(
    animal: THREE.Object3D,
    isDash: boolean
  ) {
    const {targetPosition, startPosition} = animal.userData;
    const moveDir = sharedVectorB.subVectors(targetPosition, startPosition);
    const moveDist = moveDir.length();

    const arcAxis = sharedVectorC.set(0, 1, 0);
    if (Math.abs(moveDir.normalize().y) > 0.8) arcAxis.set(1, 0, 0);

    if (isDash || Math.random() > 0.5) {
      arcAxis
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize();
    }

    const arcHeight =
      (Math.random() * ARC_HEIGHT_MULT + ARC_HEIGHT_MIN) * moveDist;

    if (!animal.userData.arcVector) {
      animal.userData.arcVector = new THREE.Vector3();
    }
    animal.userData.arcVector.copy(arcAxis).multiplyScalar(arcHeight);
  }

  /** Initializes the target rotation for an animal to turn towards its next position. */
  private static setupTargetRotation(animal: THREE.Object3D) {
    const {userData, position, quaternion} = animal;
    userData.hasTarget = true;
    userData.isTurning = true;

    const targetLookAt = sharedVectorD.copy(userData.targetPosition);
    targetLookAt.y = position.y;

    const currentQuat = sharedQuatA.copy(quaternion);
    animal.lookAt(targetLookAt);
    userData.targetQuat.copy(quaternion);
    quaternion.copy(currentQuat);
  }

  /** Determines a new random wander destination and configures movement parameters. */
  private static calculateWanderTarget(
    animal: THREE.Object3D,
    _camera: THREE.Camera | null,
    depthMesh: THREE.Object3D | null | undefined,
    raycaster: THREE.Raycaster,
    downVector: THREE.Vector3
  ) {
    const {userData, position} = animal;
    const isManual = userData.spawnSource !== 'rain';

    if (!userData.homeAnchor) {
      userData.homeAnchor = new THREE.Vector3();
      userData.homeAnchor.copy(position);
    }

    const spreadArea = isManual ? WANDER_SPREAD_MANUAL : WANDER_SPREAD_RAIN;
    const isDash = Math.random() < DASH_PROBABILITY;
    const verticalAction = Math.random();

    userData.speed = isDash
      ? THREE.MathUtils.randFloat(SPEED_DASH_MIN, SPEED_DASH_MAX)
      : THREE.MathUtils.randFloat(SPEED_NORMAL_MIN, SPEED_NORMAL_MAX);
    userData.turnSpeed = THREE.MathUtils.randFloat(
      TURN_SPEED_MIN,
      TURN_SPEED_MAX
    );

    const targetPos = this.computeNextPosition(animal, isDash, verticalAction);
    const constrainedPos = this.applyWanderConstraints(
      animal,
      targetPos,
      spreadArea,
      depthMesh,
      raycaster,
      downVector
    );

    userData.targetPosition.copy(constrainedPos);

    if (!userData.startPosition) {
      userData.startPosition = new THREE.Vector3();
    }
    userData.startPosition.copy(position);
    userData.moveProgress = 0;

    this.setupParabolicMovement(animal, isDash);
    this.setupTargetRotation(animal);
  }

  /** Animates an animal moving step-by-step towards its current target position. */
  private static moveTowardsTarget(
    animal: THREE.Object3D,
    deltaTime: number,
    time: number
  ) {
    const {userData, position, quaternion} = animal;

    if (userData.isTurning) {
      quaternion.slerp(userData.targetQuat, deltaTime * userData.turnSpeed);
      if (
        1.0 - Math.abs(quaternion.dot(userData.targetQuat)) <
        TARGET_QUAT_THRESHOLD
      ) {
        quaternion.copy(userData.targetQuat);
        userData.isTurning = false;
      }
    }

    const {targetPosition, startPosition} = userData;
    if (!startPosition) {
      userData.hasTarget = false;
      return;
    }

    const totalDist = startPosition.distanceTo(targetPosition);
    if (totalDist < TARGET_DIST_THRESHOLD) {
      position.copy(targetPosition);
      userData.hasTarget = false;
      return;
    }

    userData.moveProgress += (userData.speed * deltaTime) / totalDist;

    if (userData.moveProgress >= 1.0) {
      position.copy(targetPosition);
      userData.hasTarget = false;
    } else {
      const t = userData.moveProgress;
      position.lerpVectors(startPosition, targetPosition, t);

      if (userData.arcVector) {
        position.addScaledVector(userData.arcVector, 4 * t * (1 - t));
      }
    }

    position.y +=
      Math.sin(time * (BOB_SINE_MULT + userData.speed) + userData.animalIndex) *
      BOB_AMP;
  }

  /** Simulates gravity for animals spawned via the rain mechanic. */
  public static updateFalling(
    spawnedAnimals: Map<number, THREE.Object3D>,
    depthMesh: THREE.Object3D | null | undefined,
    particleSystem: {spawnSparks: (pos: THREE.Vector3) => void},
    camera: THREE.Camera | null,
    deltaTime: number,
    draggedAnimal: THREE.Object3D | null
  ) {
    for (const animal of spawnedAnimals.values()) {
      const {position, userData} = animal;
      if (
        position.y > ACTIVE_Y_THRESHOLD &&
        userData.isFalling &&
        animal !== draggedAnimal
      ) {
        position.y -= deltaTime * FALL_SPEED;
        let groundY = camera
          ? camera.position.y - FALL_GROUND_OFFSET
          : -FALL_GROUND_OFFSET;

        if (depthMesh) {
          sharedRaycaster.set(
            sharedVectorA.set(position.x, position.y + 1, position.z),
            sharedVectorB.set(0, -1, 0)
          );
          const hits = sharedRaycaster.intersectObject(depthMesh);
          if (hits.length > 0) groundY = hits[0].point.y;
        }

        if (position.y <= groundY) {
          position.y = groundY;
          userData.isFalling = false;

          if (!userData.anchorPosition) {
            userData.anchorPosition = new THREE.Vector3();
          }
          userData.anchorPosition.copy(position);
          particleSystem.spawnSparks(position);
        }
      }
    }
  }

  /** Applies a subtle scale oscillation to animals to simulate breathing or talking. */
  public static updateBreathing(
    spawnedAnimals: Map<number, THREE.Object3D>,
    time: number,
    animalModels: {scale: number; talking?: boolean}[],
    isDragging: boolean
  ) {
    for (const modelViewer of spawnedAnimals.values()) {
      const {userData, scale} = modelViewer;
      const animalData = animalModels[userData.typeIndex];
      const baseScale = animalData.scale;
      const breath =
        baseScale +
        Math.sin(time * BREATH_FREQ + userData.animalIndex) *
          (baseScale * BREATH_AMP);
      let scaleY = breath;

      if (animalData.talking && !isDragging) {
        scaleY +=
          Math.max(0, Math.sin(time * TALK_FREQ)) * (baseScale * TALK_AMP);
      }
      scale.set(breath, scaleY, breath);
    }
  }
}
