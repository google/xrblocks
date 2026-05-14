import * as THREE from 'three';

import {GamepadController} from '../../input/GamepadController.js';
import {Input} from '../../input/Input.js';
import {Keycodes} from '../../utils/Keycodes';
import {SimulatorRenderMode} from '../SimulatorConstants';
import {SimulatorControllerState} from '../SimulatorControllerState';
import {SimulatorHands} from '../SimulatorHands.js';
import {SimulatorHandPose} from '../handPoses/HandPoses';

const {A_CODE, D_CODE, E_CODE, Q_CODE, S_CODE, W_CODE} = Keycodes;
const vector3 = new THREE.Vector3();
const euler = new THREE.Euler();
const HAND_POSES = Object.values(SimulatorHandPose);

export class SimulatorControlMode {
  camera!: THREE.Camera;
  input!: Input;
  timer!: THREE.Timer;

  /**
   * Create a SimulatorControlMode
   */
  constructor(
    protected simulatorControllerState: SimulatorControllerState,
    protected downKeys: Set<Keycodes>,
    protected hands: SimulatorHands,
    protected setStereoRenderMode: (_: SimulatorRenderMode) => void,
    protected toggleUserInterface: () => void,
    protected cycleSimulatorMode: () => void = () => {}
  ) {}

  /**
   * Initialize the simulator control mode.
   */
  init({
    camera,
    input,
    timer,
  }: {
    camera: THREE.Camera;
    input: Input;
    timer: THREE.Timer;
  }) {
    this.camera = camera;
    this.input = input;
    this.timer = timer;
    input.gamepadController.init({camera});
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
    this.updateGamepad();
    this.updateCameraPosition();
    this.updateControllerPositions();
  }

  /**
   * Poll the gamepad and handle button actions. Called from all modes.
   */
  updateGamepad() {
    const gp = this.input.gamepadController;
    gp.update();
    if (gp.userData.connected) {
      this.updateGamepadUI(gp);
    }
  }

  updateCameraPosition() {
    const gp = this.input.gamepadController;
    // While a modal menu owns gamepad input, don't move the camera.
    if (gp.menuActive) return;

    const deltaTime = this.timer.getDelta();
    const cameraRotation = this.camera.quaternion;
    const cameraPosition = this.camera.position;
    const downKeys = this.downKeys;
    vector3
      .set(
        Number(downKeys.has(D_CODE)) - Number(downKeys.has(A_CODE)),
        Number(downKeys.has(Q_CODE)) - Number(downKeys.has(E_CODE)),
        Number(downKeys.has(S_CODE)) - Number(downKeys.has(W_CODE))
      )
      .multiplyScalar(deltaTime)
      .applyQuaternion(cameraRotation);
    cameraPosition.add(vector3);

    // Gamepad stick input (if connected). Skip while the tab isn't
    // focused — the Gamepad API delivers state to every tab, so without
    // this guard the camera moves in background tabs whenever the user
    // touches the stick in the foreground tab.
    if (gp.userData.connected && document.hasFocus()) {
      const [lx, ly, rx, ry] = gp.getAxes();

      // Left stick → move camera.
      if (lx !== 0 || ly !== 0) {
        vector3
          .set(lx, 0, ly)
          .multiplyScalar(deltaTime)
          .applyQuaternion(cameraRotation);
        cameraPosition.add(vector3);
      }

      // Right stick → look (yaw + pitch).
      if (rx !== 0 || ry !== 0) {
        const LOOK_SPEED = 2.0;
        euler.setFromQuaternion(cameraRotation, 'YXZ');
        euler.y -= rx * LOOK_SPEED * deltaTime;
        euler.x -= ry * LOOK_SPEED * deltaTime;
        const PI_2 = Math.PI / 2;
        euler.x = Math.max(-PI_2 + 0.01, Math.min(PI_2 - 0.01, euler.x));
        cameraRotation.setFromEuler(euler);
      }

      // Configurable vertical movement bindings (defaults LT/RT, analog).
      const downVal = gp.getButtonValue(gp.bindings.getBinding('moveDown'));
      const upVal = gp.getButtonValue(gp.bindings.getBinding('moveUp'));
      const verticalDelta = (upVal - downVal) * deltaTime;
      if (verticalDelta !== 0) {
        cameraPosition.y += verticalDelta;
      }
    }
  }

  /**
   * Handle gamepad buttons for simulator UI using configurable bindings.
   */
  updateGamepadUI(gp: GamepadController) {
    // Suppress normal actions during rebind or while a modal menu owns input.
    if (gp.captureActive || gp.menuActive) return;

    const b = gp.bindings;

    if (gp.isButtonJustPressed(b.getBinding('cycleHandPoseLeft'))) {
      this.cycleHandPose(-1);
    }
    if (gp.isButtonJustPressed(b.getBinding('cycleHandPoseRight'))) {
      this.cycleHandPose(1);
    }
    if (gp.isButtonJustPressed(b.getBinding('cycleSimulatorMode'))) {
      this.cycleSimulatorMode();
    }
    if (gp.isButtonJustPressed(b.getBinding('toggleUI'))) {
      this.toggleUserInterface();
    }
    if (gp.isButtonJustPressed(b.getBinding('toggleHand'))) {
      this.hands.toggleHandedness();
    }
    if (gp.isButtonJustPressed(b.getBinding('openSettings'))) {
      gp.onOpenSettings?.();
    }
  }

  cycleHandPose(direction: number) {
    const idx = this.simulatorControllerState.currentControllerIndex;
    const currentPose =
      idx === 0 ? this.hands.leftHandPose : this.hands.rightHandPose;
    const currentIdx = HAND_POSES.indexOf(currentPose ?? HAND_POSES[0]);
    const nextIdx =
      (currentIdx + direction + HAND_POSES.length) % HAND_POSES.length;
    const nextPose = HAND_POSES[nextIdx];
    if (idx === 0) {
      this.hands.setLeftHandLerpPose(nextPose);
    } else {
      this.hands.setRightHandLerpPose(nextPose);
    }
  }

  updateControllerPositions() {
    this.camera.updateMatrixWorld();
    for (let i = 0; i < 2 && i < this.input.controllers.length; i++) {
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
    event: MouseEvent,
    objectQuaternion: THREE.Quaternion,
    multiplier = 0.002
  ) {
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
      data: {handedness: 'left'},
    });
    this.input.dispatchEvent({
      type: 'connected',
      target: this.input.controllers[1],
      data: {handedness: 'right'},
    });
  }

  disableSimulatorHands() {
    this.hands.hideHands();
    this.input.dispatchEvent({
      type: 'disconnected',
      target: this.input.controllers[0],
      data: {handedness: 'left'},
    });
    this.input.dispatchEvent({
      type: 'disconnected',
      target: this.input.controllers[1],
      data: {handedness: 'right'},
    });
  }
}
