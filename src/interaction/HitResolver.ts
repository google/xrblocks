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
  getSemanticControl,
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

/**
 * A hit on an outer grab band, such as a card's edge, with its distance outside
 * the band's own owner. Bands reach past their owner, so they give way to other
 * surfaces just behind them, and where bands overlap the nearer owner wins.
 */
export interface OuterBandIntersection extends THREE.Intersection {
  outerBandDistance?: number;
}

// Meters behind a band hit within which another surface takes the hit.
const OUTER_BAND_YIELD_DEPTH = 0.1;

function outerBandDistance(intersection: OuterBandIntersection) {
  return intersection.outerBandDistance;
}

/**
 * Moves band hits behind any other surface within OUTER_BAND_YIELD_DEPTH of the
 * nearest hit, and orders those bands by their distance outside their owner,
 * keeping ray order between equal distances. Returns `intersections` itself
 * when the nearest hit is not a band, and otherwise fills and returns `target`.
 */
function yieldOuterBands(
  intersections: readonly THREE.Intersection[],
  target: THREE.Intersection[]
): readonly THREE.Intersection[] {
  const first = intersections[0];
  if (!first || outerBandDistance(first) === undefined) return intersections;
  let end = 1;
  while (
    end < intersections.length &&
    intersections[end].distance - first.distance <= OUTER_BAND_YIELD_DEPTH
  ) {
    end++;
  }
  target.length = 0;
  for (let index = 0; index < end; index++) {
    const hit = intersections[index];
    if (outerBandDistance(hit) === undefined) target.push(hit);
  }
  const bandsStart = target.length;
  for (let index = 0; index < end; index++) {
    const hit = intersections[index];
    const distance = outerBandDistance(hit);
    if (distance === undefined) continue;
    // Insertion sort: there are only a few bands, and it is stable.
    let slot = target.length;
    while (slot > bandsStart) {
      const previous = outerBandDistance(target[slot - 1]);
      if (previous === undefined || previous <= distance) break;
      target[slot] = target[slot - 1];
      slot--;
    }
    target[slot] = hit;
  }
  for (let index = end; index < intersections.length; index++) {
    target.push(intersections[index]);
  }
  return target;
}

/** Resolves one ordered raw hit list into one blocking surface and target. */
export class HitResolver {
  /** Reordered hits from yieldOuterBands, emptied after each resolve. */
  private readonly orderedHits: THREE.Intersection[] = [];

  constructor(
    private readonly callbacks: InteractionCallbackDispatch,
    private readonly manipulation: ManipulationManager,
    private readonly registry = new HitRegistry()
  ) {}

  resolve(
    intersections: readonly THREE.Intersection[],
    sourceType: InteractionSourceType
  ): ResolvedRay | undefined {
    const resolved = this.resolveOrdered(
      yieldOuterBands(intersections, this.orderedHits),
      sourceType
    );
    // Drops the references so removed objects are not kept alive.
    this.orderedHits.length = 0;
    return resolved;
  }

  private resolveOrdered(
    intersections: readonly THREE.Intersection[],
    sourceType: InteractionSourceType
  ): ResolvedRay | undefined {
    for (const rawIntersection of intersections) {
      const registered = this.registry.resolve(rawIntersection.object);
      if (registered.physical.xb?.pointerEvents === 'none') continue;
      if (registered.containsPoint?.(rawIntersection.point) === false) continue;
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
      const scrollFallback = disabledSemantic
        ? eligiblePath.find(
            (object) =>
              getSemanticControl(object)?.kind === 'scroll' &&
              !isSemanticControlDisabled(object)
          )
        : undefined;
      const semanticControl = disabledSemantic
        ? scrollFallback
        : semanticCandidate;
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
      const target =
        disabledSemantic && !scrollFallback
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
