import * as THREE from 'three';

import {WaitFrame} from '../../core/components/WaitFrame';
import {UP} from '../../utils/HelperConstants';
import {clampRotationToAngle, lookAtRotation} from '../../utils/RotationUtils';
import {clamp} from '../../utils/utils';
import {SimulatorUser} from '../SimulatorUser';

import {SimulatorUserAction} from './SimulatorUserAction';

const NEAR_TARGET_DISTANCE = 0.5;
const NEAR_TARGET_THRESHOLD = 0.1;
const LOOK_AT_ANGLE_THRESHOLD = 3 * Math.PI / 180;
const MOVEMENT_SPEED_METERS_PER_SECOND = 1;
const ROTATION_SPEED_RADIANS_PER_SECOND = 1;

// Temporary variables.
const targetWorldPosition = new THREE.Vector3();
const cameraToTargetVector = new THREE.Vector3();
// A position close to the target to move to.
const closeToTargetPosition = new THREE.Vector3();
const deltaRotation = new THREE.Quaternion();
const finalRotation = new THREE.Quaternion();
const inverseCameraRotation = new THREE.Quaternion();

/**
 * Represents a action to walk towards a panel or object.
 */
export class WalkTowardsPanelAction extends SimulatorUserAction {
  static dependencies = {camera: THREE.Camera, timer: THREE.Timer};
  camera!: THREE.Camera;
  timer!: THREE.Timer;

  constructor(private target: THREE.Object3D) {
    super();
  }

  async init({camera, timer}: {camera: THREE.Camera, timer: THREE.Timer}) {
    this.camera = camera;
    this.timer = timer;
  }

  isLookingAtTarget() {
    const camera = this.camera;
    this.target.getWorldPosition(targetWorldPosition);
    cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
    lookAtRotation(cameraToTargetVector, UP, finalRotation);
    const angle =
        (finalRotation.angleTo(camera.quaternion) + Math.PI) % (2 * Math.PI) -
        Math.PI;
    return angle < LOOK_AT_ANGLE_THRESHOLD;
  }

  isNearTarget() {
    const camera = this.camera;
    this.target.getWorldPosition(targetWorldPosition);
    cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
    return Math.abs(cameraToTargetVector.length() - NEAR_TARGET_DISTANCE) <
        NEAR_TARGET_THRESHOLD;
  }

  lookAtTarget() {
    const camera = this.camera;
    inverseCameraRotation.copy(camera.quaternion).invert();
    this.target.getWorldPosition(targetWorldPosition);
    cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
    lookAtRotation(cameraToTargetVector, UP, finalRotation);
    camera.quaternion.copy(finalRotation);
  }

  lookTowardsTarget() {
    const camera = this.camera;
    inverseCameraRotation.copy(camera.quaternion).invert();
    const deltaTime = this.timer.getDelta();
    this.target.getWorldPosition(targetWorldPosition);
    cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
    lookAtRotation(cameraToTargetVector, UP, finalRotation);
    deltaRotation.copy(finalRotation).multiply(inverseCameraRotation);
    clampRotationToAngle(
        deltaRotation, ROTATION_SPEED_RADIANS_PER_SECOND * deltaTime);
    camera.quaternion.premultiply(deltaRotation);
  }

  moveTowardsTarget() {
    const camera = this.camera;
    const deltaTime = this.timer.getDelta();
    this.target.getWorldPosition(targetWorldPosition);
    cameraToTargetVector.copy(targetWorldPosition).sub(camera.position);
    closeToTargetPosition.copy(targetWorldPosition)
        .addScaledVector(cameraToTargetVector, -NEAR_TARGET_THRESHOLD);
    const cameraToCloseToTarget = closeToTargetPosition.sub(camera.position);
    const movementDistance = clamp(
        cameraToCloseToTarget.length(), 0,
        MOVEMENT_SPEED_METERS_PER_SECOND * deltaTime);
    camera.position.addScaledVector(
        cameraToCloseToTarget,
        movementDistance / cameraToCloseToTarget.length());
  }

  async play({simulatorUser, journeyId, waitFrame}: {
    simulatorUser: SimulatorUser,
    journeyId: number,
    waitFrame: WaitFrame
  }) {
    let isLookingAtTarget = this.isLookingAtTarget();
    let isNearTarget = this.isNearTarget();
    let shouldContinueJourney = simulatorUser.isOnJourneyId(journeyId);

    while (shouldContinueJourney && (!isLookingAtTarget || !isNearTarget)) {
      if (!isLookingAtTarget) {
        this.lookTowardsTarget();
      } else {
        this.lookAtTarget();
        this.moveTowardsTarget();
      }
      await waitFrame.waitFrame();
      isLookingAtTarget = this.isLookingAtTarget();
      isNearTarget = this.isNearTarget();
      shouldContinueJourney = simulatorUser.isOnJourneyId(journeyId);
    }
  }
}
