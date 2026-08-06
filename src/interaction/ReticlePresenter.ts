import * as THREE from 'three';

import {ReticleOptions} from '../core/Options.js';
import type {Controller} from '../input/Controller.js';
import type {
  InteractionSourceState,
  ResolvedRay,
  ReticlePresentationObserver,
} from './InteractionTypes.js';

const NORMAL_MATRIX = new THREE.Matrix3();
const WORLD_NORMAL = new THREE.Vector3();

/** Presents resolved state. It never performs a raycast or changes targeting. */
export class ReticlePresenter implements ReticlePresentationObserver {
  constructor(private readonly options = new ReticleOptions()) {}

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
      reticle.setHovering(false);
      if (this.options.defaultRenderDistance <= 0) {
        reticle.visible = false;
        return;
      }

      reticle.visible = true;
      reticle.position
        .copy(ray.origin)
        .addScaledVector(reticle.direction, this.options.defaultRenderDistance);
      WORLD_NORMAL.copy(reticle.direction).negate();
      reticle.setRotationFromNormalVector(WORLD_NORMAL);
      return;
    }

    const {intersection} = resolved;
    reticle.visible = true;
    reticle.intersection = intersection;
    const showsTarget = resolved.reticleMode === 'auto';
    reticle.targetObject = showsTarget ? resolved.target : undefined;
    reticle.setHovering(showsTarget && resolved.target !== undefined);
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
    controller.reticle.setHovering(false);
  }
}
