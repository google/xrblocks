import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

import {
  BaseSimulatorCompositor,
  type SimulatorCompositorDeps,
} from './BaseSimulatorCompositor';

/**
 * Compositor that renders the main scene to an offscreen WebGLRenderTarget
 * and composites it onto the simulator scene via a fullscreen quad.
 */
export class WebGLRenderTargetCompositor extends BaseSimulatorCompositor {
  virtualSceneRenderTarget: THREE.WebGLRenderTarget;
  virtualSceneFullScreenQuad: FullScreenQuad;
  private readonly stencilBuffer: boolean;

  constructor(deps: SimulatorCompositorDeps) {
    super(deps);
    this.stencilBuffer = deps.stencil;
    this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(
      deps.renderer.domElement.width,
      deps.renderer.domElement.height,
      {stencilBuffer: this.stencilBuffer}
    );

    const virtualSceneMaterial = new THREE.MeshBasicMaterial({
      map: this.virtualSceneRenderTarget.texture,
      transparent: true,
    });

    if (deps.blendingMode === 'screen') {
      virtualSceneMaterial.blending = THREE.CustomBlending;
      virtualSceneMaterial.blendSrc = THREE.OneFactor;
      virtualSceneMaterial.blendDst = THREE.OneMinusSrcColorFactor;
      virtualSceneMaterial.blendEquation = THREE.AddEquation;
    }

    this.virtualSceneFullScreenQuad = new FullScreenQuad(virtualSceneMaterial);
  }

  renderFrame(renderCamera: THREE.Camera, mainCamera: THREE.Camera): void {
    if (
      this.virtualSceneRenderTarget.width !==
        this.deps.renderer.domElement.width ||
      this.virtualSceneRenderTarget.height !==
        this.deps.renderer.domElement.height
    ) {
      this.virtualSceneRenderTarget.dispose();
      this.virtualSceneRenderTarget = new THREE.WebGLRenderTarget(
        this.deps.renderer.domElement.width,
        this.deps.renderer.domElement.height,
        {stencilBuffer: this.stencilBuffer}
      );
      (
        this.virtualSceneFullScreenQuad.material as THREE.MeshBasicMaterial
      ).map = this.virtualSceneRenderTarget.texture;
    }

    this.setSparkEncodeLinear(true);
    this.deps.renderer.setRenderTarget(this.virtualSceneRenderTarget);
    this.deps.renderer.clear();
    this.deps.renderMainScene(renderCamera);
    this.renderSimulatorScenePass(renderCamera, mainCamera);
    this.virtualSceneFullScreenQuad.render(
      this.deps.renderer as THREE.WebGLRenderer
    );
  }

  override dispose(): void {
    (this.virtualSceneFullScreenQuad.material as THREE.Material).dispose();
    this.virtualSceneFullScreenQuad.dispose();
    this.virtualSceneRenderTarget.dispose();
    super.dispose();
  }
}
