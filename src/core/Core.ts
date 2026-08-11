import * as THREE from 'three';

import {AI} from '../ai/AI';
import {AIOptions} from '../ai/AIOptions';
import {markDebugFailed, markDebugReady} from '../debug/DebugGlobals';
import {XRDeviceCamera} from '../camera/XRDeviceCamera';
import {Context} from '../context/Context';
import {ContextOptions} from '../context/ContextOptions';
import {SceneOptions} from '../context/scene/SceneOptions';
import {Depth} from '../depth/Depth';
import {DepthOptions} from '../depth/DepthOptions';
import {Hands} from '../input/Hands';
import {GestureRecognition} from '../input/gestures/GestureRecognition';
import {GestureRecognitionOptions} from '../input/gestures/GestureRecognitionOptions.js';
import {HeadGestureRecognitionOptions} from '../input/headGestures/HeadGestureRecognitionOptions.js';
import type {PoseEstimator} from '../input/gestures/GestureTypes';
import {StrokeRecognitionOptions} from '../input/strokes/StrokeRecognitionOptions';
import {Input} from '../input/Input';
import {Interaction} from '../interaction/Interaction';
import {ReticlePresenter} from '../interaction/ReticlePresenter';
import {UIRenderer} from '../ui/internal/UIRenderer';
import {isUIElement} from '../ui/UIElement';
import {Lighting} from '../lighting/Lighting';
import {Physics} from '../physics/Physics';
import type {Simulator} from '../simulator/Simulator';
import {SimulatorOptions} from '../simulator/SimulatorOptions';
import {CoreSound} from '../sound/CoreSound';
import {SoundOptions} from '../sound/SoundOptions';
import {callInitWithDependencyInjection} from '../utils/DependencyInjection';
import {loadingSpinnerManager} from '../utils/LoadingSpinnerManager';
import {World} from '../world/World';
import {WorldOptions} from '../world/WorldOptions';
import {MeshDetectionOptions} from '../world/mesh/MeshDetectionOptions';

import {Registry} from './components/Registry';
import {ScreenshotSynthesizer} from './components/ScreenshotSynthesizer';
import {SimulationTimer} from './components/SimulationTimer';
import {ScriptsManager} from './components/ScriptsManager';
import {WaitFrame} from './components/WaitFrame';
import {
  WebXRSessionEventType,
  WebXRSessionManager,
} from './components/WebXRSessionManager';
import {XRButton} from './components/XRButton';
import {XREffects} from './components/XREffects';
import {XRTransition} from './components/XRTransition';
import {Options, ReticleOptions} from './Options';
import {Script} from './Script';
import {User} from './User';
import {PermissionsManager} from './components/PermissionsManager';
import {XRReferenceSpaceCache} from './components/XRReferenceSpaceCache';
import {XRSystems} from './components/XRSystems';

export type CoreLifecycleState =
  | 'new'
  | 'initializing'
  | 'running'
  | 'disposing'
  | 'disposed';

type SimulatorModule = typeof import('../simulator/Simulator.js');
type SimulatorLoader = () => Promise<SimulatorModule>;
const EPSILON = 1e-9;

function loadSimulatorModule(): Promise<SimulatorModule> {
  return import('../simulator/Simulator.js');
}

/**
 * Core is the central engine of the XR Blocks framework, acting as a
 * singleton manager for all XR subsystems. Its primary goal is to abstract
 * low-level WebXR and THREE.js details, providing a simplified and powerful API
 * for developers and AI agents to build interactive XR applications.
 */
export class Core {
  static instance?: Core;
  /**
   * Component responsible for capturing screenshots of the XR scene for AI.
   */
  screenshotSynthesizer = new ScreenshotSynthesizer();
  /**
   * Component responsible for waiting for the next frame.
   */
  waitFrame = new WaitFrame();
  /**
   * Caches WebXR reference spaces for the active session.
   */
  xrReferenceSpaceCache = new XRReferenceSpaceCache();
  /**
   * Registry used for dependency injection on existing subsystems.
   */
  registry = new Registry();

  /**
   * A timer for tracking time deltas. Call timer.getDelta() or getDeltaTime().
   */
  timer = new THREE.Timer();
  private simulationTimer = new SimulationTimer();

  /** Manages hand, mouse, gaze inputs. */
  input = new Input();

  /** The main camera for rendering. */
  camera = new THREE.PerspectiveCamera();

  /** The root scene graph for all objects. */
  scene = new THREE.Scene();

  /** Represents the user in the XR scene. */
  user = new User();

  /** Manages all (spatial) audio playback. */
  sound = new CoreSound();

  /** A container to hold all the systems in the scene hierarchy. */
  xrSystemsGroup = new XRSystems();

  private renderSceneCallback = (cameraOverride?: THREE.Camera) =>
    this.renderScene(cameraOverride);

  /** The desktop XR simulator after its runtime chunk has loaded. */
  simulator?: Simulator;
  private simulatorLoader!: SimulatorLoader;

  /** Private interaction runtime. */
  private interaction!: Interaction;
  private reticleOptions = new ReticleOptions();
  private reticlePresenter = new ReticlePresenter(this.reticleOptions);
  private uiRenderer!: UIRenderer;
  private physicsInterval?: ReturnType<typeof setInterval>;
  private manualPhysicsAccumulatorMs = 0;
  private rendererContainer?: HTMLDivElement;
  private lifecycleState: CoreLifecycleState = 'new';
  private initializationPromise?: Promise<void>;
  private disposalPromise?: Promise<void>;

  /** Manages real-world understanding: planes, meshes, objects, and sounds. */
  world = new World();

  /** Manages agent-facing observations of the app/session. */
  context = new Context();

  /** A shared texture loader. */
  textureLoader = new THREE.TextureLoader();

  private webXRSettings: XRSessionInit = {};
  private shouldAutostartSimulator = false;

  /** Whether the XR simulator is currently active. */
  simulatorRunning = false;
  private startingSimulator?: Promise<Simulator>;
  private onWebXRSessionStarted = (event: {session: XRSession}) => {
    void this.onXRSessionStarted(event.session);
  };
  private onWebXRUnsupported = () => {
    if (!this.options.enableSimulator) return;
    this.xrButton?.domElement.remove();
    this.shouldAutostartSimulator = true;
  };

  private _isPaused = false;
  private isSteppingFrame = false;
  private manualStepTime = 0;
  private _renderer?: THREE.WebGLRenderer;
  options!: Options;
  deviceCamera?: XRDeviceCamera;
  depth = new Depth();
  lighting?: Lighting;
  physics?: Physics;
  xrButton?: XRButton;
  effects?: XREffects;
  ai = new AI();
  poseEstimation?: PoseEstimator;
  gestureRecognition?: GestureRecognition;
  transition?: XRTransition;
  get currentFrame() {
    return this.renderer.xr.getFrame();
  }
  scriptsManager = new ScriptsManager(async (script: Script) => {
    await callInitWithDependencyInjection(script, this.registry, this);
    if (this.physics) {
      await script.initPhysics(this.physics);
    }
  });
  renderSceneOverride?: (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) => void;
  webXRSessionManager?: WebXRSessionManager;
  permissionsManager = new PermissionsManager();

  /**
   * The WebGL renderer, created during {@link Core.init}. Reading it before
   * `init()` has run returns `undefined` and logs a one-time warning.
   */
  get renderer(): THREE.WebGLRenderer {
    if (!this._renderer) {
      console.warn(
        'xb.core.renderer is not available until xb.init() creates it. ' +
          "Access it in or after your Script's init() method."
      );
    }
    return this._renderer!;
  }

  set renderer(renderer: THREE.WebGLRenderer) {
    this._renderer = renderer;
  }

  get isPaused() {
    return this._isPaused;
  }

  get elapsedTime() {
    return this.simulationTimer.getElapsedMs() / 1000;
  }

  /** Current state of this terminal Core lifetime. */
  get lifecycle(): CoreLifecycleState {
    return this.lifecycleState;
  }

  pause() {
    this._isPaused = true;
    this.simulationTimer.pause();
  }

  resume() {
    this._isPaused = false;
  }

  stepFrame(dtMs = 16.67) {
    if (this.isSteppingFrame) {
      throw new Error(
        'Core.stepFrame() cannot be called while already stepping.'
      );
    }

    this.isSteppingFrame = true;
    try {
      const scaledDtMs = dtMs * this.timer.getTimescale();
      this.simulationTimer.step(dtMs, this.timer.getTimescale());
      this.manualStepTime += dtMs;
      this.update(this.manualStepTime, undefined as unknown as XRFrame);
      if (this.physics) {
        this.manualPhysicsAccumulatorMs += scaledDtMs;
        const physicsStepMs = this.physics.timestep * 1000;
        while (this.manualPhysicsAccumulatorMs >= physicsStepMs - EPSILON) {
          this.physicsStep();
          this.manualPhysicsAccumulatorMs = Math.max(
            0,
            this.manualPhysicsAccumulatorMs - physicsStepMs
          );
        }
      }
    } finally {
      this.isSteppingFrame = false;
    }
  }

  /**
   * Core is a singleton manager that manages all XR "blocks".
   * It initializes core components and abstractions like the scene, camera,
   * user, UI, AI, and input managers.
   */
  constructor(simulatorLoader: SimulatorLoader = loadSimulatorModule) {
    if (Core.instance) {
      return Core.instance;
    }
    Core.instance = this;
    this.simulatorLoader = simulatorLoader;

    this.interaction = new Interaction({
      callbacks: this.scriptsManager,
      scene: this.scene,
      camera: this.camera,
      timer: this.timer,
      reticle: this.reticlePresenter,
      reticleOptions: this.reticleOptions,
    });
    this.uiRenderer = new UIRenderer(
      this.interaction,
      undefined,
      (error, root) =>
        this.scriptsManager.reportError(error, root, 'UI renderer load')
    );
    this.scriptsManager.beforeDispose = (script) =>
      this.interaction.cancelObject(script, 'removed');
    this.scriptsManager.afterDispose = (script) => {
      if (isUIElement(script)) this.uiRenderer.release(script);
    };

    this.scene.name = 'XR Blocks Scene';

    this.scene.add(this.xrSystemsGroup);
    this.xrSystemsGroup.add(this.user, this.sound, this.world, this.context);

    this.registry.register(this.registry);
    this.registry.register(this);
    this.registry.register(this.waitFrame);
    this.registry.register(this.screenshotSynthesizer);
    this.registry.register(this.xrReferenceSpaceCache);
    this.registry.register(this.simulationTimer);
    this.registry.register(this.scene);
    this.registry.register(this.timer);
    this.registry.register(this.input);
    this.registry.register(this.user);
    this.registry.register(this.interaction);
    this.registry.register(this.sound);
    this.registry.register(this.scriptsManager);
    this.registry.register(this.depth);
    this.registry.register(this.world);
    this.registry.register(this.context);
    this.registry.register(this.xrSystemsGroup);
  }

  dispose(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;
    if (this.lifecycleState === 'disposed') return Promise.resolve();

    this.lifecycleState = 'disposing';
    this.disposalPromise = this.finishDisposal();
    return this.disposalPromise;
  }

  private async finishDisposal(): Promise<void> {
    let firstError: unknown;
    const cleanups: Array<() => void | Promise<void>> = [
      () => {
        if (this.physicsInterval === undefined) return;
        clearInterval(this.physicsInterval);
        this.physicsInterval = undefined;
      },
      () => {
        if (typeof this._renderer?.setAnimationLoop === 'function') {
          this._renderer.setAnimationLoop(null);
        }
      },
      () => window.removeEventListener('resize', this.onWindowResize),
      () => {
        const button = this.xrButton;
        this.xrButton = undefined;
        button?.dispose();
      },
      () => this.disposeWebXRSessionManager(),
      async () => {
        try {
          await this.startingSimulator;
        } catch {
          // Startup observes the disposing lifecycle and cleans up its runtime.
        }
      },
      () => this.scriptsManager.dispose(),
      () => {
        this.simulatorRunning = false;
      },
      () => this.interaction.clear(),
      () => this.uiRenderer.dispose(),
      () => this.input.dispose(),
      () => {
        const camera = this.deviceCamera;
        this.deviceCamera = undefined;
        camera?.dispose();
      },
      () => {
        const effects = this.effects;
        this.effects = undefined;
        effects?.dispose();
      },
      () => {
        const physics = this.physics;
        this.physics = undefined;
        physics?.dispose();
      },
      () => {
        const renderer = this._renderer;
        this._renderer = undefined;
        if (typeof renderer?.dispose === 'function') {
          renderer.dispose();
        }
      },
      () => {
        this.rendererContainer?.remove();
        this.rendererContainer = undefined;
      },
    ];

    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error: unknown) {
        firstError ??= error;
      }
    }

    this.lifecycleState = 'disposed';
    if (firstError !== undefined) throw firstError;
  }

  private async disposeWebXRSessionManager(): Promise<void> {
    const manager = this.webXRSessionManager;
    if (!manager) return;
    this.webXRSessionManager = undefined;
    manager.removeEventListener(
      WebXRSessionEventType.SESSION_START,
      this.onWebXRSessionStarted
    );
    manager.removeEventListener(
      WebXRSessionEventType.SESSION_END,
      this.onXRSessionEnded
    );
    manager.removeEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      this.onWebXRUnsupported
    );
    await manager.dispose();
  }

  /**
   * Initializes the Core system with a given set of options. This includes
   * setting up the renderer, enabling features like controllers, depth
   * sensing, and physics, and starting the render loop.
   * @param options - Configuration options for the
   * session.
   */
  init(options = new Options()): Promise<void> {
    if (
      this.lifecycleState === 'initializing' ||
      this.lifecycleState === 'running'
    ) {
      return this.initializationPromise!;
    }
    if (
      this.lifecycleState === 'disposing' ||
      this.lifecycleState === 'disposed'
    ) {
      return Promise.reject(
        new Error(
          `Core cannot initialize after disposal has ${
            this.lifecycleState === 'disposing' ? 'started' : 'completed'
          }.`
        )
      );
    }

    this.lifecycleState = 'initializing';
    this.initializationPromise = Promise.resolve().then(() =>
      this.runInitialization(options)
    );
    return this.initializationPromise;
  }

  private async runInitialization(options: Options): Promise<void> {
    try {
      await this.initialize(options);
    } catch (error) {
      markDebugFailed(this, error);
      if (this.lifecycleState === 'initializing') {
        try {
          await this.dispose();
        } catch (cleanupError) {
          console.error(
            'Core cleanup failed after initialization failed.',
            cleanupError
          );
        }
      }
      throw error;
    }

    this.assertInitializing();
    this.lifecycleState = 'running';
    markDebugReady(this);
  }

  private async initialize(options: Options) {
    loadingSpinnerManager.showSpinner();

    this.registry.register(options, Options);
    this.registry.register(options.depth, DepthOptions);
    this.registry.register(options.simulator, SimulatorOptions);
    this.registry.register(options.world, WorldOptions);
    this.registry.register(options.context, ContextOptions);
    this.registry.register(options.context.scene, SceneOptions);
    this.registry.register(options.world.meshes, MeshDetectionOptions);
    this.registry.register(options.ai, AIOptions);
    this.registry.register(options.sound, SoundOptions);
    this.registry.register(options.gestures, GestureRecognitionOptions);
    this.registry.register(options.headGestures, HeadGestureRecognitionOptions);
    this.registry.register(options.strokes, StrokeRecognitionOptions);

    if (options.transition.enabled) {
      this.transition = new XRTransition();
      this.user.add(this.transition);
      this.registry.register(this.transition);
    }

    this.camera.copy(
      new THREE.PerspectiveCamera(
        /*fov=*/ 90,
        window.innerWidth / window.innerHeight,
        /*near=*/ options.camera.near,
        /*far=*/ options.camera.far
      )
    );
    this.registry.register(this.camera, THREE.Camera);
    this.registry.register(this.camera, THREE.PerspectiveCamera);
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: options.antialias,
      stencil: options.stencil,
      alpha: true,
      logarithmicDepthBuffer: options.logarithmicDepthBuffer,
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.xr.enabled = true;
    // disable built-in occlusion
    this.renderer.xr.getDepthSensingMesh = function () {
      return null;
    };
    this.registry.register(this.renderer);

    this.renderer.xr.setReferenceSpaceType(options.referenceSpaceType);
    // For desktop simulator:
    window.addEventListener('resize', this.onWindowResize);

    if (!options.canvas) {
      this.rendererContainer = document.createElement('div');
      document.body.appendChild(this.rendererContainer);
      this.rendererContainer.appendChild(this.renderer.domElement);
    }

    this.options = options;
    this.reticleOptions.maxDistance = options.reticles.maxDistance;
    this.reticleOptions.defaultRenderDistance =
      options.reticles.defaultRenderDistance;
    this.scriptsManager.catchExceptions = options.catchScriptExceptions;
    this.interaction.setLongSelectDuration(
      options.interaction.longSelectDuration
    );
    this.interaction.setRaycastMode(options.interaction.raycastMode);

    // Sets up input. Head gestures are camera-only and do not require controllers.
    this.input.init({
      systemsGroup: this.xrSystemsGroup,
      options: options,
      renderer: this.renderer,
    });
    if (options.controllers.enabled) {
      this.input.bindSqueezeStart(this.scriptsManager.callSqueezeStart);
      this.input.bindSqueezeEnd(this.scriptsManager.callSqueezeEnd);
      this.input.bindSqueeze(this.scriptsManager.callSqueeze);
      this.input.bindKeyDown(this.scriptsManager.callKeyDown);
      this.input.bindKeyUp(this.scriptsManager.callKeyUp);
    }

    // Sets up device camera.
    if (options.deviceCamera?.enabled) {
      this.deviceCamera = new XRDeviceCamera(options.deviceCamera);
      this.deviceCamera.setRenderer(this.renderer);
      this.registry.register(this.deviceCamera);
      this.context.setDeviceCamera(this.deviceCamera);
    }

    const webXRRequiredFeatures: string[] = options.webxrRequiredFeatures;
    const webXROptionalFeatures: string[] = options.webxrOptionalFeatures;
    // Use camera-access when the browser supports it.
    if (options.deviceCamera?.enabled) {
      webXROptionalFeatures.push('camera-access');
    }
    this.webXRSettings.requiredFeatures = webXRRequiredFeatures;
    this.webXRSettings.optionalFeatures = webXROptionalFeatures;
    // Sets up depth.
    if (options.depth.enabled) {
      webXRRequiredFeatures.push('depth-sensing');
      webXRRequiredFeatures.push('local-floor');
      this.webXRSettings.depthSensing = {
        usagePreference: options.depth.usagePreference,
        dataFormatPreference: options.depth.dataFormatPreference,
        depthTypeRequest: options.depth.depthTypeRequest,
        matchDepthView: options.depth.matchDepthView,
      };
      this.depth.init(
        this.camera,
        options.depth,
        this.renderer,
        this.registry,
        this.scene
      );
      if (this.depth.depthMesh) {
        this.depth.depthMesh.xb = {
          ...this.depth.depthMesh.xb,
          pointerEvents: options.reticles.projectOnDepthMesh ? 'auto' : 'none',
          reticleMode: 'surface',
        };
      }
    }
    if (options.hands.enabled) {
      webXRRequiredFeatures.push('hand-tracking');
      this.user.hands = new Hands(this.input.hands);
      if (options.gestures.enabled) {
        this.poseEstimation = options.gestures.poseEstimator;
        this.gestureRecognition = new GestureRecognition();
        this.xrSystemsGroup.add(this.gestureRecognition);
        this.registry.register(this.poseEstimation);
        this.registry.register(this.gestureRecognition);
      }
    }
    // World-sensing and lighting features are requested as optional so that
    // browsers lacking one of them still enter the immersive session instead
    // of rejecting it outright; the subsystems no-op when the data is absent.
    if (options.world.planes.enabled) {
      webXROptionalFeatures.push('plane-detection');
    }
    if (options.world.meshes.enabled) {
      webXROptionalFeatures.push('mesh-detection');
    }
    // Composition layers are optional too: without the feature the layer
    // classes simply never appear and each layer falls back to being drawn
    // into the scene.
    if (options.layers.enabled) {
      webXROptionalFeatures.push('layers');
    }
    if (options.world.anchors.enabled) {
      webXROptionalFeatures.push('anchors');
    }

    // Sets up lighting.
    if (options.lighting.enabled) {
      webXROptionalFeatures.push('light-estimation');
      this.lighting = new Lighting();
      this.lighting.init(
        options.lighting,
        this.renderer,
        this.scene,
        this.depth
      );
    }

    // Sets up physics.
    if (options.physics && options.physics.RAPIER) {
      this.physics = new Physics();
      this.registry.register(this.physics);
      await this.physics.init({physicsOptions: options.physics});
      this.assertInitializing();

      if (options.depth.enabled) {
        this.depth.depthMesh?.initRapierPhysics(
          this.physics.RAPIER,
          this.physics.blendedWorld
        );
      }
    }

    this.webXRSessionManager = new WebXRSessionManager(
      this.renderer,
      this.webXRSettings,
      options.xrSessionMode
    );
    this.webXRSessionManager.addEventListener(
      WebXRSessionEventType.SESSION_START,
      this.onWebXRSessionStarted
    );
    this.webXRSessionManager.addEventListener(
      WebXRSessionEventType.SESSION_END,
      this.onXRSessionEnded
    );

    // Sets up xrButton.
    this.shouldAutostartSimulator =
      this.options.xrButton.alwaysAutostartSimulator;
    if (!this.shouldAutostartSimulator && options.xrButton.enabled) {
      this.xrButton = new XRButton(
        this.webXRSessionManager,
        this.permissionsManager,
        options.xrButton?.appTitle,
        options.xrButton?.appDescription,
        options.xrButton?.startText,
        options.xrButton?.endText,
        options.xrButton?.invalidText,
        options.xrButton?.startSimulatorText,
        options.xrButton?.showEnterSimulatorButton,
        this.startSimulator,
        options.permissions
      );
      document.body.appendChild(this.xrButton.domElement);
    }

    this.webXRSessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      this.onWebXRUnsupported
    );

    await this.webXRSessionManager.initialize();
    this.assertInitializing();

    // Sets up postprocessing effects.
    if (options.usePostprocessing) {
      this.effects = new XREffects(this.renderer, this.scene, this.timer);
    }

    // Sets up AI services.
    if (options.ai.enabled) {
      this.registry.register(this.ai);
      this.xrSystemsGroup.add(this.ai);
      // Manually init the script in case other scripts rely on it.
      await this.scriptsManager.initScript(this.ai);
      this.assertInitializing();
    }

    await Promise.all([
      this.uiRenderer.initialize(this.scene, this.renderer),
      this.scriptsManager.syncScriptsWithScene(this.scene),
    ]);
    this.assertInitializing();
    this.uiRenderer.reconcile(0, this.camera);
    this.uiRenderer.present();

    this.renderer.setAnimationLoop(this.update);

    if (this.physics) {
      this.physicsInterval = setInterval(
        this.physicsStep,
        1000 * this.physics.timestep
      );
    }

    if (this.options.reticles.enabled) {
      this.input.addReticles();
    }

    if (this.shouldAutostartSimulator) {
      await this.startSimulator();
      this.assertInitializing();
    }

    if (!loadingSpinnerManager.isLoading) {
      loadingSpinnerManager.hideSpinner();
    }
  }

  /**
   * The main update loop, called every frame by the renderer. It orchestrates
   * all per-frame updates for subsystems and scripts.
   *
   * Order:
   * 1. Sample physical input.
   * 2. Run Script updates.
   * 3. Reconcile UI layout and world matrices.
   * 4. Raycast and resolve Interaction.
   * 5. Present Interaction state.
   * 6. Render the world and overlays.
   * @param time - The current time in milliseconds.
   * @param frame - The WebXR frame object, if in an XR session.
   */
  private update = (time: number, frame: XRFrame) => {
    if (this._isPaused && !this.isSteppingFrame) {
      return;
    }

    this.manualStepTime = Math.max(this.manualStepTime, time);
    if (!this.isSteppingFrame) {
      this.simulationTimer.update(time, this.timer.getTimescale());
    }
    this.timer.update(time);
    const deltaSeconds = this.timer.getDelta();
    if (this.simulatorRunning) {
      this.simulator?.simulatorUpdate();
    }
    this.depth.update(frame);

    // Update XR camera fallback textures.
    if (this.deviceCamera?.isUsingXRCameraAccess) {
      this.deviceCamera.updateXRCamera(frame);
    }

    if (this.lighting) {
      this.lighting.update();
    }

    // XREffects renders each eye manually with XR camera auto-update disabled.
    // Keep the public camera at the current headset pose so view-space UI and
    // scripts do not use the stale pose from before the XR session started.
    if (this.effects && this.renderer.xr.isPresenting) {
      this.renderer.xr.updateCamera(this.camera);
    }

    this.input.sampleSources();

    // Traverse the scene to find all scripts.
    this.scriptsManager.syncScriptsWithScene(this.scene);

    // Run callbacks that use wait frame.
    this.waitFrame.onFrame();

    this.scriptsManager.update(time, frame);

    // Update non-selection input callbacks.
    for (const controller of this.input.controllers) {
      if (controller.userData.squeezing) {
        this.scriptsManager.callSqueezing(controller);
      }
    }

    const frameCamera = this.getFrameCamera();
    this.uiRenderer.reconcile(deltaSeconds, frameCamera);
    this.interaction.syncTouchCandidates(
      this.scriptsManager.directTouchCandidates
    );
    this.scene.updateMatrixWorld(true);
    this.interaction.update(this.input.getFrame(), deltaSeconds);
    this.uiRenderer.present();

    this.renderSimulatorAndScene();
    this.screenshotSynthesizer.onAfterRender(
      this.renderer,
      this.renderSceneCallback,
      this.deviceCamera
    );
    if (this.simulatorRunning) {
      this.simulator?.renderSimulatorScene();
    }
  };

  /**
   * Advances the physics simulation by a fixed timestep and calls the
   * corresponding physics update on all active scripts.
   */
  private physicsStep = () => {
    if (this._isPaused && !this.isSteppingFrame) {
      return;
    }

    this.physics!.physicsStep();
    this.scriptsManager.physicsStep();
  };

  /**
   * Lifecycle callback executed when an XR session starts. Notifies all active
   * scripts.
   * @param session - The newly started WebXR session.
   */
  private async onXRSessionStarted(session: XRSession) {
    if (!this.isLifecycleActive()) return;
    this.xrReferenceSpaceCache.onXRSessionStart(session);
    if (this.options.deviceCamera?.enabled) {
      await this.deviceCamera!.init();
      if (!this.isLifecycleActive()) return;
    }
    this.scriptsManager.onXRSessionStarted(session);
  }

  startSimulator = async (): Promise<Simulator> => {
    this.assertLifecycleActive('start the simulator');
    if (this.simulatorRunning && this.simulator) return this.simulator;
    if (this.startingSimulator) return this.startingSimulator;

    this.startingSimulator = (async () => {
      this.xrButton?.dispose();
      this.xrButton = undefined;
      const {Simulator} = await this.simulatorLoader();
      this.assertLifecycleActive('load the simulator runtime');
      const simulator = new Simulator(this.renderSceneCallback);
      simulator.effects = this.effects;
      try {
        // Keep the simulator connected to the script lifecycle while its async
        // initialization runs. Otherwise the frame loop treats it as removed
        // and disposes it before startup completes.
        this.xrSystemsGroup.add(simulator);
        await this.scriptsManager.initScript(simulator);
        this.assertLifecycleActive('finish simulator startup');
        this.simulator = simulator;
        this.registry.register(simulator);
        this.onSimulatorStarted();
        return simulator;
      } catch (error) {
        simulator.removeFromParent();
        try {
          simulator.dispose();
        } catch (cleanupError) {
          console.error(
            'Simulator cleanup failed after startup failed.',
            cleanupError
          );
        }
        throw error;
      }
    })();

    try {
      return await this.startingSimulator;
    } finally {
      this.startingSimulator = undefined;
    }
  };

  /**
   * Lifecycle callback executed when an XR session ends. Notifies all active
   * scripts.
   */
  private onXRSessionEnded = () => {
    if (!this.isLifecycleActive()) return;
    this.scriptsManager.onXRSessionEnded();
  };

  private isLifecycleActive(): boolean {
    return (
      this.lifecycleState === 'initializing' ||
      this.lifecycleState === 'running'
    );
  }

  private assertInitializing(): void {
    if (this.lifecycleState === 'initializing') return;
    throw new Error(
      `Core initialization stopped because Core is ${this.lifecycleState}.`
    );
  }

  private assertLifecycleActive(operation: string): void {
    if (this.isLifecycleActive()) return;
    throw new Error(
      `Core cannot ${operation} while it is ${this.lifecycleState}.`
    );
  }

  /**
   * Lifecycle callback executed when the desktop simulator starts. Notifies
   * all active scripts.
   */
  private onSimulatorStarted() {
    this.simulatorRunning = true;
    this.scriptsManager.onSimulatorStarted();
    if (this.lighting) {
      this.lighting.simulatorRunning = true;
    }
  }

  /**
   * Handles browser window resize events to keep the camera and renderer
   * synchronized.
   */
  private onWindowResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private renderSimulatorAndScene() {
    if (this.simulatorRunning && this.simulator) {
      this.simulator.renderScene();
    } else {
      this.renderScene();
    }
  }

  private getFrameCamera(): THREE.Camera {
    if (!this.simulatorRunning || !this.simulator) return this.camera;
    return this.simulator.getRenderCamera() ?? this.camera;
  }

  private renderScene(cameraOverride?: THREE.Camera) {
    const camera = cameraOverride ?? this.camera;
    if (this.renderSceneOverride) {
      this.renderSceneOverride(this.renderer, this.scene, camera);
    } else if (this.effects) {
      this.effects.render(camera);
    } else {
      this.renderer.render(this.scene, camera);
    }
  }
}
