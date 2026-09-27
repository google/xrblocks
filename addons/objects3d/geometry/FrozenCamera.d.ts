import * as THREE from "three";
//#region src/addons/objects3d/geometry/FrozenCamera.d.ts
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
export declare function buildFrozenCamera(matrices: FrozenCameraMatrices): THREE.PerspectiveCamera;
//#endregion