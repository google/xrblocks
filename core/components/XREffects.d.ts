import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
export declare class XRPass extends Pass {
    render(_renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, _readBuffer: THREE.WebGLRenderTarget, _deltaTime: number, _maskActive: boolean, _viewId?: number): void;
}
/**
 * XREffects manages the XR rendering pipeline.
 * Use core.effects
 * It handles multiple passes and render targets for applying effects to XR
 * scenes.
 */
export declare class XREffects {
    private renderer;
    private scene;
    private timer;
    passes: XRPass[];
    renderTargets: THREE.WebGLRenderTarget[];
    dimensions: THREE.Vector2;
    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, timer: THREE.Timer);
    /**
     * Adds a pass to the effect pipeline.
     */
    addPass(pass: XRPass): void;
    /**
     * Sets up render targets for the effect pipeline.
     */
    setupRenderTargets(dimensions: THREE.Vector2): void;
    /**
     * Renders the XR effects.
     */
    render(): void;
    private renderXr;
    private renderSimulator;
}
