import * as THREE from 'three';

import type {Controller} from '../input/Controller.js';
import type {
  InteractionReticleOptions,
  InteractionSourceState,
  ResolvedRay,
  ReticlePresentationObserver,
} from './InteractionTypes.js';

const NORMAL_MATRIX = new THREE.Matrix3();
const WORLD_NORMAL = new THREE.Vector3();

/** Presents resolved state. It never performs a raycast or changes targeting. */
export class ReticlePresenter implements ReticlePresentationObserver {
  private readonly scene = new THREE.Scene();

  constructor(
    private readonly options: InteractionReticleOptions = {
      defaultRenderDistance: 0,
    },
    private readonly reticles?: THREE.Object3D
  ) {
    if (reticles) this.scene.add(reticles);
  }

  /** Draws reticles after every world and UI pass. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (!this.reticles || this.reticles.children.length === 0) return;
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      renderer.render(this.scene, camera);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  present(
    snapshot: InteractionSourceState,
    resolved: ResolvedRay | undefined
  ): void {
    const reticle = snapshot.controller.reticle;
    if (!reticle) return;
    const ray = snapshot.ray;
    if (!ray) {
      this.clear(snapshot.controller);
      return;
    }

    reticle.direction.copy(ray.direction).normalize();
    if (snapshot.selectionProgress === undefined) {
      reticle.setPressed(snapshot.selected);
    } else {
      reticle.setPressedAmount(snapshot.selectionProgress);
    }

    if (resolved?.reticleMode === 'hidden') {
      this.clear(snapshot.controller);
      return;
    }

    const beyondPresentationRange =
      resolved &&
      this.options.maxDistance !== undefined &&
      resolved.intersection.distance >= this.options.maxDistance;
    if (!resolved || beyondPresentationRange) {
      reticle.intersection = undefined;
      reticle.targetObject = undefined;
      setHovering(reticle, false);
      const defaultRenderDistance = this.options.defaultRenderDistance ?? 0;
      if (defaultRenderDistance <= 0) {
        reticle.visible = false;
        return;
      }

      reticle.visible = true;
      reticle.position
        .copy(ray.origin)
        .addScaledVector(reticle.direction, defaultRenderDistance);
      WORLD_NORMAL.copy(reticle.direction).negate();
      reticle.setRotationFromNormalVector(WORLD_NORMAL);
      return;
    }

    const {intersection} = resolved;
    reticle.visible = true;
    reticle.intersection = intersection;
    const showsTarget = resolved.reticleMode === 'auto';
    reticle.targetObject = showsTarget ? resolved.target : undefined;
    setHovering(reticle, showsTarget && resolved.target !== undefined);
    reticle.position.copy(intersection.point);

    if (intersection.normal) {
      resolved.hitObject.updateWorldMatrix(true, false);
      NORMAL_MATRIX.getNormalMatrix(resolved.hitObject.matrixWorld);
      WORLD_NORMAL.copy(intersection.normal)
        .applyMatrix3(NORMAL_MATRIX)
        .normalize();
    } else {
      WORLD_NORMAL.copy(ray.direction).negate().normalize();
    }
    reticle.setRotationFromNormalVector(WORLD_NORMAL);
  }

  clear(controller: Controller): void {
    if (!controller.reticle) return;
    controller.reticle.visible = false;
    controller.reticle.intersection = undefined;
    controller.reticle.targetObject = undefined;
    setHovering(controller.reticle, false);
  }
}

function setHovering(reticle: THREE.Object3D, hovering: boolean): void {
  const hoverable = reticle as THREE.Object3D & {
    setHovering?: (value: boolean) => void;
  };
  hoverable.setHovering?.(hovering);
}
