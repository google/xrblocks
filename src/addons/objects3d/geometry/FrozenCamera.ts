/**
 * Frozen-camera construction from explicit view / projection matrices.
 *
 * Pure (no `xb.core` dependencies) so it can be unit-tested and reused
 * outside the browser (e.g. by a server that receives serialized matrices).
 */

import * as THREE from 'three';

/** Matrices describing the camera that captured a snapshot. */
export interface FrozenCameraMatrices {
  /** Camera-to-world transform (pose) of the capturing camera. */
  worldFromView: THREE.Matrix4;
  /** Projection matrix of the capturing camera. */
  clipFromView: THREE.Matrix4;
  /** Inverse projection; computed from `clipFromView` when omitted. */
  viewFromClip?: THREE.Matrix4;
  /**
   * Aspect ratio of the captured snapshot (`width / height`). Defaults to the
   * aspect implied by `clipFromView`, which makes {@link uvToNdc} an identity
   * mapping.
   */
  snapAspect?: number | null;
}

/**
 * Build a static `THREE.PerspectiveCamera` whose matrices are pinned to the
 * given snapshot-time values. The returned camera works with
 * `Raycaster.setFromCamera` (which only reads `matrixWorld` and
 * `projectionMatrixInverse`) and with the fitters' `fov` / `aspect` /
 * `position` / `quaternion` reads, which are derived from the matrices.
 *
 * @param matrices - Snapshot-time camera matrices.
 * @returns A frozen camera (matrixAutoUpdate disabled).
 */
export function buildFrozenCamera(
  matrices: FrozenCameraMatrices
): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera();
  cam.matrixAutoUpdate = false;
  cam.matrix.copy(matrices.worldFromView);
  cam.matrixWorld.copy(matrices.worldFromView);
  cam.matrixWorldInverse.copy(matrices.worldFromView).invert();
  cam.projectionMatrix.copy(matrices.clipFromView);
  if (matrices.viewFromClip) {
    cam.projectionMatrixInverse.copy(matrices.viewFromClip);
  } else {
    cam.projectionMatrixInverse.copy(matrices.clipFromView).invert();
  }
  matrices.worldFromView.decompose(cam.position, cam.quaternion, cam.scale);
  // Column-major projection: elements[5] = cot(vFov / 2), elements[0] =
  // cot(hFov / 2) = elements[5] / aspect.
  const e = matrices.clipFromView.elements;
  cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(1 / e[5]));
  cam.aspect = e[5] / e[0];
  cam.userData.snapAspect = matrices.snapAspect ?? cam.aspect;
  return cam;
}
