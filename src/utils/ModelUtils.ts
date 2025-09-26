import * as THREE from 'three';

/**
 * Calculates the bounding box for a group of THREE.Object3D instances.
 *
 * @param objects - An array of THREE.Object3D instances.
 * @returns The computed THREE.Box3.
 */
export function getGroupBoundingBox(objects: THREE.Object3D[]) {
  const bbox = new THREE.Box3();
  if (objects.length === 0) {
    return bbox;
  }

  const parentReferences = new Map();
  for (const child of objects) {
    if (child.parent) {
      parentReferences.set(child, child.parent);
      child.removeFromParent();
    }
    bbox.expandByObject(child, true);
  }

  // Restore parent references
  for (const [child, parent] of parentReferences.entries()) {
    parent.add(child);
  }
  return bbox;
}
