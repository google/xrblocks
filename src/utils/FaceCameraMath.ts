import * as THREE from 'three';

import {UP} from './HelperConstants';

export type FaceCameraMode = 'cylindrical' | 'spherical';

export const DEFAULT_FACE_CAMERA_SMOOTHING = 0.1;

export function faceCameraSlerpAlpha(
  smoothing: number,
  deltaSeconds: number
): number {
  return 1 - Math.exp(-smoothing * deltaSeconds * 60);
}

/** Computes the local rotation that makes an object face the camera. */
export function faceCameraQuaternion(
  worldPosition: THREE.Vector3,
  cameraPosition?: THREE.Vector3,
  parentWorldQuaternion?: THREE.Quaternion,
  mode: FaceCameraMode = 'cylindrical'
): THREE.Quaternion | undefined {
  if (!cameraPosition) return undefined;
  const target = cameraPosition.clone();
  if (mode === 'cylindrical') target.y = worldPosition.y;
  if (target.distanceToSquared(worldPosition) < 1e-8) return undefined;

  const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(target, worldPosition, UP)
  );
  if (!parentWorldQuaternion) return worldQuaternion;
  return parentWorldQuaternion.clone().invert().multiply(worldQuaternion);
}
