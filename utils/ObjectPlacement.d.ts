/**
 * Utility functions for positioning and orienting objects in 3D
 * space.
 */
import * as THREE from 'three';
/**
 * Places and orients an object at a specific intersection point on another
 * object's surface. The placed object's 'up' direction will align with the
 * surface normal at the intersection, and its 'forward' direction will point
 * towards a specified target object (e.g., the camera), but constrained to the
 * surface plane.
 *
 * This is useful for placing objects on walls or floors so they sit flat
 * against the surface but still turn to face the user.
 *
 * @param obj - The object to be placed and oriented.
 * @param intersection - The intersection data from a
 *     raycast,
 * containing the point and normal of the surface. The normal is assumed to be
 * in local space.
 * @param target - The object that `obj` should face (e.g., the
 *     camera).
 * @returns The modified `obj`.
 */
export declare function placeObjectAtIntersectionFacingTarget(obj: THREE.Object3D, intersection: THREE.Intersection, target: THREE.Object3D): THREE.Object3D<THREE.Object3DEventMap>;
