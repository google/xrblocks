import * as THREE from 'three';
import { type SceneEnvironment } from './SceneTypes';
/**
 * Bounds of the ground a virtual environment owns, in environment-local
 * meters. The sky dome, its celestial body, and the lights are backdrop, so
 * they are deliberately excluded and a whole-world fit stays finite and tight.
 *
 * @param environment - The environment settings.
 * @returns A new box covering the ground slab, centered in X/Z with its top
 *     at Y=0.
 */
export declare function getEnvironmentBounds(environment: SceneEnvironment): THREE.Box3;
/**
 * Builds a bounded virtual setting as one detached group: a ground slab, a
 * back-sided sky dome with an authored gradient, celestial body, and stars,
 * and the key and fill lights for that time of day. Every geometry, material,
 * and light is freshly owned by this result; nothing is cached or shared
 * between builds, and no global renderer, scene, or camera state is touched.
 * The sky and ground never take pointer hits, so objects and UI stay reachable.
 *
 * @param environment - The environment settings; they are never mutated.
 * @returns A new group holding `ground`, `sky`, `key-light`, its target, and
 *     `fill-light`. Failed construction disposes what it built and rethrows;
 *     Roomcraft owns disposal of a successful result.
 */
export declare function createEnvironmentContent(environment: SceneEnvironment): THREE.Group;
