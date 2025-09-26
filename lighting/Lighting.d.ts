import * as THREE from 'three';
import { Depth } from '../depth/Depth.js';
import { LightingOptions } from './LightingOptions.js';
/**
 * Lighting provides XR lighting capabilities within the XR Blocks framework.
 * It uses webXR to propvide estimated lighting that matches the environment
 * and supports casting shadows from the estimated light.
 */
export declare class Lighting {
    static instance?: Lighting;
    /** WebXR estimated lighting. */
    private xrLight?;
    /** Main Directional light. */
    dirLight: THREE.DirectionalLight;
    /** Ambient spherical harmonics light. */
    ambientProbe: THREE.LightProbe;
    /** Ambient RGB light. */
    ambientLight: THREE.Vector3;
    /** Opacity of cast shadow. */
    private shadowOpacity;
    /** Light group to attach to scene. */
    private lightGroup;
    /** Lighting options. Set during initialiation.*/
    private options;
    /** Depth manager. Used to get depth mesh on which to cast shadow. */
    private depth?;
    /** Flag to indicate if simulator is running. Controlled by Core. */
    simulatorRunning: boolean;
    /**
     * Lighting is a lightweight manager based on three.js to simply prototyping
     * with Lighting features within the XR Blocks framework.
     */
    constructor();
    /**
     * Initializes the lighting module with the given options. Sets up lights and
     * shadows and adds necessary components to the scene.
     * @param lightingOptions - Lighting options.
     * @param renderer - Main renderer.
     * @param scene - Main scene.
     * @param depth - Depth manager.
     */
    init(lightingOptions: LightingOptions, renderer: THREE.WebGLRenderer, scene: THREE.Scene, depth?: Depth): void;
    /**
     * Updates the lighting and shadow setup used to render. Called every frame
     * in the render loop.
     */
    update(): void;
    /**
     * Logs current estimate light parameters for debugging.
     */
    debugLog(): void;
}
