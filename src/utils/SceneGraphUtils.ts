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
    child?: Readonly<THREE.Object3D>|null,
    parent?: Readonly<THREE.Object3D>|null) {
  // Starts the search from the child object.
  let currentNode: Readonly<THREE.Object3D>|undefined|null = child;

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
    node: THREE.Object3D, callback: (node: THREE.Object3D) => boolean) {
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
