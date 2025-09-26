import * as THREE from 'three';
import { Depth } from '../depth/Depth';
import { SimulatorDepthMaterial } from './SimulatorDepthMaterial';
import { SimulatorScene } from './SimulatorScene';
export declare class SimulatorDepth {
    private simulatorScene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.Camera;
    depth: Depth;
    depthWidth: number;
    depthHeight: number;
    depthBufferSlice: Float32Array<ArrayBuffer>;
    depthMaterial: SimulatorDepthMaterial;
    depthRenderTarget: THREE.WebGLRenderTarget;
    depthBuffer: Float32Array;
    constructor(simulatorScene: SimulatorScene);
    /**
     * Initialize Simulator Depth.
     */
    init(renderer: THREE.WebGLRenderer, camera: THREE.Camera, depth: Depth): void;
    createRenderTarget(): void;
    update(): void;
    renderDepthScene(): void;
    updateDepth(): void;
}
