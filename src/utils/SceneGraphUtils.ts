import * as THREE from 'three';

/**
 * Checks if a given object is a descendant of another object in the scene
 * graph. This function is useful for determining if an interaction (like a
 * raycast hit) has occurred on a component that is part of a larger, complex
 * entity.
 *
 * It uses an iterative approach to traverse up the hierarchy from the child.
 *
 * @param child - The potential descendant object.
 * @param parent - The potential ancestor object.
 * @returns True if `child` is the same as `parent` or is a descendant of
 *     `parent`.
 */
export function objectIsDescendantOf(
  child?: Readonly<THREE.Object3D> | null,
  parent?: Readonly<THREE.Object3D> | null
) {
  // Starts the search from the child object.
  let currentNode: Readonly<THREE.Object3D> | undefined | null = child;

  // Traverses up the scene graph hierarchy until we reach the top (null parent)
  // or find the target parent.
  while (currentNode) {
    // If the current node is the parent we're looking for, we've found a match.
    if (currentNode === parent) {
      return true;
    }
    // Moves up to the next level in the hierarchy.
    currentNode = currentNode.parent;
  }

  // If we reach the top of the hierarchy without finding the parent,
  // it is not an ancestor.
  return false;
}

/**
 * Traverses the scene graph from a given node, calling a callback function for
 * each node. The traversal stops if the callback returns true.
 *
 * This function is similar to THREE.Object3D.traverse, but allows for early
 * exit from the traversal based on the callback's return value.
 *
 * @param node - The starting node for the traversal.
 * @param callback - The function to call for each node. It receives the current
 *     node as an argument. If the callback returns `true`, the traversal will
 *     stop.
 * @returns Whether the callback returned true for any node.
 */
export function traverseUtil(
  node: THREE.Object3D,
  callback: (node: THREE.Object3D) => boolean
) {
  if (callback(node)) {
    return true;
  }
  for (const child of node.children) {
    if (traverseUtil(child, callback)) {
      return true;
    }
  }
  return false;
}

/**
 * Gets a world-space point on an object's rendered geometry near a reference
 * position. Falls back to the object's world position when it has no mesh
 * triangles. `closest` measures from `from`; `center` measures from the
 * object's world bounding-box center.
 */
export function getObjectTargetPoint(
  object: THREE.Object3D,
  from: THREE.Vector3,
  out: THREE.Vector3,
  mode: 'closest' | 'center' = 'closest'
): THREE.Vector3 {
  object.updateWorldMatrix(true, true);
  const reference =
    mode === 'center'
      ? new THREE.Box3()
          .setFromObject(object, true)
          .getCenter(new THREE.Vector3())
      : from;
  let closestDistanceSquared = Infinity;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible) return;
    const position = child.geometry.getAttribute('position');
    if (!position) return;
    const index = child.geometry.index;
    const vertexCount = index?.count ?? position.count;

    for (let offset = 0; offset + 2 < vertexCount; offset += 3) {
      child.getVertexPosition(index?.getX(offset) ?? offset, a);
      child.getVertexPosition(index?.getX(offset + 1) ?? offset + 1, b);
      child.getVertexPosition(index?.getX(offset + 2) ?? offset + 2, c);
      a.applyMatrix4(child.matrixWorld);
      b.applyMatrix4(child.matrixWorld);
      c.applyMatrix4(child.matrixWorld);
      centroid
        .copy(a)
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3);
      const distanceSquared = centroid.distanceToSquared(reference);
      if (distanceSquared < closestDistanceSquared) {
        closestDistanceSquared = distanceSquared;
        out.copy(centroid);
      }
    }
  });

  return closestDistanceSquared < Infinity ? out : object.getWorldPosition(out);
}
