import * as THREE from 'three';
import type { SceneAsset, SceneVector3 } from './SceneTypes';
/** Options for a preauthored glTF model supplied by the application. */
export interface ModelAssetOptions {
    /** The catalog ID exposed to the planner. */
    id: string;
    /** A short description of the model for the planner. */
    description: string;
    /** Unscaled width, height, and depth in meters. */
    size: SceneVector3;
    /** A URL controlled by the application, never one produced by a model. */
    url: string;
    /** The renderer, required only for KTX2 compressed textures. */
    renderer?: THREE.WebGLRenderer;
}
/**
 * Builds the built-in procedural catalog. Every factory returns a fresh,
 * detached object whose geometry and materials it exclusively owns, so
 * Roomcraft can dispose one scene object without affecting another.
 *
 * @returns A new array of trusted assets, safe to extend or filter.
 */
export declare function createDefaultCatalog(): SceneAsset[];
/**
 * Wraps a preauthored glTF or glb model as a catalog asset. Supply a URL the
 * application controls; a planner can never introduce one. The loader
 * propagates network and decoding failures instead of substituting a
 * placeholder, and each call parses its own geometry, materials, and textures.
 *
 * @param options - The asset ID, description, physical size, and model URL.
 * @returns A catalog asset that loads the model and multiplies its authored
 *     materials by the requested color; white leaves them unchanged.
 */
export declare function createModelAsset({ id, description, size, url, renderer, }: ModelAssetOptions): SceneAsset;
