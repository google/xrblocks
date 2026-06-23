import * as THREE from 'three';

import {lookAtRotation} from '../utils/RotationUtils';

/**
 * Computes an aspect-ratio-preserving plane size whose largest side equals
 * `maxSize`. Used to scale a generated image so it reads at a comfortable size
 * regardless of the model's output resolution.
 * @param imageWidth - Source image width in pixels.
 * @param imageHeight - Source image height in pixels.
 * @param maxSize - Largest dimension of the resulting plane, in meters.
 * @param target - Optional output vector to write into.
 * @returns `target` set to the plane's [width, height] in meters.
 */
export function computeBillboardScale(
  imageWidth: number,
  imageHeight: number,
  maxSize: number,
  target = new THREE.Vector2()
): THREE.Vector2 {
  if (imageWidth <= 0 || imageHeight <= 0 || maxSize <= 0) {
    // Degenerate input: fall back to a square so the object is still visible.
    return target.set(maxSize, maxSize);
  }
  const aspect = imageWidth / imageHeight;
  if (aspect >= 1) {
    return target.set(maxSize, maxSize / aspect);
  }
  return target.set(maxSize * aspect, maxSize);
}

/**
 * Computes a pose `distance` meters in front of the camera, oriented so its
 * front face (+Z) points back toward the user.
 * @param camera - The user's camera.
 * @param distance - Distance in front of the camera, in meters.
 * @param position - Optional output position.
 * @param quaternion - Optional output orientation.
 * @returns The position and orientation.
 */
export function poseInFrontOfCamera(
  camera: THREE.Camera,
  distance: number,
  position = new THREE.Vector3(),
  quaternion = new THREE.Quaternion()
): {position: THREE.Vector3; quaternion: THREE.Quaternion} {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  camera.getWorldPosition(position);
  position.addScaledVector(forward, distance);
  // lookAtRotation orients local -Z along `forward` (into the scene), so the
  // plane's +Z normal faces back toward the user.
  lookAtRotation(forward, undefined, quaternion);
  return {position, quaternion};
}
