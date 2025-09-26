import * as THREE from 'three';
import { Options } from '../Options';
import { MeshScript } from '../Script';
/**
 * Defines the possible XR modes.
 */
export type XRMode = 'AR' | 'VR';
export type XRTransitionToVROptions = {
    /** The target opacity. */
    targetAlpha?: number;
    /** The target color. Defaults to `defaultBackgroundColor`. */
    color?: THREE.Color | number;
};
/**
 * Manages smooth transitions between AR (transparent) and VR (colored)
 * backgrounds within an active XR session.
 */
export declare class XRTransition extends MeshScript<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
    ignoreReticleRaycast: boolean;
    static dependencies: {
        renderer: typeof THREE.WebGLRenderer;
        camera: typeof THREE.Camera;
        timer: typeof THREE.Timer;
        scene: typeof THREE.Scene;
        options: typeof Options;
    };
    /** Current XR mode, either 'AR' or 'VR'. Defaults to 'AR'. */
    currentMode: XRMode;
    /** The duration in seconds for the fade-in and fade-out transitions. */
    private transitionTime;
    private renderer;
    private scene;
    private sceneCamera;
    private timer;
    private targetAlpha;
    private defaultBackgroundColor;
    constructor();
    init({ renderer, camera, timer, scene, options }: {
        renderer: THREE.WebGLRenderer;
        camera: THREE.Camera;
        timer: THREE.Timer;
        scene: THREE.Scene;
        options: Options;
    }): void;
    /**
     * Starts the transition to a VR background.
     * @param options - Optional parameters.
     */
    toVR({ targetAlpha, color }?: XRTransitionToVROptions): void;
    /**
     * Starts the transition to a transparent AR background.
     */
    toAR(): void;
    update(): void;
    dispose(): void;
}
