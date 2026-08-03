import type * as THREE from 'three';

import {Script} from '../core/Script';

/** Base class for built-in scripts that continuously change their parent. */
export class TransformScript extends Script {
  private suspended = false;

  /** Stops transform updates while the parent is manipulated. */
  suspend() {
    this.suspended = true;
  }

  /** Rebases the script on the parent's current pose and resumes updates. */
  resume() {
    this.rebase();
    this.suspended = false;
  }

  protected get canUpdate() {
    return !this.suspended && this.parent !== null;
  }

  /** Captures a new baseline from the parent transform. */
  protected rebase() {}
}

export function suspendTransformScripts(owner: THREE.Object3D) {
  for (const child of owner.children) {
    if (child instanceof TransformScript) child.suspend();
  }
}

export function resumeTransformScripts(owner: THREE.Object3D) {
  for (const child of owner.children) {
    if (child instanceof TransformScript) child.resume();
  }
}
