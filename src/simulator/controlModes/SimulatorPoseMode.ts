
import {SimulatorControlMode} from './SimulatorControlMode.js';

export class SimulatorPoseMode extends SimulatorControlMode {
  onModeActivated() {
    this.enableSimulatorHands();
  }

  onPointerMove(event: MouseEvent) {
    if (event.buttons) {
      this.rotateOnPointerMove(event, this.camera.quaternion);
    }
  }
}
