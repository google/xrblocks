import * as THREE from 'three';

import {WaitFrame} from '../../core/components/WaitFrame';
import {Input} from '../../input/Input';
import {UP} from '../../utils/HelperConstants';
import {clampRotationToAngle, lookAtRotation} from '../../utils/RotationUtils';
import {Simulator} from '../Simulator';
import {SimulatorControls} from '../SimulatorControls';
import {SimulatorUser} from '../SimulatorUser.js';

import {SimulatorUserAction} from './SimulatorUserAction';

const LOOK_AT_ANGLE_THRESHOLD = 3 * Math.PI / 180;
const ROTATION_SPEED_RADIANS_PER_SECOND = 1;

const controllerToTargetVector = new THREE.Vector3();
const targetWorldPosition = new THREE.Vector3();
const targetPositionRelativeToCamera = new THREE.Vector3();
const inverseControllerRotation = new THREE.Quaternion();
const finalRotation = new THREE.Quaternion();
const deltaRotation = new THREE.Quaternion();

export class PinchOnButtonAction extends SimulatorUserAction {
  static dependencies = {
    simulator: Simulator,
    camera: THREE.Camera,
    timer: THREE.Timer,
    input: Input,
  };
  private simulator!: Simulator;
  private camera!: THREE.Camera;
  private timer!: THREE.Timer;
  private input!: Input;

  constructor(private target: THREE.Object3D) {
    super();
  }

  async init({simulator, camera, timer, input}: {
    simulator: Simulator,
    camera: THREE.Camera,
    timer: THREE.Timer,
    input: Input
  }) {
    this.simulator = simulator;
    this.camera = camera;
    this.timer = timer;
    this.input = input
  }

  controllerIsPointingAtButton(
      controls: SimulatorControls, camera: THREE.Camera) {
    const controllerState = controls.simulatorControllerState;
    const controllerIndex = controllerState.currentControllerIndex;
    const localControllerPosition =
        controllerState.localControllerPositions[controllerIndex];
    const localControllerRotation =
        controllerState.localControllerOrientations[controllerIndex];
    this.target.getWorldPosition(targetWorldPosition);
    targetPositionRelativeToCamera.copy(targetWorldPosition)
        .applyMatrix4(camera.matrixWorldInverse);

    inverseControllerRotation.copy(localControllerRotation).invert();
    controllerToTargetVector.copy(targetPositionRelativeToCamera)
        .sub(localControllerPosition);
    lookAtRotation(controllerToTargetVector, UP, finalRotation);
    const angle = (finalRotation.angleTo(localControllerRotation) + Math.PI) %
            (2 * Math.PI) -
        Math.PI;
    return angle < LOOK_AT_ANGLE_THRESHOLD;
  }

  rotateControllerTowardsButton(
      controls: SimulatorControls, camera: THREE.Camera, deltaTime: number) {
    const controllerState = controls.simulatorControllerState;
    const controllerIndex = controllerState.currentControllerIndex;
    const localControllerPosition =
        controllerState.localControllerPositions[controllerIndex];
    const localControllerRotation =
        controllerState.localControllerOrientations[controllerIndex];
    this.target.getWorldPosition(targetWorldPosition);
    targetPositionRelativeToCamera.copy(targetWorldPosition)
        .applyMatrix4(camera.matrixWorldInverse);

    inverseControllerRotation.copy(localControllerRotation).invert();
    controllerToTargetVector.copy(targetPositionRelativeToCamera)
        .sub(localControllerPosition);
    lookAtRotation(controllerToTargetVector, UP, finalRotation);
    deltaRotation.copy(finalRotation).multiply(inverseControllerRotation);
    clampRotationToAngle(
        deltaRotation, ROTATION_SPEED_RADIANS_PER_SECOND * deltaTime);
    localControllerRotation.premultiply(deltaRotation);
  }

  pinchController() {
    const simulator = this.simulator;
    const controllerState = simulator.controls.simulatorControllerState;
    const newSelectingState = true;
    this.input.dispatchEvent({
      type: newSelectingState ? 'selectstart' : 'selectend',
      target: this.input.controllers[controllerState.currentControllerIndex]
    });
    if (controllerState.currentControllerIndex == 0) {
      simulator.hands.setLeftHandPinching(newSelectingState);
    } else {
      simulator.hands.setRightHandPinching(newSelectingState);
    }
  }

  async play({simulatorUser, journeyId, waitFrame}: {
    simulatorUser: SimulatorUser,
    journeyId: number,
    waitFrame: WaitFrame
  }) {
    let pinchedOnButton = false;

    while (simulatorUser.isOnJourneyId(journeyId) && (!pinchedOnButton)) {
      const deltaTime = this.timer.getDelta();
      if (!this.controllerIsPointingAtButton(
              this.simulator.controls, this.camera)) {
        this.rotateControllerTowardsButton(
            this.simulator.controls, this.camera, deltaTime);
      } else {
        this.pinchController();
        pinchedOnButton = true;
      }
      await waitFrame.waitFrame();
    }
  }
}
