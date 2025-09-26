import * as THREE from 'three';
import {XREstimatedLight} from 'three/addons/webxr/XREstimatedLight.js';

import {Depth} from '../depth/Depth.js';

import {LightingOptions} from './LightingOptions.js';

const DEBUGGING = false;

/**
 * Lighting provides XR lighting capabilities within the XR Blocks framework.
 * It uses webXR to propvide estimated lighting that matches the environment
 * and supports casting shadows from the estimated light.
 */
export class Lighting {
  static instance?: Lighting;
  /** WebXR estimated lighting. */
  private xrLight?: XREstimatedLight;
  /** Main Directional light. */
  dirLight = new THREE.DirectionalLight();
  /** Ambient spherical harmonics light. */
  ambientProbe = new THREE.LightProbe();
  /** Ambient RGB light. */
  ambientLight = new THREE.Vector3();
  /** Opacity of cast shadow. */
  private shadowOpacity = 0.0;
  /** Light group to attach to scene. */
  private lightGroup = new THREE.Group();
  /** Lighting options. Set during initialiation.*/
  private options!: LightingOptions;
  /** Depth manager. Used to get depth mesh on which to cast shadow. */
  private depth?: Depth;
  /** Flag to indicate if simulator is running. Controlled by Core. */
  simulatorRunning = false;

  /**
   * Lighting is a lightweight manager based on three.js to simply prototyping
   * with Lighting features within the XR Blocks framework.
   */
  constructor() {
    if (Lighting.instance) {
      return Lighting.instance;
    }
    Lighting.instance = this;
  }

  /**
   * Initializes the lighting module with the given options. Sets up lights and
   * shadows and adds necessary components to the scene.
   * @param lightingOptions - Lighting options.
   * @param renderer - Main renderer.
   * @param scene - Main scene.
   * @param depth - Depth manager.
   */
  init(
      lightingOptions: LightingOptions, renderer: THREE.WebGLRenderer,
      scene: THREE.Scene, depth?: Depth) {
    this.options = lightingOptions;
    this.depth = depth;

    if (this.options.enabled) {
      this.xrLight = new XREstimatedLight(renderer);

      if (this.options.castDirectionalLightShadow) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
      }

      if (this.options.castDirectionalLightShadow) {
        const dirLight = this.dirLight;
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.3;
        dirLight.shadow.camera.far = 50.0;
        const cameraFrustrumRadius = 4.0;
        dirLight.shadow.camera.left = -cameraFrustrumRadius;
        dirLight.shadow.camera.right = cameraFrustrumRadius;
        dirLight.shadow.camera.top = cameraFrustrumRadius;
        dirLight.shadow.camera.bottom = -cameraFrustrumRadius;
        dirLight.shadow.blurSamples = 25;
        dirLight.shadow.radius = 5.0;
        dirLight.shadow.bias = 0.0;

        this.lightGroup.add(dirLight.target);

        if (this.options.debugging || DEBUGGING) {
          scene.add(new THREE.CameraHelper(dirLight.shadow.camera));
        }
      }

      if (this.options.useAmbientSH) {
        this.lightGroup.add(this.ambientProbe);
      }
      if (this.options.useDirectionalLight) {
        this.lightGroup.add(this.dirLight);
      }
      scene.add(this.lightGroup);

      this.xrLight.addEventListener('estimationend', () => {
        scene.remove(this.xrLight!);
      });
    }
  }

  /**
   * Updates the lighting and shadow setup used to render. Called every frame
   * in the render loop.
   */
  update() {
    // Update lights from WebXR estimated light.
    if (this.options.enabled) {
      this.dirLight.position.copy(this.xrLight!.directionalLight.position)
          .multiplyScalar(20.0);
      this.dirLight.target.position.setScalar(0.0);
      this.dirLight.color = this.xrLight!.directionalLight.color;
      this.dirLight.intensity = this.xrLight!.directionalLight.intensity;
      this.ambientProbe.sh.copy(this.xrLight!.lightProbe.sh);
      this.ambientProbe.intensity = this.xrLight!.lightProbe.intensity;
      this.ambientLight.copy(this.xrLight!.lightProbe.sh.coefficients[0]);

      // Replace lights with harcoded default if using simulator.
      if (this.simulatorRunning) {
        this.dirLight.position.set(-10.0, 10.0, -2.0);
        this.dirLight.target.position.set(0.0, 0.0, -0.5);
        this.dirLight.color.setHex(0xffffff);
        this.dirLight.intensity = 3.8;
        this.ambientProbe.sh.fromArray([
          0.22636516392230988,  0.2994415760040283,    0.2827182114124298,
          0.03430574759840965,  0.029604531824588776,  -0.002050594426691532,
          0.016114741563796997, 0.004344218410551548,  0.07621686905622482,
          0.024204734712839127, -0.02397896535694599,  -0.07645703107118607,
          0.15790101885795593,  0.16706973314285278,   0.18418270349502563,
          -0.13088643550872803, -0.1461198776960373,   -0.1411236822605133,
          0.04788218438625336,  0.08909443765878677,   0.10185115039348602,
          0.020251473411917686, -0.002100071171298623, -0.06455840915441513,
          -0.12393051385879517, -0.05158703774213791,  -0.00532124936580658
        ]);
        this.ambientProbe.intensity = 1.0;
        this.ambientLight.copy(this.ambientProbe.sh.coefficients[0]);
      }

      if (this.options.castDirectionalLightShadow &&
          this.options.useDynamicSoftShadow) {
        const ambientLightIntensity = this.ambientLight;
        const ambientMonoIntensity = 0.21 * ambientLightIntensity.x +
            0.72 * ambientLightIntensity.y + 0.07 * ambientLightIntensity.z;
        const mainLightIntensity =
            new THREE
                .Vector3(
                    this.dirLight.color.r, this.dirLight.color.g,
                    this.dirLight.color.b)
                .multiplyScalar(this.dirLight.intensity);
        const mainMonoIntensity = 0.21 * mainLightIntensity.x +
            0.72 * mainLightIntensity.y + 0.07 * mainLightIntensity.z;
        const ambientToMain = ambientMonoIntensity / mainMonoIntensity;
        this.dirLight.shadow.radius =
            Math.min(Math.max(1.0, ambientToMain * 30), 10.0);
        this.shadowOpacity =
            Math.max(Math.min((10.0 - ambientToMain * 30) * 0.7, 0.7), 0.3);

        // Override depth material opacity with shadowOpacity
        if (this.depth?.options?.enabled &&
            this.depth.options.depthMesh.enabled &&
            this.depth.depthMesh?.material instanceof THREE.ShadowMaterial) {
          this.depth.depthMesh.material.opacity = this.shadowOpacity;
        }
      }
    }

    if (this.options.debugging || DEBUGGING) {
      this.debugLog();
    }
  }

  /**
   * Logs current estimate light parameters for debugging.
   */
  debugLog() {
    console.log('Lighting.dirLight', this.dirLight);
    console.log('Lighting.ambientProbe', this.ambientProbe);
    console.log('Lighting.ambientLight', this.ambientLight);
  }
};
