import * as THREE from 'three';

import {Keycodes} from '../../utils/Keycodes';

import {SimulatorControlMode} from './SimulatorControlMode';

const vector3 = new THREE.Vector3();
const {A_CODE, D_CODE, E_CODE, Q_CODE, S_CODE, SPACE_CODE, T_CODE, W_CODE} =
    Keycodes;

export class SimulatorControllerMode extends SimulatorControlMode {
  onPointerMove(event: MouseEvent) {
    if (event.buttons) {
      const controllerOrientation =
          this.simulatorControllerState
              .localControllerOrientations[this.simulatorControllerState
                                               .currentControllerIndex];
      this.rotateOnPointerMove(event, controllerOrientation, -0.002);
    }
  }

  override update() {
    this.updateControllerPositions();
  }

  onModeActivated() {
    this.enableSimulatorHands();
  }

  updateControllerPositions() {
    const deltaTime = this.timer.getDelta();
    const downKeys = this.downKeys;
    vector3
        .set(
            Number(downKeys.has(D_CODE)) - Number(downKeys.has(A_CODE)),
            Number(downKeys.has(Q_CODE)) - Number(downKeys.has(E_CODE)),
            Number(downKeys.has(S_CODE)) - Number(downKeys.has(W_CODE)),
            )
        .multiplyScalar(deltaTime);
    this.simulatorControllerState
        .localControllerPositions[this.simulatorControllerState
                                      .currentControllerIndex]
        .add(vector3);
    super.updateControllerPositions();
  }

  toggleControllerIndex() {
    this.hands.toggleHandedness();
  }

  onKeyDown(event: KeyboardEvent) {
    super.onKeyDown(event);
    if (event.code == T_CODE) {
      this.toggleControllerIndex();
    } else if (event.code == SPACE_CODE) {
      const controllerSelecting =
          this.input
              .controllers[this.simulatorControllerState.currentControllerIndex]
              .userData?.selected;
      const newSelectingState = !controllerSelecting;
      if (this.simulatorControllerState.currentControllerIndex == 0) {
        this.hands.setLeftHandPinching(newSelectingState);
      } else {
        this.hands.setRightHandPinching(newSelectingState);
      }
    }
  }
}
