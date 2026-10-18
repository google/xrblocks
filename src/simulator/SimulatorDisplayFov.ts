import * as THREE from 'three';

import {
  DEFAULT_SIMULATOR_ASPECT_RATIO,
  MAX_DISPLAY_DIAGONAL_FOV_DEGREES,
  MIN_DISPLAY_DIAGONAL_FOV_DEGREES,
  MIN_SIMULATOR_CAMERA_ASPECT_RATIO,
} from './SimulatorConstants';
import type {SimulatorOptions} from './SimulatorOptions';

/** Applies and restores a simulated display FOV across mono and stereo cameras. */
export class SimulatorDisplayFov {
  private readonly defaultCameraFov?: number;
  private appliedDisplayDiagonalFov?: number;
  private appliedDisplayAspect?: number;
  private appliedCameraFov?: number;
  private appliedCameraProjection?: THREE.Matrix4;

  constructor(
    private readonly mainCamera: THREE.Camera,
    private readonly stereoCameras: THREE.Camera[],
    private readonly options: SimulatorOptions
  ) {
    if (mainCamera instanceof THREE.PerspectiveCamera) {
      this.defaultCameraFov = mainCamera.fov;
    }
  }

  apply(): void {
    if (
      !(this.mainCamera instanceof THREE.PerspectiveCamera) ||
      this.defaultCameraFov === undefined
    ) {
      return;
    }
    const diagonalFov = this.options.displayDiagonalFov;
    const aspect = this.mainCamera.aspect;
    if (
      diagonalFov === this.appliedDisplayDiagonalFov &&
      (diagonalFov === undefined || aspect === this.appliedDisplayAspect)
    ) {
      this.syncStereoCameraProjection();
      return;
    }

    if (diagonalFov === undefined) {
      this.restore();
      this.syncStereoCameraProjection();
      return;
    }
    if (
      !Number.isFinite(diagonalFov) ||
      diagonalFov <= MIN_DISPLAY_DIAGONAL_FOV_DEGREES ||
      diagonalFov >= MAX_DISPLAY_DIAGONAL_FOV_DEGREES
    ) {
      throw new RangeError(
        `Simulator displayDiagonalFov must be greater than ${MIN_DISPLAY_DIAGONAL_FOV_DEGREES} and less than ${MAX_DISPLAY_DIAGONAL_FOV_DEGREES} degrees.`
      );
    }
    const aspectForDiagonal =
      aspect > MIN_SIMULATOR_CAMERA_ASPECT_RATIO
        ? aspect
        : DEFAULT_SIMULATOR_ASPECT_RATIO;
    const verticalTangent =
      Math.tan(THREE.MathUtils.degToRad(diagonalFov / 2)) /
      Math.hypot(aspectForDiagonal, DEFAULT_SIMULATOR_ASPECT_RATIO);
    this.mainCamera.fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(verticalTangent)
    );
    this.mainCamera.updateProjectionMatrix();
    this.appliedDisplayDiagonalFov = diagonalFov;
    this.appliedDisplayAspect = aspect;
    this.appliedCameraFov = this.mainCamera.fov;
    this.appliedCameraProjection = this.mainCamera.projectionMatrix.clone();
    this.syncStereoCameraProjection();
  }

  dispose(): void {
    this.restore();
  }

  private syncStereoCameraProjection(): void {
    if (!(this.mainCamera instanceof THREE.PerspectiveCamera)) return;

    for (const camera of this.stereoCameras) {
      if (!(camera instanceof THREE.PerspectiveCamera)) continue;
      camera.fov = this.mainCamera.fov;
      camera.aspect = this.mainCamera.aspect;
      camera.near = this.mainCamera.near;
      camera.far = this.mainCamera.far;
      camera.zoom = this.mainCamera.zoom;
      camera.projectionMatrix.copy(this.mainCamera.projectionMatrix);
      camera.projectionMatrixInverse.copy(
        this.mainCamera.projectionMatrixInverse
      );
    }
  }

  private restore(): void {
    const camera = this.mainCamera;
    const appliedCameraFov = this.appliedCameraFov;
    const appliedCameraProjection = this.appliedCameraProjection;

    this.appliedCameraFov = undefined;
    this.appliedCameraProjection = undefined;
    this.appliedDisplayDiagonalFov = undefined;
    this.appliedDisplayAspect = undefined;
    if (
      !(camera instanceof THREE.PerspectiveCamera) ||
      this.defaultCameraFov === undefined ||
      appliedCameraFov === undefined ||
      appliedCameraProjection === undefined ||
      camera.fov !== appliedCameraFov ||
      !camera.projectionMatrix.equals(appliedCameraProjection)
    ) {
      return;
    }

    camera.fov = this.defaultCameraFov;
    camera.updateProjectionMatrix();
    this.syncStereoCameraProjection();
  }
}
