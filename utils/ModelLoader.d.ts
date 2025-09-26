import * as THREE from 'three';
import { GLTF } from 'three/addons/loaders/GLTFLoader.js';
export type ModelLoaderLoadGLTFOptions = {
    /** The base path for the model files. */
    path?: string;
    /** The URL of the model file. */
    url: string;
    /** The renderer. */
    renderer?: THREE.WebGLRenderer;
};
export type ModelLoaderLoadOptions = ModelLoaderLoadGLTFOptions & {
    /**
     * Optional callback for loading progress. Note: This will be ignored if a
     * LoadingManager is provided.
     */
    onProgress?: (event: ProgressEvent) => void;
};
/**
 * Manages the loading of 3D models, automatically handling dependencies
 * like DRACO and KTX2 loaders.
 */
export declare class ModelLoader {
    private manager;
    /**
     * Creates an instance of ModelLoader.
     * @param manager - The
     *     loading manager to use,
     * required for KTX2 texture support.
     */
    constructor(manager?: THREE.LoadingManager);
    /**
     * Loads a model based on its file extension. Supports .gltf, .glb,
     * .ply, .spz, .splat, and .ksplat.
     * @returns A promise that resolves with the loaded model data (e.g., a glTF
     *     scene or a SplatMesh).
     */
    load({ path, url, renderer, onProgress }: ModelLoaderLoadOptions): Promise<GLTF | import("@sparkjsdev/spark").SplatMesh | null>;
    /**
     * Loads a 3DGS model (.ply, .spz, .splat, .ksplat).
     * @param url - The URL of the model file.
     * @returns A promise that resolves with the loaded
     * SplatMesh object.
     */
    loadSplat({ url }: {
        url?: string | undefined;
    }): Promise<import("@sparkjsdev/spark").SplatMesh>;
    /**
     * Loads a GLTF or GLB model.
     * @param options - The loading options.
     * @returns A promise that resolves with the loaded glTF object.
     */
    loadGLTF({ path, url, renderer, }: ModelLoaderLoadGLTFOptions): Promise<GLTF>;
}
