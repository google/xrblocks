import {SimulatorControlMode} from './SimulatorControlMode.js';
import {SimulatorPointerLockController} from '../SimulatorPointerLockController.js';

export class SimulatorPointerLockMode extends SimulatorControlMode {
  private isPointerLocked = false;
  readonly pointerLockController = new SimulatorPointerLockController();

  override init(params: Parameters<SimulatorControlMode['init']>[0]) {
    super.init(params);
  }

  onModeActivated() {
    this.disableSimulatorHands();
    this.input.enableController(this.pointerLockController);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  onModeDeactivated() {
    this.input.disableController(this.pointerLockController);
    this.exitLock();
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }

  private onPointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement === this.domElement;
  };

  private exitLock() {
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }
  }

  onPointerDown(event: MouseEvent) {
    if (!this.isPointerLocked && this.domElement) {
      this.domElement.requestPointerLock();
    } else if (this.isPointerLocked && event.buttons & 1) {
      this.pointerLockController.userData.selected = true;
      this.pointerLockController.callSelectStart();
    }
  }

  onPointerUp() {
    if (this.pointerLockController.userData.selected) {
      this.pointerLockController.userData.selected = false;
      this.pointerLockController.callSelectEnd();
    }
  }

  onPointerMove(event: MouseEvent) {
    if (this.isPointerLocked) {
      this.rotateOnPointerMove(event, this.camera.quaternion);
    }
  }
}
