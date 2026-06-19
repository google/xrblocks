import * as THREE from 'three';

import {Script} from '../core/Script.js';
import {Reticle} from '../ui/core/Reticle.js';
import {Controller} from '../input/Controller.js';

interface SimulatorPointerLockControllerEventMap
  extends THREE.Object3DEventMap {
  connected: {target: SimulatorPointerLockController};
  disconnected: {target: SimulatorPointerLockController};
  selectstart: {target: SimulatorPointerLockController};
  selectend: {target: SimulatorPointerLockController};
}

export class SimulatorPointerLockController
  extends Script<SimulatorPointerLockControllerEventMap>
  implements Controller
{
  static dependencies = {camera: THREE.Camera};
  type = 'SimulatorPointerLockController';
  name = 'Simulator Pointer Lock Controller';

  userData = {id: 4, connected: false, selected: false};
  reticle = new Reticle();
  camera!: THREE.Camera;

  init({camera}: {camera: THREE.Camera}) {
    this.camera = camera;
  }

  updatePose() {
    this.position.copy(this.camera.position);
    this.quaternion.copy(this.camera.quaternion);
    this.updateMatrixWorld();
  }

  update() {
    super.update();
    if (!this.userData.connected) return;
    this.updatePose();
  }

  callSelectStart() {
    this.dispatchEvent({type: 'selectstart', target: this});
  }

  callSelectEnd() {
    this.dispatchEvent({type: 'selectend', target: this});
  }

  connect() {
    this.dispatchEvent({type: 'connected', target: this});
  }

  disconnect() {
    this.dispatchEvent({type: 'disconnected', target: this});
  }
}
