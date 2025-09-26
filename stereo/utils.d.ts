import * as THREE from 'three';
/**
 * Sets the given object and all its children to only be visible in the left
 * eye.
 * @param obj - Object to show only in the left eye.
 * @returns The original object.
 */
export declare function showOnlyInLeftEye<T extends THREE.Object3D>(obj: T): T;
/**
 * Sets the given object and all its children to only be visible in the right
 * eye.
 * @param obj - Object to show only in the right eye.
 * @returns The original object.
 */
export declare function showOnlyInRightEye<T extends THREE.Object3D>(obj: T): T;
/**
 * Loads a stereo image from a URL and returns two THREE.Texture objects, one
 * for the left eye and one for the right eye.
 * @param url - The URL of the stereo image.
 * @returns A promise that resolves to an array containing the left and right
 *     eye textures.
 */
export declare function loadStereoImageAsTextures(url: string): Promise<THREE.Texture[]>;
