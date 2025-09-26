import * as THREE from 'three';
import { AI } from '../ai/AI';
import { XRDeviceCamera } from '../camera/XRDeviceCamera';
import { Depth } from '../depth/Depth';
import { Input } from '../input/Input';
import { Lighting } from '../lighting/Lighting';
import { Physics } from '../physics/Physics';
import { Simulator } from '../simulator/Simulator';
import { CoreSound } from '../sound/CoreSound';
import { UI } from '../ui/UI';
import { DragManager } from '../ux/DragManager';
import { World } from '../world/World';
import { Registry } from './components/Registry';
import { ScreenshotSynthesizer } from './components/ScreenshotSynthesizer';
import { ScriptsManager } from './components/ScriptsManager';
import { WaitFrame } from './components/WaitFrame';
import { WebXRSessionManager } from './components/WebXRSessionManager';
import { XRButton } from './components/XRButton';
import { XREffects } from './components/XREffects';
import { XRTransition } from './components/XRTransition';
import { Options } from './Options';
import { User } from './User';
/**
 * Core is the central engine of the XR Blocks framework, acting as a
 * singleton manager for all XR subsystems. Its primary goal is to abstract
 * low-level WebXR and THREE.js details, providing a simplified and powerful API
 * for developers and AI agents to build interactive XR applications.
 */
export declare class Core {
    static instance?: Core;
    /**
     * Component responsible for capturing screenshots of the XR scene for AI.
     */
    screenshotSynthesizer: ScreenshotSynthesizer;
    /**
     * Component responsible for waiting for the next frame.
     */
    waitFrame: WaitFrame;
    /**
     * Registry used for dependency injection on existing subsystems.
     */
    registry: Registry;
    /**
     * A clock for tracking time deltas. Call clock.getDeltaTime().
     */
    timer: THREE.Timer;
    /** Manages hand, mouse, gaze inputs. */
    input: Input;
    /** The main camera for rendering. */
    camera: THREE.PerspectiveCamera;
    /** The root scene graph for all objects. */
    scene: THREE.Scene;
    /** Represents the user in the XR scene. */
    user: User;
    /** Manages all UI elements. */
    ui: UI;
    /** Manages all (spatial) audio playback. */
    sound: CoreSound;
    /** Manages the desktop XR simulator. */
    simulator: Simulator;
    /** Manages drag-and-drop interactions. */
    dragManager: DragManager;
    /** Manages drag-and-drop interactions. */
    world: World;
    /** A shared texture loader. */
    textureLoader: THREE.TextureLoader;
    private webXRSettings;
    /** Whether the XR simulator is currently active. */
    simulatorRunning: boolean;
    renderer: THREE.WebGLRenderer;
    options: Options;
    deviceCamera?: XRDeviceCamera;
    depth: Depth;
    lighting?: Lighting;
    physics?: Physics;
    xrButton?: XRButton;
    effects?: XREffects;
    ai: AI;
    transition?: XRTransition;
    currentFrame?: XRFrame;
    scriptsManager: ScriptsManager;
    renderSceneOverride?: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
    webXRSessionManager?: WebXRSessionManager;
    /**
     * Core is a singleton manager that manages all XR "blocks".
     * It initializes core components and abstractions like the scene, camera,
     * user, UI, AI, and input managers.
     */
    constructor();
    /**
     * Initializes the Core system with a given set of options. This includes
     * setting up the renderer, enabling features like controllers, depth
     * sensing, and physics, and starting the render loop.
     * @param options - Configuration options for the
     * session.
     */
    init(options?: Options): Promise<void>;
    /**
     * The main update loop, called every frame by the renderer. It orchestrates
     * all per-frame updates for subsystems and scripts.
     *
     * Order:
     * 1. Depth
     * 2. World Perception
     * 3. Input / Reticles / UIs
     * 4. Scripts
     * @param time - The current time in milliseconds.
     * @param frame - The WebXR frame object, if in an XR session.
     */
    private update;
    /**
     * Advances the physics simulation by a fixed timestep and calls the
     * corresponding physics update on all active scripts.
     */
    private physicsStep;
    /**
     * Lifecycle callback executed when an XR session starts. Notifies all active
     * scripts.
     * @param session - The newly started WebXR session.
     */
    private onXRSessionStarted;
    private startSimulator;
    /**
     * Lifecycle callback executed when an XR session ends. Notifies all active
     * scripts.
     */
    private onXRSessionEnded;
    /**
     * Lifecycle callback executed when the desktop simulator starts. Notifies
     * all active scripts.
     */
    private onSimulatorStarted;
    /**
     * Handles browser window resize events to keep the camera and renderer
     * synchronized.
     */
    private onWindowResize;
    private renderSimulatorAndScene;
    private renderScene;
}
