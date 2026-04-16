import * as THREE from 'three';

// Sorting function which uses the render order to try to find which element is on top.
function defaultSortFunction(a: THREE.Intersection, b: THREE.Intersection) {
  // 1. Primary: Distance (Ascending).
  // Return physically closer objects first.
  const distDiff = a.distance - b.distance;
  if (Math.abs(distDiff) > 0.00001) {
    return distDiff;
  }

  // 2. Secondary: Render Order (Descending).
  // Higher renderOrder = drawn later = on top.
  if (a.object.renderOrder !== b.object.renderOrder) {
    return b.object.renderOrder - a.object.renderOrder;
  }

  // 3. Fallback to id (Descending).
  // Higher id = created later.
  return b.object.id - a.object.id;
}

function intersect(
  object: THREE.Object3D,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[],
  recursive: boolean
) {
  let propagate = true;

  if (object.layers.test(raycaster.layers)) {
    const result = object.raycast(raycaster, intersects);

    if ((result as unknown as boolean) === false) propagate = false;
  }

  if (propagate === true && recursive === true) {
    const children = object.children;

    for (let i = 0, l = children.length; i < l; i++) {
      intersect(children[i], raycaster, intersects, true);
    }
  }
}

// Raycaster which allows setting a custom sorting function. This is mainly useful to identify the clicked element for 2D UI.
export class Raycaster extends THREE.Raycaster {
  // Sorting function for the raycaster. Should return items from closest to furthest.
  sortFunction: (a: THREE.Intersection, b: THREE.Intersection) => number =
    defaultSortFunction;

  /**
   * Intersects a single object with the raycaster, using the custom sort function.
   * @param object - The object to intersect with.
   * @param recursive - Whether to intersect with the object's children.
   * @param intersects - The array to store the intersections in.
   * @returns The intersections found.
   */
  override intersectObject<TIntersected extends THREE.Object3D>(
    object: THREE.Object3D,
    recursive = true,
    intersects: Array<THREE.Intersection<TIntersected>> = []
  ): Array<THREE.Intersection<TIntersected>> {
    intersect(object, this, intersects, recursive);
    intersects.sort(this.sortFunction);
    return intersects;
  }

  /**
   * Intersects multiple objects with the raycaster, using the custom sort function.
   * @param objects - The objects to intersect with.
   * @param recursive - Whether to intersect with the objects' children.
   * @param intersects - The array to store the intersections in.
   * @returns The intersections found.
   */
  override intersectObjects<TIntersected extends THREE.Object3D>(
    objects: THREE.Object3D[],
    recursive = true,
    intersects: Array<THREE.Intersection<TIntersected>> = []
  ): Array<THREE.Intersection<TIntersected>> {
    for (let i = 0, l = objects.length; i < l; i++) {
      intersect(objects[i], this, intersects, recursive);
    }
    intersects.sort(this.sortFunction);
    return intersects;
  }
}
