import * as THREE from 'three';

import {TransformScript} from './TransformScript';

export type FollowObjectMode = 'position' | 'rotation' | 'pose';

export interface FollowObjectOptions {
  target: THREE.Object3D;
  mode?: FollowObjectMode;
  positionOffset?: THREE.Vector3;
  rotationOffset?: THREE.Quaternion;
}

/** Copies position, rotation, or both from another object to its parent. */
export class FollowObject extends TransformScript {
  private readonly target: THREE.Object3D;
  private readonly mode: FollowObjectMode;
  private readonly positionOffset: THREE.Vector3;
  private readonly rotationOffset: THREE.Quaternion;
  private readonly targetWorldPosition = new THREE.Vector3();
  private readonly targetWorldQuaternion = new THREE.Quaternion();
  private readonly objectWorldPosition = new THREE.Vector3();
  private readonly objectWorldQuaternion = new THREE.Quaternion();
  private readonly parentWorldQuaternion = new THREE.Quaternion();

  constructor(options: FollowObjectOptions) {
    super();
    this.target = options.target;
    this.mode = options.mode ?? 'position';
    this.positionOffset =
      options.positionOffset?.clone() ?? new THREE.Vector3();
    this.rotationOffset =
      options.rotationOffset?.clone() ?? new THREE.Quaternion();
  }

  update() {
    const object = this.parent;
    if (!this.canUpdate || !object) return;
    if (this.mode === 'position' || this.mode === 'pose') {
      this.target.getWorldPosition(this.targetWorldPosition);
      this.targetWorldPosition.add(this.positionOffset);
      object.parent?.worldToLocal(this.targetWorldPosition);
      object.position.copy(this.targetWorldPosition);
    }
    if (this.mode === 'rotation' || this.mode === 'pose') {
      this.target.getWorldQuaternion(this.targetWorldQuaternion);
      this.targetWorldQuaternion.multiply(this.rotationOffset);
      if (object.parent) {
        object.parent.getWorldQuaternion(this.parentWorldQuaternion);
        this.targetWorldQuaternion.premultiply(
          this.parentWorldQuaternion.invert()
        );
      }
      object.quaternion.copy(this.targetWorldQuaternion);
    }
  }

  protected rebase() {
    const object = this.parent;
    if (!object) return;
    if (this.mode === 'position' || this.mode === 'pose') {
      object.getWorldPosition(this.objectWorldPosition);
      this.target.getWorldPosition(this.targetWorldPosition);
      this.positionOffset
        .copy(this.objectWorldPosition)
        .sub(this.targetWorldPosition);
    }
    if (this.mode === 'rotation' || this.mode === 'pose') {
      object.getWorldQuaternion(this.objectWorldQuaternion);
      this.target.getWorldQuaternion(this.targetWorldQuaternion);
      this.rotationOffset
        .copy(this.targetWorldQuaternion)
        .invert()
        .multiply(this.objectWorldQuaternion);
    }
  }
}
