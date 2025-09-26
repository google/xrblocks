import * as THREE from 'three';

import {MouseController} from '../../input/MouseController';
import {clamp} from '../../utils/utils';

const positionDiff = new THREE.Vector3();
const rotationDiff = new THREE.Quaternion();
const euler = new THREE.Euler();

/**
 * A non-visual helper class for calculating a slider value based on
 * a controller's movement relative to an initial pose. It can derive the value
 * from either positional (for XR hands/controllers) or rotational (for mouse)
 * input, making it a flexible tool for creating virtual sliders without a
 * visible UI element.
 */
export class FreestandingSlider {
  initialPosition = new THREE.Vector3();
  initialRotationInverse = new THREE.Quaternion();
  rotationScale: number;

  /**
   * Create a freestanding slider object.
   */
  constructor(
      public startingValue = 0.0, public minValue = 0.0, public maxValue = 1.0,
      public scale = 1.0, rotationScale?: number) {
    this.rotationScale =
        rotationScale != undefined ? rotationScale : -this.scale;
  }

  /**
   * Captures the initial position and rotation to serve as the reference point
   * for the gesture.
   * @param position - The starting world position.
   * @param rotation - The starting world rotation.
   */
  setInitialPose(position: THREE.Vector3, rotation: THREE.Quaternion) {
    this.initialPosition.copy(position);
    this.initialRotationInverse.copy(rotation).invert();
  }

  /**
   * A convenience method to capture the initial pose from a controller object.
   * @param controller - The controller to use as the reference.
   */
  setInitialPoseFromController(controller: THREE.Object3D) {
    this.setInitialPose(controller.position, controller.quaternion);
  }

  /**
   * Calculates the slider value based on a new world position.
   * @param position - The current world position of the input source.
   * @returns The calculated slider value, clamped within the min/max range.
   */
  getValue(position: THREE.Vector3) {
    positionDiff.copy(position)
        .sub(this.initialPosition)
        .applyQuaternion(this.initialRotationInverse);
    return clamp(
        this.startingValue + this.scale * positionDiff.x, this.minValue,
        this.maxValue);
  }

  /**
   * Calculates the slider value based on a new world rotation (for mouse
   * input).
   * @param rotation - The current world rotation of the input source.
   * @returns The calculated slider value, clamped within the min/max range.
   */
  getValueFromRotation(rotation: THREE.Quaternion) {
    rotationDiff.copy(rotation).multiply(this.initialRotationInverse);
    euler.setFromQuaternion(rotationDiff, 'YXZ');
    return clamp(
        this.startingValue + this.rotationScale * euler.y, this.minValue,
        this.maxValue);
  }

  /**
   * A polymorphic method that automatically chooses the correct calculation
   * (positional or rotational) based on the controller type.
   * @param controller - The controller providing the input.
   * @returns The calculated slider value.
   */
  getValueFromController(controller: THREE.Object3D) {
    return controller instanceof MouseController ?
        this.getValueFromRotation(controller.quaternion) :
        this.getValue(controller.position);
  }

  /**
   * Updates the starting value, typically after a gesture has ended.
   * @param value - The new starting value for the next gesture.
   */
  updateValue(value: number) {
    this.startingValue = value
  }
}
