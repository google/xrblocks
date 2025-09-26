import * as THREE from 'three';

import {UP, ZERO_VECTOR3} from './HelperConstants';

// Reusable instances to avoid creating new objects in the render loop.
const euler = new THREE.Euler();
const matrix4 = new THREE.Matrix4();
const v1 = new THREE.Vector3();

/**
 * Extracts only the yaw (Y-axis rotation) from a quaternion.
 * This is useful for making an object face a certain direction horizontally
 * without tilting up or down.
 *
 * @param rotation - The source quaternion from which to
 *     extract the yaw.
 * @param target - The target
 *     quaternion to store the result.
 * If not provided, a new quaternion will be created.
 * @returns The resulting quaternion containing only the yaw
 *     rotation.
 */
export function extractYaw(
    rotation: Readonly<THREE.Quaternion>, target = new THREE.Quaternion()) {
  // Ensures the Y-axis rotation (yaw) is calculated first and is independent of
  // the X (pitch) and Z (roll) rotations. This prevents gimbal lock from
  // affecting the yaw value.
  euler.setFromQuaternion(rotation, 'YXZ');

  // Creates a new quaternion from only the yaw component (the rotation around
  // the 'up' vector).
  return target.setFromAxisAngle(UP, euler.y);
}

/**
 * Creates a rotation such that forward (0, 0, -1) points towards the forward
 * vector and the up direction is the normalized projection of the provided up
 * vector onto the plane orthogonal to the target.
 * @param forward - Forward vector
 * @param up - Up vector
 * @param target - Output
 * @returns
 */
export function lookAtRotation(
    forward: Readonly<THREE.Vector3>, up = UP,
    target = new THREE.Quaternion()) {
  matrix4.lookAt(ZERO_VECTOR3, forward, up);
  return target.setFromRotationMatrix(matrix4);
}

/**
 * Clamps the provided rotation's angle.
 * The rotation is modified in place.
 * @param rotation - The quaternion to clamp.
 * @param angle - The maximum allowed angle in radians.
 */
export function clampRotationToAngle(
    rotation: THREE.Quaternion, angle: number) {
  let currentAngle = 2 * Math.acos(rotation.w);
  currentAngle = (currentAngle + Math.PI) % (2 * Math.PI) - Math.PI;
  if (Math.abs(currentAngle) <= angle) {
    return;
  }
  const axis = v1.set(rotation.x, rotation.y, rotation.z)
                   .multiplyScalar(1 / Math.sqrt(1 - rotation.w * rotation.w));
  axis.normalize();
  rotation.setFromAxisAngle(axis, angle * Math.sign(currentAngle));
}
