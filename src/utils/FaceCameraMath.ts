import * as THREE from 'three';

import {UP} from './HelperConstants';

export type FaceCameraMode = 'cylindrical' | 'spherical';

export const DEFAULT_FACE_CAMERA_SMOOTHING = 0.1;

type FaceCameraScratch = {
  target: THREE.Vector3;
  matrix: THREE.Matrix4;
  worldQuaternion: THREE.Quaternion;
};

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
  mode: FaceCameraMode = 'cylindrical',
  result = new THREE.Quaternion(),
  scratch?: FaceCameraScratch
): THREE.Quaternion | undefined {
  if (!cameraPosition) return undefined;
  const target = scratch?.target.copy(cameraPosition) ?? cameraPosition.clone();
  if (mode === 'cylindrical') target.y = worldPosition.y;
  if (target.distanceToSquared(worldPosition) < 1e-8) return undefined;

  const worldQuaternion = scratch?.worldQuaternion ?? new THREE.Quaternion();
  const matrix = scratch?.matrix ?? new THREE.Matrix4();
  worldQuaternion.setFromRotationMatrix(
    matrix.lookAt(target, worldPosition, UP)
  );
  if (!parentWorldQuaternion) return result.copy(worldQuaternion);
  return result.copy(parentWorldQuaternion).invert().multiply(worldQuaternion);
}
