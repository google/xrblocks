import * as THREE from 'three';
export declare class HighlightMaterial extends THREE.MeshBasicMaterial {
    onBeforeCompile(parameters: THREE.WebGLProgramParametersWithUniforms): void;
    customProgramCacheKey(): string;
}
