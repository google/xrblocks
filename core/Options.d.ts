import { AIOptions } from '../ai/AIOptions';
import { DeviceCameraOptions } from '../camera/CameraOptions.js';
import { DepthOptions } from '../depth/DepthOptions.js';
import { HandsOptions } from '../input/HandsOptions.js';
import { LightingOptions } from '../lighting/LightingOptions.js';
import { PhysicsOptions } from '../physics/PhysicsOptions';
import { SimulatorOptions } from '../simulator/SimulatorOptions';
import { SoundOptions } from '../sound/SoundOptions';
import { DeepPartial, DeepReadonly } from '../utils/Types';
import { WorldOptions } from '../world/WorldOptions';
/**
 * Default options for XR controllers, which encompass hands by default in
 * Android XR, mouse input on desktop, tracked controllers, and gamepads.
 */
export declare class InputOptions {
    /** Whether controller input is enabled. */
    enabled: boolean;
    /** Whether mouse input should act as a controller on desktop. */
    enabledMouse: boolean;
    /** Whether to enable debugging features for controllers. */
    debug: boolean;
    /** Whether to show controller models. */
    visualization: boolean;
    /** Whether to show the ray lines extending from the controllers. */
    visualizeRays: boolean;
}
/**
 * Default options for the reticle (pointing cursor).
 */
export declare class ReticleOptions {
    enabled: boolean;
}
/**
 * Options for the XR transition effect.
 */
export declare class XRTransitionOptions {
    /** Whether the transition effect is enabled. */
    enabled: boolean;
    /** The duration of the transition in seconds. */
    transitionTime: number;
    /** The default background color for VR transitions. */
    defaultBackgroundColor: number;
}
/**
 * A central configuration class for the entire XR Blocks system. It aggregates
 * all settings and provides chainable methods for enabling common features.
 */
export declare class Options {
    /**
     * Whether to use antialiasing.
     */
    antialias: boolean;
    /**
     * Whether to use a logarithmic depth buffer. Useful for depth-aware
     * occlusions.
     */
    logarithmicDepthBuffer: boolean;
    /**
     * Global flag for enabling various debugging features.
     */
    debugging: boolean;
    /**
     * Whether to request a stencil buffer.
     */
    stencil: boolean;
    /**
     * Canvas element to use for rendering.
     * If not defined, a new element will be added to document body.
     */
    canvas?: HTMLCanvasElement;
    controllers: InputOptions;
    depth: DepthOptions;
    lighting: LightingOptions;
    deviceCamera: DeviceCameraOptions;
    hands: HandsOptions;
    reticles: ReticleOptions;
    sound: SoundOptions;
    ai: AIOptions;
    simulator: SimulatorOptions;
    world: WorldOptions;
    physics: PhysicsOptions;
    transition: XRTransitionOptions;
    camera: {
        near: number;
        far: number;
    };
    /**
     * Whether to use post-processing effects.
     */
    usePostprocessing: boolean;
    /**
     * Configuration for the XR session button.
     */
    xrButton: {
        enabled: boolean;
        startText: string;
        endText: string;
        invalidText: string;
        startSimulatorText: string;
        enableSimulator: boolean;
        showSimulatorButtonOnMobile: boolean;
        autostartSimulatorOnDesktop: boolean;
        autostartSimulator: boolean;
    };
    /**
     * Constructs the Options object by merging default values with provided
     * custom options.
     * @param options - A custom options object to override the defaults.
     */
    constructor(options?: DeepReadonly<DeepPartial<Options>>);
    /**
     * Enables a standard set of options for a UI-focused experience.
     * @returns The instance for chaining.
     */
    enableUI(): this;
    /**
     * Enables reticles for visualizing targets of hand rays in WebXR.
     * @returns The instance for chaining.
     */
    enableReticles(): this;
    /**
     * Enables depth sensing in WebXR with default options.
     * @returns The instance for chaining.
     */
    enableDepth(): this;
    /**
     * Enables plane detection.
     * @returns The instance for chaining.
     */
    enablePlaneDetection(): this;
    /**
     * Enables object detection.
     * @returns The instance for chaining.
     */
    enableObjectDetection(): this;
    /**
     * Enables device camera (passthrough) with a specific facing mode.
     * @param facingMode - The desired camera facing mode, either 'environment' or
     *     'user'.
     * @returns The instance for chaining.
     */
    enableCamera(facingMode?: 'environment' | 'user'): this;
    /**
     * Enables hand tracking.
     * @returns The instance for chaining.
     */
    enableHands(): this;
    /**
     * Enables the visualization of rays for hand tracking.
     * @returns The instance for chaining.
     */
    enableHandRays(): this;
    /**
     * Enables the Gemini Live feature.
     * @returns The instance for chaining.
     */
    enableGeminiLive(): this;
    /**
     * Enables a standard set of AI features, including Gemini Live.
     * @returns The instance for chaining.
     */
    enableAI(): this;
    /**
     * Enables the XR transition component for toggling VR.
     * @returns The instance for chaining.
     */
    enableXRTransitions(): this;
}
