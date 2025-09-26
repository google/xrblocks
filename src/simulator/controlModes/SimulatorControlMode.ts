import * as THREE from 'three';

import {Input} from '../../input/Input.js';
import {Keycodes} from '../../utils/Keycodes';
import {SimulatorRenderMode} from '../SimulatorConstants';
import {SimulatorControllerState} from '../SimulatorControllerState';
import {SimulatorHands} from '../SimulatorHands.js';

const {A_CODE, D_CODE, E_CODE, Q_CODE, S_CODE, W_CODE} = Keycodes;
const vector3 = new THREE.Vector3();
const euler = new THREE.Euler();

export class SimulatorControlMode {
  camera!: THREE.Camera;
  input!: Input;
  timer!: THREE.Timer;

  /**
   * Create a SimulatorControlMode
   */
  constructor(
      protected simulatorControllerState: SimulatorControllerState,
      protected downKeys: Set<Keycodes>, protected hands: SimulatorHands,
      protected setStereoRenderMode: (_: SimulatorRenderMode) => void,
      protected toggleUserInterface: () => void) {}

  /**
   * Initialize the simulator control mode.
   */
  init({camera, input, timer}:
           {camera: THREE.Camera, input: Input, timer: THREE.Timer}) {
    this.camera = camera;
    this.input = input;
    this.timer = timer;
  }

  onPointerDown(_: MouseEvent) {}
  onPointerUp(_: MouseEvent) {}
  onPointerMove(_: MouseEvent) {}
  onKeyDown(event: KeyboardEvent) {
    if (event.code == Keycodes.DIGIT_1) {
      this.setStereoRenderMode(SimulatorRenderMode.STEREO_LEFT);
    } else if (event.code == Keycodes.DIGIT_2) {
      this.setStereoRenderMode(SimulatorRenderMode.STEREO_RIGHT);
    } else if (event.code == Keycodes.BACKQUOTE) {
      this.toggleUserInterface();
    }
  }
  onModeActivated() {}
  onModeDeactivated() {}

  update() {
    this.updateCameraPosition();
    this.updateControllerPositions();
  }

  updateCameraPosition() {
    const deltaTime = this.timer.getDelta();
    const cameraRotation = this.camera.quaternion;
    const cameraPosition = this.camera.position;
    const downKeys = this.downKeys;
    vector3
        .set(
            Number(downKeys.has(D_CODE)) - Number(downKeys.has(A_CODE)),
            Number(downKeys.has(Q_CODE)) - Number(downKeys.has(E_CODE)),
            Number(downKeys.has(S_CODE)) - Number(downKeys.has(W_CODE)),
            )
        .multiplyScalar(deltaTime)
        .applyQuaternion(cameraRotation)
    cameraPosition.add(vector3);
  }

  updateControllerPositions() {
    this.camera.updateMatrixWorld();
    for (let i = 0; i < 2; i++) {
      const controller = this.input.controllers[i];
      controller.position
          .copy(this.simulatorControllerState.localControllerPositions[i])
          .applyMatrix4(this.camera.matrixWorld);
      controller.quaternion
          .copy(this.simulatorControllerState.localControllerOrientations[i])
          .premultiply(this.camera.quaternion);
      controller.updateMatrix();
      const mesh =
          i == 0 ? this.hands.leftController : this.hands.rightController;
      mesh.position.copy(controller.position);
      mesh.quaternion.copy(controller.quaternion);
    }
  }

  rotateOnPointerMove(
      event: MouseEvent, objectQuaternion: THREE.Quaternion,
      multiplier = 0.002) {
    euler.setFromQuaternion(objectQuaternion, 'YXZ');
    euler.y += event.movementX * multiplier;
    euler.x += event.movementY * multiplier;

    // Clamp camera pitch to +/-90 deg (+/-1.57 rad) with a 0.01 rad (0.573 deg)
    // buffer to prevent gimbal lock.
    const PI_2 = Math.PI / 2;
    euler.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, euler.x));

    objectQuaternion.setFromEuler(euler);
  }

  enableSimulatorHands() {
    this.hands.showHands();
    this.input.dispatchEvent({
      type: 'connected',
      target: this.input.controllers[0],
      data: {handedness: 'left'}
    });
    this.input.dispatchEvent({
      type: 'connected',
      target: this.input.controllers[1],
      data: {handedness: 'right'}
    });
  }

  disableSimulatorHands() {
    this.hands.hideHands();
    this.input.dispatchEvent({
      type: 'disconnected',
      target: this.input.controllers[0],
      data: {handedness: 'left'}
    });
    this.input.dispatchEvent({
      type: 'disconnected',
      target: this.input.controllers[1],
      data: {handedness: 'right'}
    });
  }
}
