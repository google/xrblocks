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
export class MouseController
  extends Script<MouseControllerEventMap>
  implements Controller
{
  static dependencies = {
    camera: THREE.Camera,
  };
  type = 'MouseController';
  name = 'Mouse Controller';
  editorIcon = 'mouse';

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
  camera?: THREE.Camera;

  private lastNormalizedMouse = new THREE.Vector2(0, 0);

  constructor() {
    super();
  }

  /**
   * Initialize the MouseController
   */
  init({camera}: {camera: THREE.Camera}) {
    this.camera = camera;
  }

  /** Updates the mouse position/rotation using camera state. */
  updatePose() {
    if (this.camera === undefined) {
      return;
    }
    this.position.copy(this.camera.position);
    this.raycaster.setFromCamera(this.lastNormalizedMouse, this.camera);
    const rayDirection = this.raycaster.ray.direction;
    this.quaternion.setFromUnitVectors(this.forwardVector, rayDirection);
    this.updateMatrixWorld();
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
    this.updatePose();
  }

  /**
   * Updates the controller's transform based on the mouse's position on the
   * screen. This method sets both the position and rotation, ensuring the
   * object has a valid world matrix for raycasting.
   * @param event - The mouse event containing clientX and clientY coordinates.
   */
  updateMousePositionFromEvent(event: MouseEvent) {
    if (this.camera === undefined) {
      return;
    }
    this.lastNormalizedMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.lastNormalizedMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.updatePose();
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
