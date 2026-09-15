import * as THREE from 'three';

import {TransformScript} from './TransformScript';

export interface VisibilityTransitionOptions {
  duration?: number;
}

/** Animates its parent's visibility with a scale transition. */
export class VisibilityTransition extends TransformScript {
  static dependencies = {timer: THREE.Timer};

  private timer?: THREE.Timer;
  private readonly duration: number;
  private readonly visibleScale = new THREE.Vector3(1, 1, 1);
  private progress = 1;
  private targetVisible = true;
  private animating = false;

  constructor(options: VisibilityTransitionOptions = {}) {
    super();
    this.duration = options.duration ?? 0.3;
  }

  init({timer}: {timer: THREE.Timer}) {
    this.timer = timer;
    if (!this.parent) return;
    this.targetVisible = this.parent.visible;
    this.progress = this.targetVisible ? 1 : 0;
    if (this.targetVisible) this.visibleScale.copy(this.parent.scale);
  }

  show() {
    if (!this.parent) return;
    this.parent.visible = true;
    this.targetVisible = true;
    this.animating = true;
  }

  hide() {
    if (!this.parent) return;
    if (this.progress >= 1) this.visibleScale.copy(this.parent.scale);
    this.targetVisible = false;
    this.animating = true;
  }

  toggle() {
    if (this.targetVisible) this.hide();
    else this.show();
  }

  update() {
    if (!this.canUpdate || !this.parent || !this.timer || !this.animating)
      return;
    const direction = this.targetVisible ? 1 : -1;
    const delta = Math.min(this.timer.getDelta(), 0.1);
    this.progress = THREE.MathUtils.clamp(
      this.progress + direction * (delta / Math.max(this.duration, 0.001)),
      0,
      1
    );
    const eased = 1 - (1 - this.progress) * (1 - this.progress);
    this.parent.scale.copy(this.visibleScale).multiplyScalar(eased);

    if (this.progress === 0 || this.progress === 1) {
      this.animating = false;
      if (this.progress === 0) this.parent.visible = false;
    }
  }
}
