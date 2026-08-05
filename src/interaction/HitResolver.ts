import * as THREE from 'three';

import type {Script} from '../core/Script.js';
import type {
  InteractionCallbackDispatch,
  InteractionSourceType,
  ResolvedRay,
} from './InteractionTypes.js';
import {HitRegistry} from './HitRegistry.js';
import type {ManipulationManager} from './manipulation/ManipulationManager.js';
import {
  isSemanticControl,
  isSemanticControlDisabled,
} from './SemanticControl.js';

function cloneIntersection(
  intersection: THREE.Intersection
): THREE.Intersection {
  return {
    ...intersection,
    point: intersection.point.clone(),
    normal: intersection.normal?.clone(),
    uv: intersection.uv?.clone(),
    uv1: intersection.uv1?.clone(),
  };
}

/** Resolves one ordered raw hit list into one blocking surface and target. */
export class HitResolver {
  constructor(
    private readonly callbacks: InteractionCallbackDispatch,
    private readonly manipulation: ManipulationManager,
    private readonly registry = new HitRegistry()
  ) {}

  resolve(
    intersections: readonly THREE.Intersection[],
    sourceType: InteractionSourceType
  ): ResolvedRay | undefined {
    for (const rawIntersection of intersections) {
      const registered = this.registry.resolve(rawIntersection.object);
      if (
        registered.logical === rawIntersection.object &&
        hasPrivateAncestor(rawIntersection.object)
      ) {
        continue;
      }
      const surface = registered.logical;
      const objectPath = this.getObjectPath(surface);
      if (this.isExcluded(objectPath)) continue;

      const eligiblePath = this.getEligiblePath(objectPath);
      const semanticCandidate = eligiblePath.find(isSemanticControl);
      const disabledSemantic =
        semanticCandidate !== undefined &&
        isSemanticControlDisabled(semanticCandidate);
      const semanticControl = disabledSemantic ? undefined : semanticCandidate;
      const physicalHandle =
        registered.physical !== eligiblePath[0] &&
        registered.physical.xb?.manipulationHandle !== undefined
          ? registered.physical
          : undefined;
      const manipulation = semanticCandidate
        ? undefined
        : this.manipulation.resolve(
            physicalHandle ? [physicalHandle, ...eligiblePath] : eligiblePath
          );
      const callbackTarget = eligiblePath.find((object) =>
        this.callbacks.hasTargetHandler(object, sourceType)
      );
      const target = disabledSemantic
        ? undefined
        : (semanticControl ??
          this.nearestTarget(
            eligiblePath,
            callbackTarget,
            manipulation?.owner
          ));
      const scriptPath = target
        ? (eligiblePath.filter((object) =>
            this.callbacks.isScript(object)
          ) as Script[])
        : [];

      return {
        intersection: {
          ...cloneIntersection(rawIntersection),
          object: surface,
        },
        hitObject: rawIntersection.object,
        surface,
        target,
        scriptPath: Object.freeze(scriptPath),
        objectPath: Object.freeze(objectPath),
        reticleMode: this.getReticleMode(objectPath),
        semanticControl,
        manipulation,
      };
    }
    return undefined;
  }

  private getObjectPath(surface: THREE.Object3D): THREE.Object3D[] {
    const path: THREE.Object3D[] = [];
    let object: THREE.Object3D | null = surface;
    while (object) {
      path.push(object);
      object = object.parent;
    }
    return path;
  }

  private isExcluded(path: readonly THREE.Object3D[]): boolean {
    return path.some(
      (object) =>
        object.visible === false || object.xb?.pointerEvents === 'none'
    );
  }

  private getEligiblePath(
    objectPath: readonly THREE.Object3D[]
  ): THREE.Object3D[] {
    const barrierIndex = objectPath.findIndex(
      (object) => object.xb?.interactionEnabled === false
    );
    return barrierIndex < 0
      ? [...objectPath]
      : objectPath.slice(0, barrierIndex);
  }

  private nearestTarget(
    path: readonly THREE.Object3D[],
    callbackTarget?: THREE.Object3D,
    manipulationOwner?: THREE.Object3D
  ): THREE.Object3D | undefined {
    if (!callbackTarget) return manipulationOwner;
    if (!manipulationOwner) return callbackTarget;
    return path.indexOf(callbackTarget) <= path.indexOf(manipulationOwner)
      ? callbackTarget
      : manipulationOwner;
  }

  private getReticleMode(
    path: readonly THREE.Object3D[]
  ): 'auto' | 'surface' | 'hidden' {
    for (const object of path) {
      const mode = object.xb?.reticleMode;
      if (mode === 'auto' || mode === 'surface' || mode === 'hidden') {
        return mode;
      }
    }
    return 'auto';
  }
}

function hasPrivateAncestor(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData.xrblocksPrivate === true) return true;
    current = current.parent;
  }
  return false;
}
