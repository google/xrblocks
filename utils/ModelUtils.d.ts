import * as THREE from 'three';
/**
 * Calculates the bounding box for a group of THREE.Object3D instances.
 *
 * @param objects - An array of THREE.Object3D instances.
 * @returns The computed THREE.Box3.
 */
export declare function getGroupBoundingBox(objects: THREE.Object3D[]): THREE.Box3;
