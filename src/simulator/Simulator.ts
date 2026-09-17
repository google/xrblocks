import * as THREE from 'three';

import {XRDeviceCamera} from '../camera/XRDeviceCamera.js';
import {Registry} from '../core/components/Registry';
import {Options} from '../core/Options';
import {
  assertWebGLRenderer,
  type WebGLOrWebGPURenderer,
} from '../core/RendererTypes';
import {Script} from '../core/Script';
import {Depth} from '../depth/Depth';
import {Input} from '../input/Input';
import {Interaction} from '../interaction/Interaction';
import {Physics} from '../physics/Physics';

import {SimulatorBackgroundVideo} from './internal/compositing/SimulatorBackgroundVideo';
import {
  createSimulatorCompositor,
  type SimulatorCompositor,
} from './internal/compositing/SimulatorCompositor';
import {SimulatorCamera} from './SimulatorCamera';
import {AVERAGE_IPD_METERS, SimulatorRenderMode} from './SimulatorConstants';
import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorControls} from './SimulatorControls';
import {SimulatorDepth} from './scene/SimulatorDepth';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorNavMesh} from './internal/navmesh/SimulatorNavMesh';
import {SimulatorOptions} from './SimulatorOptions';
import type {SimulatorEnvironment} from './SimulatorOptions';
import {SimulatorScene} from './scene/SimulatorScene';
import {SimulatorUser} from './SimulatorUser';
import {SimulatorEnvironmentManager} from './scene/SimulatorEnvironmentManager';
import type {SimulatorLocations} from './scene/SimulatorEnvironmentManifest';
import {SimulatorObjectDetectionSource} from '../world/objects/SimulatorObjectDetectionSource';
import {
  type SimulatorObjects,
  SimulatorObjectsManager,
} from './scene/SimulatorObjects';
import {SimulatorPhysics} from './scene/SimulatorPhysics';
import {SimulatorWorld} from './scene/SimulatorWorld';
import {World} from '../world/World';

export interface SimulatorUserPath {
  target: THREE.Vector3;
  path: THREE.Vector3[];
}

export class Simulator extends Script {
  private static readonly dependencies = {
    simulatorOptions: SimulatorOptions,
    input: Input,
    interaction: Interaction,
    timer: THREE.Timer,
    camera: THREE.Camera,
    scene: THREE.Scene,
    registry: Registry,
    options: Options,
    depth: Depth,
    world: World,
  };
  editorIcon = 'simulation';
  simulatorScene = new SimulatorScene();
  simulatorWorld = new SimulatorWorld();
  private readonly navMesh = new SimulatorNavMesh();
  private simulatorObjects = new SimulatorObjectsManager();
  objects: SimulatorObjects = this.simulatorObjects;
  private environment?: SimulatorEnvironmentManager;
  private simulatorPhysics?: SimulatorPhysics;
  depth = new SimulatorDepth(this.simulatorScene);
  // Controller poses relative to the camera.
  simulatorControllerState = new SimulatorControllerState();
  hands = new SimulatorHands(
    this.simulatorControllerState,
    this.simulatorScene
  );
  simulatorUser = new SimulatorUser();
  userInterface = new SimulatorInterface();
  controls = new SimulatorControls(
    this.simulatorControllerState,
    this.hands,
    this.navMesh,
    this.setStereoRenderMode.bind(this),
    this.userInterface
  );
  renderDepthPass = false;
  renderMode = SimulatorRenderMode.DEFAULT;
  stereoCameras: THREE.Camera[] = [];

  simulatorCamera?: SimulatorCamera;
  options!: SimulatorOptions;
  mainCamera!: THREE.Camera;
  mainScene!: THREE.Scene;

  private initialized = false;
  private compositor?: SimulatorCompositor;
  private readonly backgroundVideo = new SimulatorBackgroundVideo();
  private currentVideoTexture?: THREE.Texture;
  private registry?: Registry;
  private world?: World;
  private objectDetectionSource?: SimulatorObjectDetectionSource;
  private deviceCamera?: XRDeviceCamera;
  private useSimulatorObjectDetection = false;

  constructor(
    private renderMainScene: (cameraOverride?: THREE.Camera) => void,
    public renderer?: WebGLOrWebGPURenderer
  ) {
    super();
    this.renderer = renderer;
    this.add(this.simulatorUser);
  }

  get userMovementConstrained() {
    return this.navMesh.constrained;
  }

  moveUser(desiredCameraPosition: THREE.Vector3) {
    this.navMesh.applyUserMovement(this.mainCamera, desiredCameraPosition);
  }

  findRandomUserPath(): SimulatorUserPath | null {
    return this.navMesh.findRandomPathFrom(this.mainCamera.position);
  }

  async init({
    simulatorOptions,
    input,
    interaction,
    timer,
    camera,
    scene,
    registry,
    options,
    depth,
    world,
  }: {
    simulatorOptions: SimulatorOptions;
    input: Input;
    interaction: Interaction;
    timer: THREE.Timer;
    camera: THREE.Camera;
    scene: THREE.Scene;
    registry: Registry;
    options: Options;
    depth: Depth;
    world: World;
  }) {
    if (this.initialized) return;
    const renderer = this.renderer ?? registry.get(THREE.WebGLRenderer);
    if (!renderer) {
      throw new Error('Simulator requires a renderer instance.');
    }
    this.renderer = renderer;
    // Get optional dependencies from the registry.
    const deviceCamera = registry.get(XRDeviceCamera);
    this.deviceCamera = deviceCamera;
    const physics = registry.get(Physics);
    this.simulatorPhysics =
      physics && simulatorOptions.physics.enabled
        ? new SimulatorPhysics(physics, simulatorOptions.handPhysics)
        : undefined;
    this.options = simulatorOptions;
    this.mainCamera = camera;
    this.mainScene = scene;
    this.registry = registry;
    this.world = world;
    this.simulatorScene.add(this.navMesh.debugVisualization);
    this.navMesh.showDebugVisualizations(
      this.options.navMesh.showDebugVisualizations
    );
    camera.position.copy(this.options.initialCameraPosition);
    if (
      deviceCamera &&
      !this.simulatorCamera &&
      this.options.deviceCamera.enabled
    ) {
      assertWebGLRenderer(renderer, 'SimulatorCamera');
      this.simulatorCamera = new SimulatorCamera(renderer);
      this.simulatorCamera.init();
      deviceCamera.registerSimulatorCamera(this.simulatorCamera);
    }
    deviceCamera?.init();
    this.compositor = await createSimulatorCompositor(
      {
        renderer,
        simulatorScene: this.simulatorScene,
        renderMainScene: this.renderMainScene,
        registry,
        simulatorCamera: this.simulatorCamera,
        stencil: options.stencil,
        blendingMode: this.options.blendingMode,
      },
      this.options.renderToRenderTexture
    );
    await this.simulatorWorld.init(options, world);
    this.simulatorObjects.init(renderer, this.simulatorPhysics);
    this.environment = new SimulatorEnvironmentManager(
      simulatorOptions,
      renderer,
      this.simulatorScene,
      this.simulatorObjects,
      this.navMesh,
      this.simulatorWorld,
      this.simulatorPhysics,
      this.setVideoPath.bind(this)
    );
    const initialEnvironment =
      this.options.environments[this.options.activeEnvironmentIndex];
    if (!initialEnvironment) {
      throw new Error(
        `Simulator environment index ${this.options.activeEnvironmentIndex} does not exist.`
      );
    }
    await this.environment.setEnvironment(initialEnvironment);
    await this.environment.resolveEnvironmentNames(this.options.environments);
    await this.userInterface.init(
      simulatorOptions,
      this.controls,
      this.hands,
      input,
      this.activateEnvironment.bind(this),
      !!this.simulatorPhysics
    );
    this.useSimulatorObjectDetection =
      options.world.objects.enabled && options.world.objects.simulatorOverride;
    if (this.useSimulatorObjectDetection && world.objects) {
      this.objectDetectionSource = new SimulatorObjectDetectionSource(
        camera,
        this.simulatorScene,
        this.objects
      );
      world.objects.setSimulatorSource(this.objectDetectionSource);
    }
    await this.hands.init({
      input,
      physics: this.simulatorPhysics,
      camera,
      simulatorOptions,
    });
    this.controls.init({
      camera,
      input,
      interaction,
      timer,
      renderer,
      simulatorOptions,
    });

    if (options.depth.enabled) {
      assertWebGLRenderer(renderer, 'SimulatorDepth');
      this.renderDepthPass = true;
      this.depth.init(renderer, camera, depth);
    }
    scene.add(camera);

    if (this.options.stereo.enabled) {
      this.setupStereoCameras(camera);
    }

    this.initialized = true;
  }

  /**
   * Loads and activates a simulator environment at runtime.
   */
  async setEnvironment(manifestPath: string): Promise<void>;
  async setEnvironment(name: string, manifestPath: string): Promise<void>;
  async setEnvironment(nameOrPath: string, manifestPath?: string) {
    await this.activateEnvironment(
      manifestPath
        ? {name: nameOrPath, manifestPath}
        : {manifestPath: nameOrPath}
    );
  }

  private async activateEnvironment(environment: SimulatorEnvironment) {
    if (!this.initialized || !this.environment) {
      throw new Error('Simulator is not initialized.');
    }
    const index = this.options.environments.findIndex(
      (candidate) => candidate.manifestPath === environment.manifestPath
    );
    if (index !== -1) {
      this.options.activeEnvironmentIndex = index;
    }
    await this.environment.setEnvironment(environment);
  }

  get activeEnvironment() {
    return this.environment?.activeEnvironment;
  }

  get activeEnvironmentManifest() {
    return this.environment?.manifest;
  }

  /** Returns the named world-space locations for the active environment. */
  getLocations(): SimulatorLocations {
    return this.environment?.manifest?.locations ?? {};
  }

  physicsStep() {
    this.simulatorPhysics?.step();
    this.simulatorObjects.physicsStep();
  }

  override onXRSessionStarted() {
    if (this.useSimulatorObjectDetection) {
      this.world?.objects?.clear();
    }
    this.world?.objects?.setSimulatorSource(undefined);
    this.environment?.suspendSensing();
  }

  override onXRSessionEnded() {
    if (this.useSimulatorObjectDetection) {
      this.world?.objects?.clear();
      this.world?.objects?.setSimulatorSource(this.objectDetectionSource);
    }
    this.environment?.resumeSensing();
  }

  override dispose() {
    let firstError: unknown;
    const cleanups = [
      () => this.controls.dispose(),
      () => this.userInterface.dispose(),
      () => this.hands.dispose(),
      () => this.depth.dispose(),
      () => {
        const deviceCamera = this.deviceCamera;
        this.deviceCamera = undefined;
        deviceCamera?.registerSimulatorCamera(undefined);
      },
      () => {
        const simulatorCamera = this.simulatorCamera;
        this.simulatorCamera = undefined;
        simulatorCamera?.dispose();
      },
      () => this.world?.objects?.setSimulatorSource(undefined),
      () => {
        const environment = this.environment;
        this.environment = undefined;
        environment?.dispose();
      },
      () => {
        const simulatorPhysics = this.simulatorPhysics;
        this.simulatorPhysics = undefined;
        simulatorPhysics?.dispose();
      },
      () => this.setVideoPath(undefined),
      () => this.backgroundVideo.dispose(),
      () => {
        const compositor = this.compositor;
        this.compositor = undefined;
        compositor?.dispose();
      },
    ];
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error: unknown) {
        firstError ??= error;
      }
    }
    this.renderDepthPass = false;
    this.renderer = undefined;
    this.initialized = false;
    if (firstError !== undefined) throw firstError;
  }

  simulatorUpdate() {
    this.controls.update();
    this.hands.update();

    if (this.renderDepthPass) {
      this.depth.update();
    }
  }

  setStereoRenderMode(mode: SimulatorRenderMode) {
    if (!this.options.stereo.enabled) return;
    this.renderMode = mode;
  }

  setupStereoCameras(camera: THREE.Camera) {
    const leftCamera = camera.clone();
    const rightCamera = camera.clone();
    leftCamera.layers.disableAll();
    leftCamera.layers.enable(0);
    leftCamera.layers.enable(1);
    rightCamera.layers.disableAll();
    rightCamera.layers.enable(0);
    rightCamera.layers.enable(2);
    leftCamera.position.set(-AVERAGE_IPD_METERS / 2, 0, 0);
    rightCamera.position.set(AVERAGE_IPD_METERS / 2, 0, 0);
    leftCamera.updateWorldMatrix(true, false);
    rightCamera.updateWorldMatrix(true, false);
    this.stereoCameras.length = 0;
    this.stereoCameras.push(leftCamera, rightCamera);
    camera.add(leftCamera, rightCamera);
    this.setStereoRenderMode(SimulatorRenderMode.STEREO_LEFT);
  }

  getRenderCamera() {
    return {
      [SimulatorRenderMode.DEFAULT]: this.mainCamera,
      [SimulatorRenderMode.STEREO_LEFT]: this.stereoCameras[0],
      [SimulatorRenderMode.STEREO_RIGHT]: this.stereoCameras[1],
    }[this.renderMode];
  }

  /**
   * Renders one complete simulator frame (physical environment + virtual scene)
   * to the default framebuffer. Called by Core when the simulator is running.
   */
  renderFrame() {
    if (!this.initialized || !this.compositor) return;
    this.compositor.renderFrame(this.getRenderCamera(), this.mainCamera);
  }

  private setVideoPath(path?: string) {
    this.currentVideoTexture = this.backgroundVideo.setPath(path);
    this.compositor?.setBackgroundVideo(this.currentVideoTexture);
  }
}
