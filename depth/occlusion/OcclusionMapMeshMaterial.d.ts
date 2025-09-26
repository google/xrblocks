import * as THREE from 'three';
export declare class OcclusionMapMeshMaterial extends THREE.MeshBasicMaterial {
    uniforms: {
        [uniform: string]: THREE.IUniform;
    };
    constructor(camera: THREE.PerspectiveCamera, useFloatDepth: boolean);
}
