/**
 * Utility functions for positioning and orienting objects in 3D
 * space.
 */
import * as THREE from 'three';

// Reusable instances to avoid creating new objects in the render loop.
const vector3 = new THREE.Vector3();
const vector3a = new THREE.Vector3();
const vector3b = new THREE.Vector3();
const matrix4 = new THREE.Matrix4();

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
export function placeObjectAtIntersectionFacingTarget(
    obj: THREE.Object3D, intersection: THREE.Intersection,
    target: THREE.Object3D) {
  // 1. Position the object at the intersection point.
  obj.position.copy(intersection.point);

  // 2. Determine the world-space normal of the surface at the intersection
  // point. We must ensure the matrix of the intersected object is up-to-date.
  intersection.object.updateWorldMatrix(true, false);

  // 3. Determine the desired forward direction.
  // This is the vector from the object to the target, projected onto the
  // surface plane.
  const worldNormal = vector3b.copy(intersection.normal!)
                          .transformDirection(intersection.object.matrixWorld);
  const forwardVector = target.getWorldPosition(vector3)
                            .sub(obj.position)
                            .cross(worldNormal)
                            .cross(worldNormal)
                            .multiplyScalar(-1)
                            .normalize();

  // 4. Create an orthonormal basis (a new coordinate system).
  // The 'up' vector is the surface normal.
  // The 'forward' vector is the direction towards the target on the plane.
  // The 'right' vector is perpendicular to both.
  const rightVector = vector3a.crossVectors(worldNormal, forwardVector);
  matrix4.makeBasis(rightVector, worldNormal, forwardVector);

  // 5. Apply the rotation from the new basis to the object.
  // This aligns the object's local axes with the new basis vectors.
  // Note: Three.js objects' 'forward' is conventionally the -Z axis.
  // makeBasis sets the +Z axis to forwardVector, so models may need to be
  // authored with +Z forward, or a rotation offset can be applied here.
  obj.quaternion.setFromRotationMatrix(matrix4);
  return obj;
}
