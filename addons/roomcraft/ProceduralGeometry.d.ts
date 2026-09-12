import * as THREE from 'three';
import { type ScenePart } from './SceneTypes';
/**
 * Computes a conservative object-local bounding box from the physical size of
 * every part and its full motion envelope, transformed through the part
 * hierarchy. Static levels keep their exact composed corners, so a design is
 * measured the same way whether or not some other part moves. It allocates no
 * renderable geometry or materials, so callers can size and place a design
 * without building it.
 *
 * @param parts - The design's parts, in any order.
 * @returns A finite box in the object's authored coordinates. The design is
 *     never recentered, grounded, or rescaled.
 */
export declare function getProceduralBounds(parts: readonly ScenePart[]): THREE.Box3;
/**
 * Builds a design from primitive parts as one detached group, so an object can
 * be manipulated, refined, and disposed as a whole. Each part becomes a group
 * named after its part ID holding one mesh, and every geometry and material is
 * freshly owned by this result: nothing is cached or shared between builds.
 * The authored origin is preserved, so refining one part never shifts another.
 *
 * @param parts - The design's parts, in any order.
 * @param tint - The object color; `#ffffff` keeps each part's own color.
 * @returns A new group. Failed construction disposes what it built and
 *     rethrows; Roomcraft owns disposal of a successful result.
 */
export declare function createProceduralContent(parts: readonly ScenePart[], tint: string): THREE.Group;
