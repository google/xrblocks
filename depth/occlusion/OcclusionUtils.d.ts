import * as THREE from 'three';
import type { Shader } from '../../utils/Types';
export declare class OcclusionUtils {
    /**
     * Creates a simple material used for rendering objects into the occlusion
     * map. This material is intended to be used with `renderer.overrideMaterial`.
     * @returns A new instance of THREE.MeshBasicMaterial.
     */
    static createOcclusionMapOverrideMaterial(): THREE.MeshBasicMaterial;
    /**
     * Modifies a material's shader in-place to incorporate distance-based
     * alpha occlusion. This is designed to be used with a material's
     * `onBeforeCompile` property. This only works with built-in three.js
     * materials.
     * @param shader - The shader object provided by onBeforeCompile.
     */
    static addOcclusionToShader(shader: Shader): void;
}
