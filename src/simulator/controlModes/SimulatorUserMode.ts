import {SimulatorControlMode} from './SimulatorControlMode.js';

export class SimulatorUserMode extends SimulatorControlMode {
  onModeActivated() {
    this.disableSimulatorHands();
    this.input.mouseController.connect();
  }

  onModeDeactivated() {
    this.input.mouseController.disconnect();
  }

  /**
   * In User mode, hands are hidden — switch to a hand-visible mode
   * before cycling so the change is visible.
   */
  override cycleHandPose(direction: number) {
    this.cycleSimulatorMode();
    super.cycleHandPose(direction);
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
    if (this.input.mouseController.userData.connected) {
      this.input.updateController(this.input.mouseController);
    }
    if (event.buttons & 2) {
      this.rotateOnPointerMove(event, this.camera.quaternion);
    }
  }
}
