/**
 * Camera-extrinsic corrections in the ArUco addon's calibration shape,
 * `{rotation: [x, y, z, w], translation: [x, y, z]}` relative to the SDK's
 * assumed camera pose, applied in the camera's own frame:
 * worldFromCamera = worldFromView_SDK · correction.
 */
import * as THREE from 'three';

const ONE = new THREE.Vector3(1, 1, 1);

/** Correction matrix from an ArUco `{rotation: [x,y,z,w], translation}`. */
export function correctionFromCalibration({rotation, translation}) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(translation),
    new THREE.Quaternion().fromArray(rotation).normalize(),
    ONE
  );
}

/** Rotation (degrees) and translation (cm) magnitudes of a correction. */
export function describeCorrection(correction) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  correction.decompose(position, quaternion, new THREE.Vector3());
  const angle = 2 * Math.acos(Math.min(1, Math.abs(quaternion.w)));
  return {
    rotationDeg: THREE.MathUtils.radToDeg(angle),
    translationCm: position.length() * 100,
  };
}
