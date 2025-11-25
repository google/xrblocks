import {AIOptions} from '../ai/AIOptions';
import {
  DeviceCameraOptions,
  xrDeviceCameraEnvironmentOptions,
  xrDeviceCameraUserOptions,
} from '../camera/CameraOptions.js';
import {DepthOptions, xrDepthMeshOptions} from '../depth/DepthOptions.js';
import {HandsOptions} from '../input/HandsOptions.js';
import {GestureRecognitionOptions} from '../input/gestures/GestureRecognitionOptions.js';
import {LightingOptions} from '../lighting/LightingOptions.js';
import {PhysicsOptions} from '../physics/PhysicsOptions';
import {SimulatorOptions} from '../simulator/SimulatorOptions';
import {SoundOptions} from '../sound/SoundOptions';
import {deepMerge} from '../utils/OptionsUtils';
import {DeepPartial, DeepReadonly} from '../utils/Types';
import {WorldOptions} from '../world/WorldOptions';

/**
 * Default options for XR controllers, which encompass hands by default in
 * Android XR, mouse input on desktop, tracked controllers, and gamepads.
 */
export class InputOptions {
  /** Whether controller input is enabled. */
  enabled = true;
  /** Whether mouse input should act as a controller on desktop. */
  enabledMouse = true;
  /** Whether to enable debugging features for controllers. */
  debug = false;
  /** Whether to show controller models. */
  visualization = false;
  /** Whether to show the ray lines extending from the controllers. */
  visualizeRays = false;
}

/**
 * Default options for the reticle (pointing cursor).
 */
export class ReticleOptions {
  enabled = true;
}

/**
 * Options for the XR transition effect.
 */
export class XRTransitionOptions {
  /** Whether the transition effect is enabled. */
  enabled = false;
  /** The duration of the transition in seconds. */
  transitionTime = 0.5;
  /** The default background color for VR transitions. */
  defaultBackgroundColor = 0xffffff;
}

/**
 * A central configuration class for the entire XR Blocks system. It aggregates
 * all settings and provides chainable methods for enabling common features.
 */
export class Options {
  /**
   * Whether to use antialiasing.
   */
  antialias = true;
  /**
   * Whether to use a logarithmic depth buffer. Useful for depth-aware
   * occlusions.
   */
  logarithmicDepthBuffer = false;
  /**
   * Global flag for enabling various debugging features.
   */
  debugging = false;
  /**
   * Whether to request a stencil buffer.
   */
  stencil = false;
  /**
   * Canvas element to use for rendering.
   * If not defined, a new element will be added to document body.
   */
  canvas?: HTMLCanvasElement;

  /**
   * Any additional required features when initializing webxr.
   */
  webxrRequiredFeatures: string[] = [];

  // "local-floor" sets the scene origin at the user's feet,
  // "local" sets the scene origin near their head.
  referenceSpaceType: XRReferenceSpaceType = 'local-floor';

  controllers = new InputOptions();
  depth = new DepthOptions();
  lighting = new LightingOptions();
  deviceCamera = new DeviceCameraOptions();
  hands = new HandsOptions();
  gestures = new GestureRecognitionOptions();
  reticles = new ReticleOptions();
  sound = new SoundOptions();
  ai = new AIOptions();
  simulator = new SimulatorOptions();
  world = new WorldOptions();
  physics = new PhysicsOptions();
  transition = new XRTransitionOptions();
  camera = {
    near: 0.01,
    far: 500,
  };

  /**
   * Whether to use post-processing effects.
   */
  usePostprocessing = false;

  enableSimulator = true;

  /**
   * Configuration for the XR session button.
   */
  xrButton = {
    enabled: true,
    startText: 'Enter XR',
    endText: 'Exit XR',
    invalidText: 'XR Not Supported',
    startSimulatorText: 'Enter Simulator',
    showEnterSimulatorButton: false,
    // Whether to autostart the simulator even if WebXR is available.
    alwaysAutostartSimulator: false,
  };

  /**
   * Which permissions to request before entering the XR session.
   */
  permissions = {
    geolocation: false,
    camera: false,
    microphone: false,
  };

  /**
   * Constructs the Options object by merging default values with provided
   * custom options.
   * @param options - A custom options object to override the defaults.
   */
  constructor(options?: DeepReadonly<DeepPartial<Options>>) {
    deepMerge(this, options);
  }

  /**
   * Enables a standard set of options for a UI-focused experience.
   * @returns The instance for chaining.
   */
  enableUI() {
    this.antialias = true;
    this.reticles.enabled = true;
    return this;
  }

  /**
   * Enables reticles for visualizing targets of hand rays in WebXR.
   * @returns The instance for chaining.
   */
  enableReticles() {
    this.reticles.enabled = true;
    return this;
  }

  /**
   * Enables depth sensing in WebXR with default options.
   * @returns The instance for chaining.
   */
  enableDepth() {
    this.depth = new DepthOptions(xrDepthMeshOptions);
    return this;
  }

  /**
   * Enables plane detection.
   * @returns The instance for chaining.
   */
  enablePlaneDetection() {
    this.world.enablePlaneDetection();
    return this;
  }

  /**
   * Enables object detection.
   * @returns The instance for chaining.
   */
  enableObjectDetection() {
    this.permissions.camera = true;
    this.world.enableObjectDetection();
    return this;
  }

  /**
   * Enables device camera (passthrough) with a specific facing mode.
   * @param facingMode - The desired camera facing mode, either 'environment' or
   *     'user'.
   * @returns The instance for chaining.
   */
  enableCamera(facingMode: 'environment' | 'user' = 'environment') {
    this.permissions.camera = true;
    this.deviceCamera = new DeviceCameraOptions(
      facingMode === 'environment'
        ? xrDeviceCameraEnvironmentOptions
        : xrDeviceCameraUserOptions
    );
    return this;
  }

  /**
   * Enables hand tracking.
   * @returns The instance for chaining.
   */
  enableHands() {
    this.hands.enabled = true;
    return this;
  }

  /**
   * Enables the gesture recognition block and ensures hands are available.
   * @returns The instance for chaining.
   */
  enableGestures() {
    this.enableHands();
    this.gestures.enable();
    return this;
  }

  /**
   * Enables the visualization of rays for hand tracking.
   * @returns The instance for chaining.
   */
  enableHandRays() {
    this.controllers.visualizeRays = true;
    return this;
  }

  /**
   * Enables a standard set of AI features, including Gemini Live.
   * @returns The instance for chaining.
   */
  enableAI() {
    this.ai.enabled = true;
    this.ai.gemini.enabled = true;
    this.ai.gemini.live.enabled = true;
    return this;
  }

  /**
   * Enables the XR transition component for toggling VR.
   * @returns The instance for chaining.
   */
  enableXRTransitions() {
    this.transition.enabled = true;
    return this;
  }
}
