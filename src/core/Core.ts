import * as THREE from 'three';

import {AI} from '../ai/AI';
import {AIOptions} from '../ai/AIOptions';
import {XRDeviceCamera} from '../camera/XRDeviceCamera';
import {UI_OVERLAY_LAYER} from '../constants';
import {Depth} from '../depth/Depth';
import {DepthOptions} from '../depth/DepthOptions';
import {Hands} from '../input/Hands';
import {GestureRecognition} from '../input/gestures/GestureRecognition';
import {GestureRecognitionOptions} from '../input/gestures/GestureRecognitionOptions.js';
import {Input} from '../input/Input';
import {Lighting} from '../lighting/Lighting';
import {Physics} from '../physics/Physics';
import {Simulator} from '../simulator/Simulator';
import {SimulatorOptions} from '../simulator/SimulatorOptions';
import {CoreSound} from '../sound/CoreSound';
import {SoundOptions} from '../sound/SoundOptions';
import {UI} from '../ui/UI';
import {callInitWithDependencyInjection} from '../utils/DependencyInjection';
import {loadingSpinnerManager} from '../utils/LoadingSpinnerManager';
import {traverseUtil} from '../utils/SceneGraphUtils';
import {DragManager} from '../ux/DragManager';
import {World} from '../world/World';
import {WorldOptions} from '../world/WorldOptions';

import {Registry} from './components/Registry';
import {ScreenshotSynthesizer} from './components/ScreenshotSynthesizer';
import {ScriptsManager} from './components/ScriptsManager';
import {WaitFrame} from './components/WaitFrame';
import {
  IMMERSIVE_AR,
  WebXRSessionEventType,
  WebXRSessionManager,
} from './components/WebXRSessionManager';
import {XRButton} from './components/XRButton';
import {XREffects} from './components/XREffects';
import {XRTransition} from './components/XRTransition';
import {Options} from './Options';
import {Script} from './Script';
import {User} from './User';
import {PermissionsManager} from './components/PermissionsManager';

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
   * Registry used for dependency injection on existing subsystems.
   */
  registry = new Registry();

  /**
   * A clock for tracking time deltas. Call clock.getDeltaTime().
   */
  timer = new THREE.Timer();

  /** Manages hand, mouse, gaze inputs. */
  input = new Input();

  /** The main camera for rendering. */
  camera!: THREE.PerspectiveCamera;

  /** The root scene graph for all objects. */
  scene = new THREE.Scene();

  /** Represents the user in the XR scene. */
  user = new User();

  /** Manages all UI elements. */
  ui = new UI();

  /** Manages all (spatial) audio playback. */
  sound = new CoreSound();

  private renderSceneBound = this.renderScene.bind(this);

  /** Manages the desktop XR simulator. */
  simulator = new Simulator(this.renderSceneBound);

  /** Manages drag-and-drop interactions. */
  dragManager = new DragManager();

  /** Manages drag-and-drop interactions. */
  world = new World();

  /** A shared texture loader. */
  textureLoader = new THREE.TextureLoader();

  private webXRSettings: XRSessionInit = {};

  /** Whether the XR simulator is currently active. */
  simulatorRunning = false;

  renderer!: THREE.WebGLRenderer;
  options!: Options;
  deviceCamera?: XRDeviceCamera;
  depth = new Depth();
  lighting?: Lighting;
  physics?: Physics;
  xrButton?: XRButton;
  effects?: XREffects;
  ai = new AI();
  gestureRecognition?: GestureRecognition;
  transition?: XRTransition;
  currentFrame?: XRFrame;
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
   * Core is a singleton manager that manages all XR "blocks".
   * It initializes core components and abstractions like the scene, camera,
   * user, UI, AI, and input managers.
   */
  constructor() {
    if (Core.instance) {
      return Core.instance;
    }
    Core.instance = this;

    this.scene.name = 'XR Blocks Scene';

    // Separate calls because spark hijacks THREE.Scene.add and only supports
    // adding objects one at a time. See
    // https://github.com/sparkjsdev/spark/blob/0edfc8d9232b8f6eb036d27af57dc40daf94e1f3/src/SparkRenderer.ts#L63
    this.scene.add(this.user);
    this.scene.add(this.dragManager);
    this.scene.add(this.ui);
    this.scene.add(this.sound);
    this.scene.add(this.world);

    this.registry.register(this.registry);
    this.registry.register(this.waitFrame);
    this.registry.register(this.scene);
    this.registry.register(this.timer);
    this.registry.register(this.input);
    this.registry.register(this.user);
    this.registry.register(this.ui);
    this.registry.register(this.sound);
    this.registry.register(this.dragManager);
    this.registry.register(this.user);
    this.registry.register(this.simulator);
    this.registry.register(this.scriptsManager);
    this.registry.register(this.depth);
  }

  /**
   * Initializes the Core system with a given set of options. This includes
   * setting up the renderer, enabling features like controllers, depth
   * sensing, and physics, and starting the render loop.
   * @param options - Configuration options for the
   * session.
   */
  async init(options = new Options()) {
    loadingSpinnerManager.showSpinner();

    this.registry.register(options, Options);
    this.registry.register(options.depth, DepthOptions);
    this.registry.register(options.simulator, SimulatorOptions);
    this.registry.register(options.world, WorldOptions);
    this.registry.register(options.ai, AIOptions);
    this.registry.register(options.sound, SoundOptions);
    this.registry.register(options.gestures, GestureRecognitionOptions);

    if (options.transition.enabled) {
      this.transition = new XRTransition();
      this.user.add(this.transition);
      this.registry.register(this.transition);
    }

    this.camera = new THREE.PerspectiveCamera(
      /*fov=*/ 90,
      window.innerWidth / window.innerHeight,
      /*near=*/ options.camera.near,
      /*far=*/ options.camera.far
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

    if (!options.canvas) {
      const xrContainer = document.createElement('div');
      document.body.appendChild(xrContainer);
      xrContainer.appendChild(this.renderer.domElement);
    }

    this.options = options;

    // Sets up controllers.
    if (options.controllers.enabled) {
      this.input.init({
        scene: this.scene,
        options: options,
        renderer: this.renderer,
      });
      this.input.bindSelectStart(this.scriptsManager.callSelectStartBound);
      this.input.bindSelectEnd(this.scriptsManager.callSelectEndBound);
      this.input.bindSelect(this.scriptsManager.callSelectBound);
      this.input.bindSqueezeStart(this.scriptsManager.callSqueezeStartBound);
      this.input.bindSqueezeEnd(this.scriptsManager.callSqueezeEndBound);
      this.input.bindSqueeze(this.scriptsManager.callSqueezeBound);
      this.input.bindKeyDown(this.scriptsManager.callKeyDownBound);
      this.input.bindKeyUp(this.scriptsManager.callKeyUpBound);
    }

    // Sets up device camera.
    if (options.deviceCamera?.enabled) {
      this.deviceCamera = new XRDeviceCamera(options.deviceCamera);
      this.registry.register(this.deviceCamera);
    }

    const webXRRequiredFeatures: string[] = options.webxrRequiredFeatures;
    this.webXRSettings.requiredFeatures = webXRRequiredFeatures;
    // Sets up depth.
    if (options.depth.enabled) {
      webXRRequiredFeatures.push('depth-sensing');
      webXRRequiredFeatures.push('local-floor');
      this.webXRSettings.depthSensing = {
        usagePreference: [],
        dataFormatPreference: [
          this.options.depth.useFloat32 ? 'float32' : 'luminance-alpha',
        ],
        depthTypeRequest: options.depth.depthTypeRequest,
      };
      this.depth.init(
        this.camera,
        options.depth,
        this.renderer,
        this.registry,
        this.scene
      );
    }
    if (options.hands.enabled) {
      webXRRequiredFeatures.push('hand-tracking');
      this.user.hands = new Hands(this.input.hands);
      if (options.gestures.enabled) {
        this.gestureRecognition = new GestureRecognition();
        this.scene.add(this.gestureRecognition);
        this.registry.register(this.gestureRecognition);
      }
    }
    if (options.world.planes.enabled) {
      webXRRequiredFeatures.push('plane-detection');
    }

    // Sets up lighting.
    if (options.lighting.enabled) {
      webXRRequiredFeatures.push('light-estimation');
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
      IMMERSIVE_AR
    );
    this.webXRSessionManager.addEventListener(
      WebXRSessionEventType.SESSION_START,
      (event) => this.onXRSessionStarted(event.session)
    );
    this.webXRSessionManager.addEventListener(
      WebXRSessionEventType.SESSION_END,
      this.onXRSessionEnded.bind(this)
    );

    // Sets up xrButton.
    let shouldAutostartSimulator =
      this.options.xrButton.alwaysAutostartSimulator;
    if (!shouldAutostartSimulator && options.xrButton.enabled) {
      this.xrButton = new XRButton(
        this.webXRSessionManager,
        this.permissionsManager,
        options.xrButton?.startText,
        options.xrButton?.endText,
        options.xrButton?.invalidText,
        options.xrButton?.startSimulatorText,
        options.xrButton?.showEnterSimulatorButton,
        this.startSimulator.bind(this),
        options.permissions
      );
      document.body.appendChild(this.xrButton.domElement);
    }

    this.webXRSessionManager.addEventListener(
      WebXRSessionEventType.UNSUPPORTED,
      () => {
        if (this.options.enableSimulator) {
          this.xrButton?.domElement.remove();
          shouldAutostartSimulator = true;
        }
      }
    );

    await this.webXRSessionManager.initialize();

    // Sets up postprocessing effects.
    if (options.usePostprocessing) {
      this.effects = new XREffects(this.renderer, this.scene, this.timer);
      this.simulator.effects = this.effects;
    }

    // Sets up AI services.
    if (options.ai.enabled) {
      this.registry.register(this.ai);
      this.scene.add(this.ai);
      // Manually init the script in case other scripts rely on it.
      await this.scriptsManager.initScript(this.ai);
    }

    await this.scriptsManager.syncScriptsWithScene(this.scene);

    // For desktop only:
    window.addEventListener('resize', this.onWindowResize.bind(this));

    this.renderer.setAnimationLoop(this.update.bind(this));

    if (this.physics) {
      setInterval(this.physicsStep.bind(this), 1000 * this.physics.timestep);
    }

    if (this.options.reticles.enabled) {
      this.input.addReticles();
    }

    if (shouldAutostartSimulator) {
      this.startSimulator();
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
   * 1. Depth
   * 2. World Perception
   * 3. Input / Reticles / UIs
   * 4. Scripts
   * @param time - The current time in milliseconds.
   * @param frame - The WebXR frame object, if in an XR session.
   */
  private update(time: number, frame: XRFrame) {
    this.currentFrame = frame;
    this.timer.update(time);
    if (this.simulatorRunning) {
      this.simulator.simulatorUpdate();
    }
    this.depth.update(frame);

    if (this.lighting) {
      this.lighting.update();
    }

    // Traverse the scene to find all scripts.
    this.scriptsManager.syncScriptsWithScene(this.scene);

    // Updates reticles and UIs.
    for (const script of this.scriptsManager.scripts) {
      script.ux.reset();
    }
    this.input.update();

    // Updates scripts with user interactions.
    for (const controller of this.input.controllers) {
      if (controller.userData.selected) {
        for (const script of this.scriptsManager.scripts) {
          script.onSelecting({target: controller});
        }
      }
    }

    for (const controller of this.input.controllers) {
      if (controller.userData.squeezing) {
        for (const script of this.scriptsManager.scripts) {
          script.onSqueezing({target: controller});
        }
      }
    }

    // Run callbacks that use wait frame.
    this.waitFrame.onFrame();

    // Updates renderings.
    for (const script of this.scriptsManager.scripts) {
      script.update(time, frame);
    }

    this.renderSimulatorAndScene();
    this.screenshotSynthesizer.onAfterRender(
      this.renderer,
      this.renderSceneBound,
      this.deviceCamera
    );
    if (this.simulatorRunning) {
      this.simulator.renderSimulatorScene();
    }
  }

  /**
   * Advances the physics simulation by a fixed timestep and calls the
   * corresponding physics update on all active scripts.
   */
  private physicsStep() {
    this.physics!.physicsStep();
    for (const script of this.scriptsManager.scripts) {
      script.physicsStep();
    }
  }

  /**
   * Lifecycle callback executed when an XR session starts. Notifies all active
   * scripts.
   * @param session - The newly started WebXR session.
   */
  private async onXRSessionStarted(session: XRSession) {
    if (this.options.deviceCamera?.enabled) {
      await this.deviceCamera!.init();
    }
    this.scriptsManager.onXRSessionStarted(session);
  }

  private async startSimulator() {
    this.xrButton?.domElement.remove();
    this.scene.add(this.simulator);
    await this.scriptsManager.initScript(this.simulator);
    this.onSimulatorStarted();
  }

  /**
   * Lifecycle callback executed when an XR session ends. Notifies all active
   * scripts.
   */
  private onXRSessionEnded() {
    this.scriptsManager.onXRSessionEnded();
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
  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private renderSimulatorAndScene() {
    if (this.simulatorRunning) {
      this.simulator.renderScene();
    } else {
      this.renderScene();
    }
  }

  private renderScene(cameraOverride?: THREE.Camera) {
    if (this.renderSceneOverride) {
      this.renderSceneOverride(
        this.renderer,
        this.scene,
        cameraOverride ?? this.camera
      );
    } else if (this.effects) {
      this.effects.render();
    } else {
      this.renderer.render(this.scene, cameraOverride ?? this.camera);
      if (
        traverseUtil(this.scene, (node: THREE.Object3D) =>
          node.layers.isEnabled(UI_OVERLAY_LAYER)
        )
      ) {
        const originalLayers = this.camera.layers.mask;
        this.camera.layers.set(UI_OVERLAY_LAYER);
        this.renderer.render(this.scene, this.camera);
        this.camera.layers.mask = originalLayers;
      }
    }
  }
}
