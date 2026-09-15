import * as THREE from 'three';

import {Script} from '../core/Script';
import {Reticle} from '../interaction/reticle/Reticle';

import {Controller} from './Controller';

interface GazeControllerEventMap extends THREE.Object3DEventMap {
  connected: {target: GazeController};
  disconnected: {target: GazeController};
}

/**
 * Supplies a camera-aligned gaze ray for XR interactions. Interaction owns
 * target resolution and dwell selection.
 * WebXR Eye Tracking is not yet available. This API simulates a reticle
 * at the center of the field of view for simulating gaze-based interaction.
 */
export class GazeController
  extends Script<GazeControllerEventMap>
  implements Controller
{
  static dependencies = {camera: THREE.Camera};

  /**
   * User data for the controller, including its connection status, unique ID,
   * and selection state.
   */
  userData = {connected: false, id: 2, selected: false};

  /**
   * The visual indicator for where the user is looking.
   */
  reticle: Reticle | undefined = new Reticle();

  camera!: THREE.Camera;

  init({camera}: {camera: THREE.Camera}) {
    this.camera = camera;
  }

  /**
   * Syncs the controller with the camera before Input samples its ray.
   */
  updatePose() {
    this.position.copy(this.camera.position);
    this.quaternion.copy(this.camera.quaternion);
    this.updateMatrixWorld();
  }

  /**
   * Connects the gaze controller to the input system.
   */
  connect() {
    this.dispatchEvent({type: 'connected', target: this});
  }

  /**
   * Disconnects the gaze controller from the input system.
   */
  disconnect() {
    this.dispatchEvent({type: 'disconnected', target: this});
  }
}
