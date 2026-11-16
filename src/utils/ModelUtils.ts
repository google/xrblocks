import * as THREE from 'three';

export const GLTF_EXTENSIONS = new Set(['gltf', 'glb']);
export const RADIX_SPLAT_EXTENSIONS = new Set(['ply', 'spz', 'rad', 'rdx']);
export const SPARK_SPLAT_EXTENSIONS = new Set([
  'ply',
  'spz',
  'splat',
  'ksplat',
]);
export const SPLAT_EXTENSIONS = new Set([
  ...RADIX_SPLAT_EXTENSIONS,
  ...SPARK_SPLAT_EXTENSIONS,
]);

/**
 * Extracts the lowercase file extension from a model URL, stripping any query
 * string or hash fragment.
 */
export function getModelFileExtension(url: string): string {
  const cleanUrl = url.split(/[?#]/, 1)[0];
  const dot = cleanUrl.lastIndexOf('.');
  const slash = cleanUrl.lastIndexOf('/');
  return dot > slash ? cleanUrl.slice(dot + 1).toLowerCase() : '';
}

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
