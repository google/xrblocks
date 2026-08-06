import * as THREE from 'three';

import {
  DEFAULT_FACE_CAMERA_SMOOTHING,
  faceCameraQuaternion,
  faceCameraSlerpAlpha,
  type FaceCameraMode,
} from '../utils/FaceCameraMath';
import {TransformScript} from './TransformScript';

export type {FaceCameraMode} from '../utils/FaceCameraMath';

export interface FaceCameraOptions {
  mode?: FaceCameraMode;
  smoothing?: number;
}

/** Rotates its parent to face the active camera. */
export class FaceCamera extends TransformScript {
  static dependencies = {camera: THREE.Camera, timer: THREE.Timer};

  private camera?: THREE.Camera;
  private timer?: THREE.Timer;
  private readonly mode: FaceCameraMode;
  private readonly smoothing: number;
  private readonly worldPosition = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly parentWorldQuaternion = new THREE.Quaternion();
  private readonly targetQuaternion = new THREE.Quaternion();
  private readonly faceCameraScratch = {
    target: new THREE.Vector3(),
    matrix: new THREE.Matrix4(),
    worldQuaternion: new THREE.Quaternion(),
  };

  constructor(options: FaceCameraOptions = {}) {
    super();
    this.mode = options.mode ?? 'cylindrical';
    this.smoothing = options.smoothing ?? DEFAULT_FACE_CAMERA_SMOOTHING;
  }

  init({camera, timer}: {camera: THREE.Camera; timer: THREE.Timer}) {
    this.camera = camera;
    this.timer = timer;
  }

  update() {
    const object = this.parent;
    if (!this.canUpdate || !object || !this.camera || !this.timer) return;

    object.getWorldPosition(this.worldPosition);
    this.camera.getWorldPosition(this.cameraPosition);
    const parentWorldQuaternion = object.parent?.getWorldQuaternion(
      this.parentWorldQuaternion
    );
    const targetQuaternion = faceCameraQuaternion(
      this.worldPosition,
      this.cameraPosition,
      parentWorldQuaternion,
      this.mode,
      this.targetQuaternion,
      this.faceCameraScratch
    );
    if (!targetQuaternion) return;

    const alpha = faceCameraSlerpAlpha(this.smoothing, this.timer.getDelta());
    object.quaternion.slerp(targetQuaternion, alpha);
  }
}
