import * as THREE from 'three';
import {intrinsicsToProjectionMatrix} from './CameraParameterUtils';

// prettier-ignore
export const AURA_INTRINSICS_MATRIX = [
  850, 0, 640,
  0, 850, 360,
  0, 0, 1,
];

export const AURA_PROJECTION_MATRIX = intrinsicsToProjectionMatrix(
  AURA_INTRINSICS_MATRIX,
  1280,
  720,
  0.1,
  1000,
  new THREE.Matrix4()
);

export const AURA_CAMERA_POSE_POSITION = new THREE.Vector3(0.0, 0.0, -0.06);
export const AURA_CAMERA_POSE_ROTATION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0, 0, 0, 'YXZ')
);

const AURA_CAMERA_POSE_SCALE = new THREE.Vector3(1, 1, 1);

// Pose of the moohan camera w.r.t. left camera.
// Tuned by hand. Likely incorrect.
export const AURA_CAMERA_POSE = new THREE.Matrix4().compose(
  AURA_CAMERA_POSE_POSITION,
  AURA_CAMERA_POSE_ROTATION,
  new THREE.Vector3(1, 1, 1)
);

export function getAuraCameraPose(
  camera: THREE.Camera,
  _xrCameras: THREE.WebXRArrayCamera,
  target: THREE.Matrix4
) {
  target.compose(
    AURA_CAMERA_POSE_POSITION,
    AURA_CAMERA_POSE_ROTATION,
    AURA_CAMERA_POSE_SCALE
  );
  target.premultiply(camera.matrixWorld);
}
