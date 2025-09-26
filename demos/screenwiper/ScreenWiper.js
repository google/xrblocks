import * as THREE from 'three';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';

import {AlphaShader} from './alphashader.js';
import {ClearShader} from './clearshader.js';
import {ScreenWiperShader} from './screenwipershader.js';

const raycaster = new THREE.Raycaster();

const clearpass = new ShaderPass(ClearShader);
clearpass.renderToScreen = false;

export class ScreenWiper extends THREE.Mesh {
  activeControllers = []

  constructor() {
    const NATIVE_RESOLUTION = 1024;
    const RESOLUTION_MULTIPLIER = 4;
    const RESOLUTION = NATIVE_RESOLUTION * RESOLUTION_MULTIPLIER;
    const renderTargetA = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION);
    const renderTargetB = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION);

    const geometry = new THREE.SphereGeometry(15, 32, 16);
    const material = new THREE.ShaderMaterial({
      name: 'ScreenWiperShader',
      defines: Object.assign({}, ScreenWiperShader.defines),
      uniforms: THREE.UniformsUtils.clone(ScreenWiperShader.uniforms),
      vertexShader: ScreenWiperShader.vertexShader,
      fragmentShader: ScreenWiperShader.fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
    });
    super(geometry, material);
    this.renderTargetA = renderTargetA;
    this.renderTargetB = renderTargetB;

    this.shaderpass = new ShaderPass(AlphaShader);
    this.controllerActiveUniforms = [
      this.shaderpass.material.uniforms.uLeftWiperActive,
      this.shaderpass.material.uniforms.uRightWiperActive
    ];
    this.controllerCartesianCoordinateUniforms = [
      this.shaderpass.material.uniforms.uLeftHandCartesianCoordinate,
      this.shaderpass.material.uniforms.uRightHandCartesianCoordinate
    ];
    this.worldPosition = new THREE.Vector3();
    this.starttime = Date.now();
  }

  clear(renderer) {
    // Remember renderer state.
    const xrEnabled = renderer.xr.enabled;
    const xrTarget = renderer.getRenderTarget();

    // Render to offscreen buffer.
    renderer.xr.enabled = false;
    clearpass.render(renderer, this.renderTargetA, null);
    clearpass.render(renderer, this.renderTargetB, null);
    this.material.uniforms.uMask.value = this.renderTargetB.texture;

    // Reset renderer state
    renderer.xr.enabled = xrEnabled;
    renderer.setRenderTarget(xrTarget);
  }

  update(renderer) {
    const camera = renderer.xr.getCamera().cameras[0];
    if (camera != null) {
      // Make this headtracked
      this.position.copy(camera.position);
    }

    this.getWorldPosition(this.worldPosition);
    for (let i = 0; i < 2; i++) {
      if (i < this.activeControllers.length) {
        this.controllerActiveUniforms[i].value = true;
        const controller = this.activeControllers[i];
        raycaster.setFromXRController(controller);
        const intersects = raycaster.intersectObject(this);
        if (intersects.length > 0) {
          this.controllerCartesianCoordinateUniforms[i]
              .value.copy(intersects[0].point)
              .sub(this.worldPosition)
              .normalize();
        }
      } else {
        this.controllerActiveUniforms[i].value = false;
      }
    }

    const elapsedTime = (Date.now() - this.starttime) / 1000;
    if (this.material.uniforms.uTime) {
      this.material.uniforms.uTime.value.set(
          elapsedTime / 20, elapsedTime, elapsedTime * 2, elapsedTime * 3);
    }

    // Remember renderer state.
    const xrEnabled = renderer.xr.enabled;
    const xrTarget = renderer.getRenderTarget();

    // Render to offscreen buffer.
    renderer.xr.enabled = false;
    [this.renderTargetA, this.renderTargetB] =
        [this.renderTargetB, this.renderTargetA];
    this.shaderpass.renderToScreen = false;
    this.shaderpass.render(renderer, this.renderTargetB, this.renderTargetA);
    this.material.uniforms.uMask.value = this.renderTargetB.texture;

    // Reset renderer state
    renderer.xr.enabled = xrEnabled;
    renderer.setRenderTarget(xrTarget);
  }

  addActiveController(controller) {
    this.activeControllers.push(controller);
  }

  removeActiveController(controller) {
    const index = this.activeControllers.indexOf(controller);
    if (index != -1) {
      this.activeControllers.splice(index, 1);
    }
  }

  dispose() {
    this.renderTargetA.dispose();
    this.renderTargetB.dispose();
    this.shaderpass.dispose();
    this.material.dispose();
  }

  startTransition(passthrough) {
    this.shaderpass.material.uniforms.uReturnSpeed.value =
        passthrough ? -0.005 : 0.005;
  }
}
