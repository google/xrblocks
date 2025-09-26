import * as THREE from 'three';

import {Script} from '../core/Script';
import {Reticle} from '../ui/core/Reticle';
import {AnimatableNumber} from '../ui/interaction/AnimatableNumber';

import {Controller} from './Controller';

/**
 * A threshold for gaze movement speed (in units per second) to determine if the
 * user's gaze is stable. If the reticle moves faster than this, the selection
 * timer resets.
 */
const PRESS_MOVEMENT_THRESHOLD = 0.2;

interface GazeControllerEventMap extends THREE.Object3DEventMap {
  connected: {target: GazeController};
  disconnected: {target: GazeController};
  selectstart: {target: GazeController};
  selectend: {target: GazeController};
}

/**
 * Implements a gaze-based controller for XR interactions.
 * This allows users to select objects by looking at them for a set duration.
 * It functions as a virtual controller that is always aligned with the user's
 * camera (head pose).
 * WebXR Eye Tracking is not yet available. This API simulates a reticle
 * at the center of the field of view for simulating gaze-based interaction.
 */
export class GazeController extends Script<GazeControllerEventMap> implements
    Controller {
  static dependencies = {camera: THREE.Camera};

  /**
   * User data for the controller, including its connection status, unique ID,
   * and selection state.
   */
  userData = {connected: false, id: 2, selected: false};

  /**
   * The visual indicator for where the user is looking.
   */
  reticle = new Reticle();

  /**
   * The time in seconds the user must gaze at an object to trigger a selection.
   */
  activationTimeSeconds = 1.5;

  /**
   * An animatable number that tracks the progress of the gaze selection, from
   * 0.0 to 1.0.
   */
  activationAmount =
      new AnimatableNumber(0.0, 0.0, 1.0, 1.0 / this.activationTimeSeconds);

  /**
   * Stores the reticle's position from the previous frame to calculate movement
   * speed.
   */
  lastReticlePosition = new THREE.Vector3();

  /**
   * A clock to measure the time delta between frames for smooth animation and
   * movement calculation.
   */
  clock = new THREE.Clock();

  camera!: THREE.Camera;

  init({camera}: {camera: THREE.Camera}) {
    this.camera = camera;
  }

  /**
   * The main update loop, called every frame by the core engine.
   * It handles syncing the controller with the camera and manages the gaze
   * selection logic.
   */
  update() {
    super.update();
    this.position.copy(this.camera.position);
    this.quaternion.copy(this.camera.quaternion);
    this.updateMatrixWorld();
    const delta = this.clock.getDelta();
    this.activationAmount.update(delta);
    const movement =
        this.lastReticlePosition.distanceTo(this.reticle.position) / delta;
    if (movement > PRESS_MOVEMENT_THRESHOLD) {
      this.activationAmount.value = 0.0;
      if (this.userData.selected) {
        this.callSelectEnd();
      }
      this.userData.selected = false;
    }
    if (this.activationAmount.value == 1.0 && !this.userData.selected) {
      this.callSelectStart();
    }
    this.updateReticleScale();
    this.lastReticlePosition.copy(this.reticle.position);
  }

  /**
   * Updates the reticle's scale and shader uniforms to provide visual feedback
   * for gaze activation. The reticle shrinks and fills in as the activation
   * timer progresses.
   */
  updateReticleScale() {
    this.reticle.setPressedAmount(this.activationAmount.value);
  }

  /**
   * Dispatches a 'selectstart' event, signaling that a gaze selection has been
   * initiated.
   */
  callSelectStart() {
    this.dispatchEvent({type: 'selectstart', target: this});
  }

  /**
   * Dispatches a 'selectend' event, signaling that a gaze selection has been
   * released (e.g., by moving gaze).
   */
  callSelectEnd() {
    this.dispatchEvent({type: 'selectend', target: this});
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
