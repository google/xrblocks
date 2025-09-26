import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

import {XRDeviceCamera} from '../camera/XRDeviceCamera.js';
import {Registry} from '../core/components/Registry';
import {XREffects} from '../core/components/XREffects';
import {Options} from '../core/Options';
import {Script} from '../core/Script';
import {Depth} from '../depth/Depth';
import {DepthMesh} from '../depth/DepthMesh';
import {Input} from '../input/Input';

import {SimulatorCamera} from './SimulatorCamera';
import {AVERAGE_IPD_METERS, SimulatorRenderMode} from './SimulatorConstants';
import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorControls} from './SimulatorControls';
import {SimulatorDepth} from './SimulatorDepth';
import {SimulatorHands} from './SimulatorHands';
import {SimulatorInterface} from './SimulatorInterface';
import {SimulatorOptions} from './SimulatorOptions';
import {SimulatorScene} from './SimulatorScene';
import {SimulatorUser} from './SimulatorUser';

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
  };

  simulatorScene = new SimulatorScene();
  depth = new SimulatorDepth(this.simulatorScene);
  // Controller poses relative to the camera.
  simulatorControllerState = new SimulatorControllerState();
  hands =
      new SimulatorHands(this.simulatorControllerState, this.simulatorScene);
  simulatorUser = new SimulatorUser();
  userInterface = new SimulatorInterface();
  controls = new SimulatorControls(
      this.simulatorControllerState, this.hands,
      this.setStereoRenderMode.bind(this), this.userInterface);
  renderDepthPass = false;
  renderMode = SimulatorRenderMode.DEFAULT;
  stereoCameras: THREE.Camera[] = [];
  effects?: XREffects;

  // Render target for the virtual scene.
  virtualSceneRenderTarget?: THREE.WebGLRenderTarget;
  virtualSceneFullScreenQuad?: FullScreenQuad;

  camera?: SimulatorCamera;
  options!: SimulatorOptions;
  renderer!: THREE.WebGLRenderer;
  mainCamera!: THREE.Camera;
  mainScene!: THREE.Scene;

  private initialized = false;
  private renderSimulatorSceneToCanvasBound =
      this.renderSimulatorSceneToCanvas.bind(this);

  constructor(
      private renderMainScene: (cameraOverride?: THREE.Camera) => void) {
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
  }: {
    simulatorOptions: SimulatorOptions,
    input: Input,
    timer: THREE.Timer,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    registry: Registry,
    options: Options,
    depth: Depth,
  }) {
    if (this.initialized) return;
    // Get optional dependencies from the registry.
    const deviceCamera = registry.get(XRDeviceCamera);
    const depthMesh = registry.get(DepthMesh);
    this.options = simulatorOptions;
    camera.position.copy(this.options.initialCameraPosition);
    this.userInterface.init(simulatorOptions, this.controls, this.hands);
    renderer.autoClearColor = false;
    await this.simulatorScene.init(simulatorOptions);
    this.hands.init({input});
    this.controls.init({camera, input, timer, renderer, simulatorOptions});
    if (deviceCamera && !this.camera) {
      this.camera = new SimulatorCamera(renderer);
      this.camera.init();
      deviceCamera.registerSimulatorCamera(this.camera);
    }

    if (options.depth.enabled) {
      this.renderDepthPass = true;
      this.depth.init(renderer, camera, depth);
      if (options.depth.depthMesh.enabled && depthMesh) {
        camera.add(depthMesh);
      }
    }
    scene.add(camera);

    if (this.options.stereo.enabled) {
      this.setupStereoCameras(camera);
    }

    this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(
        renderer.domElement.width, renderer.domElement.height,
        {stencilBuffer: options.stencil});
    this.virtualSceneFullScreenQuad =
        new FullScreenQuad(new THREE.MeshBasicMaterial(
            {map: this.virtualSceneRenderTarget.texture, transparent: true}));

    this.renderer = renderer;
    this.mainCamera = camera;
    this.mainScene = scene;
    this.initialized = true;
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
    if (this.camera) {
      this.camera.onBeforeSimulatorSceneRender(
          this.mainCamera, this.renderSimulatorSceneToCanvasBound);
    }
  }

  onSimulatorSceneRendered() {
    if (this.camera) {
      this.camera.onSimulatorSceneRendered();
    }
  }

  getRenderCamera() {
    return {
      [SimulatorRenderMode.DEFAULT]: this.mainCamera,
      [SimulatorRenderMode.STEREO_LEFT]: this.stereoCameras[0],
      [SimulatorRenderMode.STEREO_RIGHT]: this.stereoCameras[1]
    }[this.renderMode];
  }

  // Called by core when the simulator is running.
  renderScene() {
    if (!this.renderer) return;
    if (!this.options.renderToRenderTexture) return;
    // Allocate a new render target if the resolution changes.
    if (this.virtualSceneRenderTarget!.width !=
            this.renderer.domElement.width ||
        this.virtualSceneRenderTarget!.height !=
            this.renderer.domElement.height) {
      const stencilEnabled = !!this.virtualSceneRenderTarget?.stencilBuffer;
      this.virtualSceneRenderTarget!.dispose();
      this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(
          this.renderer.domElement.width, this.renderer.domElement.height,
          {stencilBuffer: stencilEnabled});
      (this.virtualSceneFullScreenQuad!.material as THREE.MeshBasicMaterial)
          .map = this.virtualSceneRenderTarget.texture;
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
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.simulatorScene, camera);
    this.renderer.clearDepth();
  }
}
