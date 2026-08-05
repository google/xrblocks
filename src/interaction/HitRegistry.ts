import * as THREE from 'three';

export interface RegisteredHitSurface {
  readonly physical: THREE.Object3D;
  readonly logical: THREE.Object3D;
}

/** Owns physical hit registration, collection, and logical mapping. */
export class HitRegistry {
  private readonly raycaster = new THREE.Raycaster();
  private readonly mappings = new WeakMap<
    THREE.Object3D,
    RegisteredHitSurface
  >();
  private readonly registered = new Set<RegisteredHitSurface>();
  private readonly touchCandidates = new Map<
    THREE.Object3D,
    RegisteredHitSurface
  >();

  register(physical: THREE.Object3D, logical: THREE.Object3D): () => void {
    const entry = {physical, logical};
    this.mappings.set(physical, entry);
    this.registered.add(entry);
    this.touchCandidates.set(physical, entry);
    return () => {
      if (this.mappings.get(physical) === entry) {
        this.mappings.delete(physical);
      }
      this.registered.delete(entry);
      if (this.touchCandidates.get(physical) === entry) {
        this.touchCandidates.delete(physical);
      }
    };
  }

  setWorldTouchCandidates(objects: Iterable<THREE.Object3D>): void {
    const next = new Set(objects);
    for (const [physical, entry] of this.touchCandidates) {
      if (!this.registered.has(entry)) this.touchCandidates.delete(physical);
    }
    for (const object of next) {
      if (this.touchCandidates.has(object)) continue;
      this.touchCandidates.set(object, {
        physical: object,
        logical: object,
      });
    }
    for (const [physical, entry] of this.touchCandidates) {
      if (this.registered.has(entry)) continue;
      if (!next.has(physical)) this.touchCandidates.delete(physical);
    }
  }

  resolve(object: THREE.Object3D): RegisteredHitSurface {
    let current: THREE.Object3D | null = object;
    while (current) {
      const mapping = this.mappings.get(current);
      if (mapping) return mapping;
      current = current.parent;
    }
    return {physical: object, logical: object};
  }

  /** Collects ordered raw hits from the public scene and detached surfaces. */
  raycast(
    scene: THREE.Scene,
    ray: THREE.Ray,
    intersections: THREE.Intersection[]
  ): readonly THREE.Intersection[] {
    intersections.length = 0;
    this.raycaster.ray.copy(ray);
    intersectTree(scene, this.raycaster, intersections);

    let publicCount = 0;
    for (const intersection of intersections) {
      if (hasPrivateAncestor(intersection.object)) continue;
      intersections[publicCount++] = intersection;
    }
    intersections.length = publicCount;

    for (const {physical} of this.registered) {
      if (this.isBelowScene(physical, scene) && !hasPrivateAncestor(physical)) {
        continue;
      }
      if (!effectiveVisible(physical)) continue;
      if (!physical.layers.test(this.raycaster.layers)) continue;
      physical.updateWorldMatrix(true, false);
      physical.raycast(this.raycaster, intersections);
    }
    intersections.sort(compareRayIntersections);
    return intersections;
  }

  intersectionsAt(
    point: THREE.Vector3,
    padding = 0,
    preferred?: THREE.Object3D
  ): THREE.Intersection[] {
    const intersections: THREE.Intersection[] = [];
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    for (const {physical} of this.touchCandidates.values()) {
      if (!effectiveVisible(physical)) continue;
      try {
        box.setFromObject(physical);
      } catch {
        continue;
      }
      if (padding > 0) box.expandByScalar(padding);
      if (box.isEmpty() || !box.containsPoint(point)) continue;
      intersections.push({
        distance: box.getCenter(center).distanceTo(point),
        object: physical,
        point: point.clone(),
      });
    }
    intersections.sort((a, b) => compareTouchIntersections(a, b, preferred));
    return intersections;
  }

  private isBelowScene(object: THREE.Object3D, scene: THREE.Scene): boolean {
    let current = object.parent;
    while (current) {
      if (current === scene) return true;
      current = current.parent;
    }
    return false;
  }
}

/** Recursively raycasts interactive scene branches. */
function intersectTree(
  object: THREE.Object3D,
  raycaster: THREE.Raycaster,
  intersections: THREE.Intersection[]
): void {
  // Private render trees expose their interactive surfaces through
  // `registered`. Do not raycast them here and again in the registered pass.
  if (object.userData.xrblocksPrivate === true) return;
  if (object.xb?.pointerEvents === 'none') return;
  if (object.layers.test(raycaster.layers)) {
    object.raycast(raycaster, intersections);
  }
  for (const child of object.children) {
    intersectTree(child, raycaster, intersections);
  }
}

function compareRayIntersections(
  a: THREE.Intersection,
  b: THREE.Intersection
): number {
  const aOverlay = isOverlayHit(a.object);
  const bOverlay = isOverlayHit(b.object);
  if (aOverlay !== bOverlay) return aOverlay ? -1 : 1;
  const distance = a.distance - b.distance;
  if (distance !== 0) return distance;
  if (a.object.renderOrder !== b.object.renderOrder) {
    return b.object.renderOrder - a.object.renderOrder;
  }
  return b.object.id - a.object.id;
}

function compareTouchIntersections(
  a: THREE.Intersection,
  b: THREE.Intersection,
  preferred?: THREE.Object3D
): number {
  if (a.object === b.object) return 0;
  if (a.object === preferred) return -1;
  if (b.object === preferred) return 1;

  const aOverlay = isOverlayHit(a.object);
  const bOverlay = isOverlayHit(b.object);
  if (aOverlay !== bOverlay) return aOverlay ? -1 : 1;

  const aOrder = getInteractionHitOrder(a.object);
  const bOrder = getInteractionHitOrder(b.object);
  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
    return bOrder - aOrder;
  }

  return a.distance - b.distance;
}

function getInteractionHitOrder(object: THREE.Object3D): number | undefined {
  let current: THREE.Object3D | null = object;
  while (current) {
    const order = current.userData.xrblocksHitOrder;
    if (typeof order === 'number') return order;
    current = current.parent;
  }
  return undefined;
}

function isOverlayHit(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData.xrblocksOverlay === true) return true;
    current = current.parent;
  }
  return false;
}

function hasPrivateAncestor(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData.xrblocksPrivate === true) return true;
    current = current.parent;
  }
  return false;
}

function effectiveVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}
