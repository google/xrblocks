import * as THREE from 'three';

import {Script} from '../core/Script.js';

import {Controller} from './Controller.js';

/** Defines the event map for the MouseController's custom events. */
interface MouseControllerEventMap extends THREE.Object3DEventMap {
  connected: {target: MouseController};
  disconnected: {target: MouseController};
  selectstart: {target: MouseController};
  selectend: {target: MouseController};
}

/**
 * Simulates an XR controller using the mouse for desktop
 * environments. This class translates 2D mouse movements on the screen into a
 * 3D ray in the scene, allowing for point-and-click interactions in a
 * non-immersive context. It functions as a virtual controller that is always
 * aligned with the user's pointer.
 */
export class MouseController extends Script<MouseControllerEventMap> implements
    Controller {
  static dependencies = {
    camera: THREE.Camera,
  };

  /**
   * User data for the controller, including its connection status, unique ID,
   * and selection state (mouse button pressed).
   */
  userData = {id: 3, connected: false, selected: false};

  /** A THREE.Raycaster used to determine the 3D direction of the mouse. */
  raycaster = new THREE.Raycaster();

  /** A normalized vector representing the default forward direction. */
  forwardVector = new THREE.Vector3(0, 0, -1);

  /** A reference to the main scene camera. */
  camera!: THREE.Camera;

  constructor() {
    super();
  }

  /**
   * Initialize the MouseController
   */
  init({camera}: {camera: THREE.Camera}) {
    this.camera = camera;
  }

  /**
   * The main update loop, called every frame.
   * If connected, it syncs the controller's origin point with the camera's
   * position.
   */
  update() {
    super.update();
    if (!this.userData.connected) {
      return;
    }
    this.position.copy(this.camera.position);
  }

  /**
   * Updates the controller's transform based on the mouse's position on the
   * screen. This method sets both the position and rotation, ensuring the
   * object has a valid world matrix for raycasting.
   * @param event - The mouse event containing clientX and clientY coordinates.
   */
  updateMousePositionFromEvent(event: MouseEvent) {
    // The controller's origin point is always the camera's position.
    this.position.copy(this.camera.position);

    const mouse = new THREE.Vector2();
    // Converts mouse coordinates from screen space (pixels) to normalized
    // device coordinates (-1 to +1).
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Updates the raycaster and sets the controller's new rotation.
    this.raycaster.setFromCamera(mouse, this.camera);
    const rayDirection = this.raycaster.ray.direction;
    this.quaternion.setFromUnitVectors(this.forwardVector, rayDirection);
    this.updateMatrixWorld();
  }

  /**
   * Dispatches a 'selectstart' event, simulating the start of a controller
   * press (e.g., mouse down).
   */
  callSelectStart() {
    this.dispatchEvent({type: 'selectstart', target: this});
  }

  /**
   * Dispatches a 'selectend' event, simulating the end of a controller press
   * (e.g., mouse up).
   */
  callSelectEnd() {
    this.dispatchEvent({type: 'selectend', target: this});
  }

  /**
   * "Connects" the virtual controller, notifying the input system that it is
   * active.
   */
  connect() {
    this.dispatchEvent({type: 'connected', target: this});
  }

  /**
   * "Disconnects" the virtual controller.
   */
  disconnect() {
    this.dispatchEvent({type: 'disconnected', target: this});
  }
}
