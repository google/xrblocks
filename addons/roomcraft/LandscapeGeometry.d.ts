import * as THREE from 'three';
import { type SceneLandscape } from './SceneTypes';
/**
 * Measures a landscape recipe without building it, so a feature can be sized,
 * placed, and fitted before any GPU resource exists. The box is conservative:
 * it covers the pond's bank and rim stones, the walkway's sampled curves,
 * joins, and shoulder, and the full overhang of scattered foliage beyond its
 * planting area.
 *
 * @param definition - One landscape recipe.
 * @returns A finite box in the feature's authored coordinates. A feature is
 *     never recentered, grounded, or rescaled by measuring it. It allocates no
 *     renderable geometry or materials.
 */
export declare function getLandscapeBounds(definition: SceneLandscape): THREE.Box3;
/**
 * Builds one landscape feature as a single detached group, so a pond, walkway,
 * or whole grove stays one selectable and disposable object. Every geometry
 * and material is freshly owned by this result: nothing is cached, shared
 * between builds, or downloaded. Scattered specimens are instanced from a
 * deterministic per-index sequence, so raising the count keeps the specimens
 * already placed and changing the height keeps their X/Z positions.
 *
 * @param definition - One landscape recipe, which is never modified.
 * @param color - The feature's primary water, walkway, foliage, or stone
 *     color. Trunks and stems keep their own natural tones.
 * @returns A new group whose bases rest at Y=0 in the authored coordinates.
 *     Failed construction disposes what it built and rethrows; the caller owns
 *     disposal of a successful result.
 */
export declare function createLandscapeContent(definition: SceneLandscape, color: string): THREE.Group;
