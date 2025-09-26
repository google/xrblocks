import * as THREE from 'three';
export declare class SimulatorDepthMaterial extends THREE.MeshBasicMaterial {
    onBeforeCompile(shader: {
        vertexShader: string;
        fragmentShader: string;
        uniforms: object;
    }): void;
}
