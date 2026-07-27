import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import type {SparkRenderer} from '@sparkjsdev/spark';

import {XRDeviceCamera} from '../camera/XRDeviceCamera.js';
import {Registry} from '../core/components/Registry';
import {XREffects} from '../core/components/XREffects';
import {Options} from '../core/Options';
import {Script} from '../core/Script';
import {Depth} from '../depth/Depth';
import {Input} from '../input/Input';
import {Physics} from '../physics/Physics';

import {SimulatorCamera} from './SimulatorCamera';
import {AVERAGE_IPD_METERS, SimulatorRenderMode} from './SimulatorConstants';
import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorControls} from './SimulatorControls';
import {SimulatorDepth} from './scene/SimulatorDepth';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorNavMesh} from './scene/SimulatorNavMesh';
import {SimulatorOptions} from './SimulatorOptions';
import type {SimulatorEnvironment} from './SimulatorOptions';
import {SimulatorScene} from './scene/SimulatorScene';
import {SimulatorUser} from './SimulatorUser';
import {SimulatorEnvironmentManager} from './scene/SimulatorEnvironmentManager';
import {SimulatorObjectDetectionSource} from '../world/objects/SimulatorObjectDetectionSource';
import {
  type SimulatorObjects,
  SimulatorObjectsManager,
} from './scene/SimulatorObjects';
import {SimulatorPhysics} from './scene/SimulatorPhysics';
import {SimulatorWorld} from './scene/SimulatorWorld';
import {SparkRendererHolder} from '../utils/SparkRendererHolder';
import {World} from '../world/World';

export class Simulator extends Script {
  static dependencies = {
    simulatorOptions: SimulatorOptions,
    input: Input,
    timer: THREE.Timer,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    registry: Registry,
    options: Options,
    depth: Depth,
    world: World,
  };
  editorIcon = 'simulation';
  simulatorScene = new SimulatorScene();
  simulatorWorld = new SimulatorWorld();
  navMesh = new SimulatorNavMesh();
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
  effects?: XREffects;

  // Render target for the virtual scene.
  virtualSceneRenderTarget?: THREE.WebGLRenderTarget;
  virtualSceneFullScreenQuad?: FullScreenQuad;
  backgroundVideoQuad?: FullScreenQuad;
  videoElement?: HTMLVideoElement;

  simulatorCamera?: SimulatorCamera;
  options!: SimulatorOptions;
  renderer!: THREE.WebGLRenderer;
  mainCamera!: THREE.Camera;
  mainScene!: THREE.Scene;

  private initialized = false;
  private renderSimulatorSceneToCanvasBound =
    this.renderSimulatorSceneToCanvas.bind(this);
  private sparkRenderer?: SparkRenderer;
  private registry?: Registry;
  private world?: World;
  private objectDetectionSource?: SimulatorObjectDetectionSource;
  private useSimulatorObjectDetection = false;

  constructor(
    private renderMainScene: (cameraOverride?: THREE.Camera) => void
  ) {
    super();
    this.add(this.simulatorUser);
  }

  async init({
    simulatorOptions,
    input,
    timer,
    camera,
    renderer,
    scene,
    registry,
    options,
    depth,
    world,
  }: {
    simulatorOptions: SimulatorOptions;
    input: Input;
    timer: THREE.Timer;
    camera: THREE.Camera;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    registry: Registry;
    options: Options;
    depth: Depth;
    world: World;
  }) {
    if (this.initialized) return;
    // Get optional dependencies from the registry.
    const deviceCamera = registry.get(XRDeviceCamera);
    const physics = registry.get(Physics);
    this.simulatorPhysics =
      physics && simulatorOptions.physics.enabled
        ? new SimulatorPhysics(physics, simulatorOptions.handPhysics)
        : undefined;
    this.options = simulatorOptions;
    this.renderer = renderer;
    this.mainCamera = camera;
    this.mainScene = scene;
    this.registry = registry;
    this.world = world;
    this.simulatorScene.add(this.navMesh.debugVisualization);
    this.navMesh.showDebugVisualizations(
      this.options.navMesh.showDebugVisualizations
    );
    camera.position.copy(this.options.initialCameraPosition);
    renderer.autoClearColor = false;
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
    this.userInterface.init(
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
    this.controls.init({camera, input, timer, renderer, simulatorOptions});
    if (
      deviceCamera &&
      !this.simulatorCamera &&
      this.options.deviceCamera.enabled
    ) {
      this.simulatorCamera = new SimulatorCamera(renderer);
      this.simulatorCamera.init();
      deviceCamera.registerSimulatorCamera(this.simulatorCamera);
    }
    deviceCamera?.init();

    if (options.depth.enabled) {
      this.renderDepthPass = true;
      this.depth.init(renderer, camera, depth);
    }
    scene.add(camera);

    if (this.options.stereo.enabled) {
      this.setupStereoCameras(camera);
    }

    this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(
      renderer.domElement.width,
      renderer.domElement.height,
      {stencilBuffer: options.stencil}
    );
    const virtualSceneMaterial = new THREE.MeshBasicMaterial({
      map: this.virtualSceneRenderTarget.texture,
      transparent: true,
    });
    if (this.options.blendingMode === 'screen') {
      virtualSceneMaterial.blending = THREE.CustomBlending;
      virtualSceneMaterial.blendSrc = THREE.OneFactor;
      virtualSceneMaterial.blendDst = THREE.OneMinusSrcColorFactor;
      virtualSceneMaterial.blendEquation = THREE.AddEquation;
    }
    this.virtualSceneFullScreenQuad = new FullScreenQuad(virtualSceneMaterial);

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
    this.world?.objects?.setSimulatorSource(undefined);
    this.environment?.dispose();
    this.environment = undefined;
    this.simulatorPhysics?.dispose();
    this.simulatorPhysics = undefined;
    this.setVideoPath(undefined);
    this.virtualSceneFullScreenQuad?.material?.dispose();
    this.virtualSceneFullScreenQuad?.dispose();
    this.virtualSceneFullScreenQuad = undefined;
    this.virtualSceneRenderTarget?.dispose();
    this.virtualSceneRenderTarget = undefined;
    this.initialized = false;
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

  onBeforeSimulatorSceneRender() {
    this.simulatorCamera?.onBeforeSimulatorSceneRender(
      this.mainCamera,
      this.renderSimulatorSceneToCanvasBound
    );
  }

  onSimulatorSceneRendered() {
    this.simulatorCamera?.onSimulatorSceneRendered();
  }

  getRenderCamera() {
    return {
      [SimulatorRenderMode.DEFAULT]: this.mainCamera,
      [SimulatorRenderMode.STEREO_LEFT]: this.stereoCameras[0],
      [SimulatorRenderMode.STEREO_RIGHT]: this.stereoCameras[1],
    }[this.renderMode];
  }

  // Called by core when the simulator is running.
  renderScene() {
    if (!this.renderer) return;
    if (!this.options.renderToRenderTexture) return;
    // Allocate a new render target if the resolution changes.
    if (
      this.virtualSceneRenderTarget!.width != this.renderer.domElement.width ||
      this.virtualSceneRenderTarget!.height != this.renderer.domElement.height
    ) {
      const stencilEnabled = !!this.virtualSceneRenderTarget?.stencilBuffer;
      this.virtualSceneRenderTarget!.dispose();
      this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(
        this.renderer.domElement.width,
        this.renderer.domElement.height,
        {stencilBuffer: stencilEnabled}
      );
      (
        this.virtualSceneFullScreenQuad!.material as THREE.MeshBasicMaterial
      ).map = this.virtualSceneRenderTarget.texture;
    }
    this.sparkRenderer =
      this.sparkRenderer || this.registry!.get(SparkRendererHolder)?.renderer;
    if (this.sparkRenderer) {
      this.sparkRenderer.encodeLinear = true;
    }
    this.renderer.setRenderTarget(this.virtualSceneRenderTarget!);
    this.renderer.clear();
    this.renderMainScene(this.getRenderCamera());
  }

  // Renders the simulator scene onto the main canvas.
  // Then composites the virtual render with the simulator render.
  // Called by core after renderScene.
  renderSimulatorScene() {
    this.onBeforeSimulatorSceneRender();
    this.renderSimulatorSceneToCanvas(this.getRenderCamera());
    this.onSimulatorSceneRendered();
    if (this.options.renderToRenderTexture) {
      this.virtualSceneFullScreenQuad!.render(this.renderer);
    } else {
      // Temporary workaround since splats look faded when rendered to a render
      // texture.
      this.renderMainScene(this.getRenderCamera());
    }
  }

  private renderSimulatorSceneToCanvas(camera: THREE.Camera) {
    if (this.sparkRenderer) {
      this.sparkRenderer.encodeLinear = false;
    }
    this.renderer.setRenderTarget(null);
    if (this.backgroundVideoQuad) {
      this.backgroundVideoQuad.render(this.renderer);
    }
    this.renderer.render(this.simulatorScene, camera);
    this.renderer.clearDepth();
  }

  private setVideoPath(path?: string) {
    this.videoElement?.pause();
    this.videoElement?.removeAttribute('src');
    this.videoElement?.load();
    this.videoElement = undefined;
    if (this.backgroundVideoQuad) {
      const material = this.backgroundVideoQuad
        .material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      this.backgroundVideoQuad.dispose();
    }
    this.backgroundVideoQuad = undefined;
    if (!path) return;

    const video = document.createElement('video');
    video.src = path;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.play().catch((error) => {
      console.error(`Simulator: Failed to play video at ${path}`, error);
    });
    video.addEventListener('error', () => {
      console.error(`Simulator: Error loading video at ${path}`, video.error);
    });
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.videoElement = video;
    this.backgroundVideoQuad = new FullScreenQuad(
      new THREE.MeshBasicMaterial({map: texture})
    );
  }
}
