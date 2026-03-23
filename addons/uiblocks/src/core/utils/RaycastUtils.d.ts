import * as THREE from 'three';
/**
 * Sorts intersections for raycasting on UI elements.
 * Sorting order: Distance (Ascending) -\> Render Order (Descending) -\> UI Hierarchy (Descending) -\> ID (Descending).
 * @param a - First intersection item.
 * @param b - Second intersection item.
 * @returns Numeric offset for native sort comparison.
 */
export declare function raycastSortFunction(a: THREE.Intersection, b: THREE.Intersection): number;
