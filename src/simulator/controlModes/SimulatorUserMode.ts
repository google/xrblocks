import {ModelViewer} from '../../ui/interaction/ModelViewer.js';

import {SimulatorControlMode} from './SimulatorControlMode.js';

const WHEEL_SCALE_SPEED = 0.001;
// Approximate one line-mode wheel unit as 16 CSS pixels.
const WHEEL_LINE_HEIGHT = 16;

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

  override onWheel(event: WheelEvent) {
    let deltaY = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      deltaY *= WHEEL_LINE_HEIGHT;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      deltaY *= this.domElement?.clientHeight || window.innerHeight;
    }
    if (deltaY === 0) {
      return false;
    }

    const mouseController = this.input.mouseController;
    mouseController.updateMousePositionFromEvent(event);
    if (!mouseController.userData.connected) {
      return false;
    }
    this.input.updateController(mouseController);

    let target =
      this.input.intersectionsForController.get(mouseController)?.[0]?.object;
    while (target && !(target instanceof ModelViewer)) {
      target = target.parent ?? undefined;
    }
    if (!(target instanceof ModelViewer) || !target.scalable) {
      return false;
    }

    target.scale.multiplyScalar(Math.exp(-deltaY * WHEEL_SCALE_SPEED));
    return true;
  }
}
