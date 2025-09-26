import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import type { ShaderUniforms } from '../../utils/Types';
/**
 * Occlusion postprocessing shader pass.
 * This is used to generate an occlusion map.
 * There are two modes:
 * Mode A: Generate an occlusion map for individual materials to use.
 * Mode B: Given a rendered frame, run as a postprocessing pass, occluding all
 * items in the frame. The steps are
 * 1. Compute an occlusion map between the real and virtual depth.
 * 2. Blur the occlusion map using Kawase blur.
 * 3. (Mode B only) Apply the occlusion map to the rendered frame.
 */
export declare class OcclusionPass extends Pass {
    private scene;
    private camera;
    renderToScreen: boolean;
    private occludableItemsLayer;
    private depthTextures;
    private occlusionMeshMaterial;
    private occlusionMapUniforms;
    private occlusionMapQuad;
    private occlusionMapTexture;
    private kawaseBlurQuads;
    private kawaseBlurTargets;
    private occlusionUniforms;
    private occlusionQuad;
    constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, useFloatDepth?: boolean, renderToScreen?: boolean, occludableItemsLayer?: number);
    private setupKawaseBlur;
    setDepthTexture(depthTexture: THREE.Texture, rawValueToMeters: number, view_id: number): void;
    /**
     * Render the occlusion map.
     * @param renderer - The three.js renderer.
     * @param writeBuffer - The buffer to write the final result.
     * @param readBuffer - The buffer for the current of virtual depth.
     * @param view_id - The view to render.
     */
    render(renderer: THREE.WebGLRenderer, writeBuffer?: THREE.WebGLRenderTarget, readBuffer?: THREE.WebGLRenderTarget, view_id?: number): void;
    renderOcclusionMapFromScene(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2, view_id: number): void;
    renderOcclusionMapFromReadBuffer(renderer: THREE.WebGLRenderer, readBuffer: THREE.RenderTarget, dimensions: THREE.Vector2, view_id: number): void;
    blurOcclusionMap(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2): void;
    applyOcclusionMapToRenderedImage(renderer: THREE.WebGLRenderer, readBuffer?: THREE.WebGLRenderTarget, writeBuffer?: THREE.WebGLRenderTarget): void;
    dispose(): void;
    updateOcclusionMapUniforms(uniforms: ShaderUniforms, renderer: THREE.WebGLRenderer): void;
}
