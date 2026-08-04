import * as THREE from 'three';

import type {ScaleOptions} from './ManipulationTypes';

export {faceCameraQuaternion} from '../../utils/FaceCameraMath';

const EPSILON = 1e-8;

export function worldPositionToLocal(
  worldPosition: THREE.Vector3,
  parentWorldMatrix?: THREE.Matrix4
): THREE.Vector3 {
  if (!parentWorldMatrix) return worldPosition.clone();
  return worldPosition.clone().applyMatrix4(parentWorldMatrix.clone().invert());
}

export function worldQuaternionToLocal(
  worldQuaternion: THREE.Quaternion,
  parentWorldQuaternion?: THREE.Quaternion
): THREE.Quaternion {
  if (!parentWorldQuaternion) return worldQuaternion.clone();
  return parentWorldQuaternion.clone().invert().multiply(worldQuaternion);
}

export function clampScaleFactor(
  factor: number,
  baseline: THREE.Vector3,
  options: ScaleOptions
): number {
  const minimum = scaleLimitVector(options.minScale, EPSILON, false);
  const maximum = scaleLimitVector(options.maxScale, Infinity, true);
  if (!minimum || !maximum) return NaN;
  const minimumFactor = Math.max(
    minimum.x / baseline.x,
    minimum.y / baseline.y,
    minimum.z / baseline.z
  );
  const maximumFactor = Math.min(
    maximum.x / baseline.x,
    maximum.y / baseline.y,
    maximum.z / baseline.z
  );
  if (minimumFactor > maximumFactor) return NaN;
  return THREE.MathUtils.clamp(factor, minimumFactor, maximumFactor);
}

export function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > EPSILON;
}

export function isFiniteVector(value: THREE.Vector3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

export function isPositiveVector(value: THREE.Vector3): boolean {
  return isFiniteVector(value) && value.x > 0 && value.y > 0 && value.z > 0;
}

export function isFiniteQuaternion(value: THREE.Quaternion): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w)
  );
}

function scaleLimitVector(
  value: number | THREE.Vector3Like | undefined,
  fallback: number,
  allowInfinity: boolean
): THREE.Vector3 | undefined {
  if (value === undefined)
    return new THREE.Vector3(fallback, fallback, fallback);
  const result =
    typeof value === 'number'
      ? new THREE.Vector3(value, value, value)
      : new THREE.Vector3(value.x, value.y, value.z);
  const valid = [result.x, result.y, result.z].every(
    (component) =>
      component > 0 &&
      (Number.isFinite(component) || (allowInfinity && component === Infinity))
  );
  return valid ? result : undefined;
}
