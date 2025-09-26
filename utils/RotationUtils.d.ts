import * as THREE from 'three';
/**
 * Extracts only the yaw (Y-axis rotation) from a quaternion.
 * This is useful for making an object face a certain direction horizontally
 * without tilting up or down.
 *
 * @param rotation - The source quaternion from which to
 *     extract the yaw.
 * @param target - The target
 *     quaternion to store the result.
 * If not provided, a new quaternion will be created.
 * @returns The resulting quaternion containing only the yaw
 *     rotation.
 */
export declare function extractYaw(rotation: Readonly<THREE.Quaternion>, target?: THREE.Quaternion): THREE.Quaternion;
/**
 * Creates a rotation such that forward (0, 0, -1) points towards the forward
 * vector and the up direction is the normalized projection of the provided up
 * vector onto the plane orthogonal to the target.
 * @param forward - Forward vector
 * @param up - Up vector
 * @param target - Output
 * @returns
 */
export declare function lookAtRotation(forward: Readonly<THREE.Vector3>, up?: Readonly<THREE.Vector3>, target?: THREE.Quaternion): THREE.Quaternion;
/**
 * Clamps the provided rotation's angle.
 * The rotation is modified in place.
 * @param rotation - The quaternion to clamp.
 * @param angle - The maximum allowed angle in radians.
 */
export declare function clampRotationToAngle(rotation: THREE.Quaternion, angle: number): void;
