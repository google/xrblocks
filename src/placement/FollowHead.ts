import * as THREE from 'three';

import {TransformScript} from './TransformScript';

export interface FollowHeadOptions {
  offset: THREE.Vector3;
  smoothing?: number;
}

/** Moves its parent toward an offset in camera space. */
export class FollowHead extends TransformScript {
  static dependencies = {camera: THREE.Camera, timer: THREE.Timer};

  private camera?: THREE.Camera;
  private timer?: THREE.Timer;
  private readonly offset: THREE.Vector3;
  private readonly target = new THREE.Vector3();
  private readonly cameraWorldPosition = new THREE.Vector3();
  private readonly cameraWorldQuaternion = new THREE.Quaternion();
  private readonly objectWorldPosition = new THREE.Vector3();
  private readonly smoothing: number;

  constructor(options: FollowHeadOptions) {
    super();
    this.offset = options.offset.clone();
    this.smoothing = options.smoothing ?? 0.1;
  }

  init({camera, timer}: {camera: THREE.Camera; timer: THREE.Timer}) {
    this.camera = camera;
    this.timer = timer;
  }

  update() {
    const object = this.parent;
    if (!this.canUpdate || !object || !this.camera || !this.timer) return;

    this.camera.getWorldPosition(this.cameraWorldPosition);
    this.camera.getWorldQuaternion(this.cameraWorldQuaternion);
    this.target
      .copy(this.offset)
      .applyQuaternion(this.cameraWorldQuaternion)
      .add(this.cameraWorldPosition);
    object.parent?.worldToLocal(this.target);
    const alpha = 1 - Math.exp(-this.smoothing * this.timer.getDelta() * 60);
    object.position.lerp(this.target, alpha);
  }

  protected rebase() {
    const object = this.parent;
    if (!object || !this.camera) return;
    object.getWorldPosition(this.objectWorldPosition);
    this.camera.getWorldPosition(this.cameraWorldPosition);
    this.camera.getWorldQuaternion(this.cameraWorldQuaternion);
    this.offset
      .copy(this.objectWorldPosition)
      .sub(this.cameraWorldPosition)
      .applyQuaternion(this.cameraWorldQuaternion.invert());
  }
}
