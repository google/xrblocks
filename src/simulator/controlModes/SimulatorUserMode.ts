import {SimulatorControlMode} from './SimulatorControlMode.js';

export class SimulatorUserMode extends SimulatorControlMode {
  onModeActivated() {
    this.disableSimulatorHands();
    this.input.mouseController.connect();
  }

  onModeDeactivated() {
    this.input.mouseController.disconnect();
  }

  onPointerDown(event: MouseEvent) {
    if (event.buttons & 1) {
      this.input.mouseController.callSelectStart();
    }
  }

  onPointerUp() {
    if (this.input.mouseController.userData.selected) {
      this.input.mouseController.callSelectEnd();
    }
  }

  onPointerMove(event: MouseEvent) {
    this.input.mouseController.updateMousePositionFromEvent(event);
    if (event.buttons & 2) {
      this.rotateOnPointerMove(event, this.camera.quaternion);
    }
  }
}
