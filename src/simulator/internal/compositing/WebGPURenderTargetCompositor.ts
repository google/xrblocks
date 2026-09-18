import * as THREE from 'three';
import {
  MeshBasicNodeMaterial,
  QuadMesh,
  type WebGPURenderer,
} from 'three/webgpu';

import {
  BaseSimulatorCompositor,
  type SimulatorCompositorDeps,
} from './BaseSimulatorCompositor';
import {createWebGPUBackgroundVideoQuad} from './WebGPUDirectCompositor';

/**
 * Compositor that renders the main scene to an offscreen THREE.RenderTarget
 * and composites it onto the simulator scene via a fullscreen QuadMesh using
 * MeshBasicNodeMaterial. Compatible with both native WebGPU and WebGL2 fallback backends.
 */
export class WebGPURenderTargetCompositor extends BaseSimulatorCompositor {
  virtualSceneRenderTarget: THREE.RenderTarget;
  virtualSceneFullScreenQuad: QuadMesh;
  private readonly stencilBuffer: boolean;

  constructor(deps: SimulatorCompositorDeps) {
    super(deps);
    this.stencilBuffer = deps.stencil;
    this.virtualSceneRenderTarget = new THREE.RenderTarget(
      deps.renderer.domElement.width,
      deps.renderer.domElement.height,
      {stencilBuffer: this.stencilBuffer}
    );

    const virtualSceneMaterial = new MeshBasicNodeMaterial({
      map: this.virtualSceneRenderTarget.texture,
      transparent: true,
    });
    virtualSceneMaterial.lights = false;

    if (deps.blendingMode === 'screen') {
      virtualSceneMaterial.blending = THREE.CustomBlending;
      virtualSceneMaterial.blendSrc = THREE.OneFactor;
      virtualSceneMaterial.blendDst = THREE.OneMinusSrcColorFactor;
      virtualSceneMaterial.blendEquation = THREE.AddEquation;
    }

    this.virtualSceneFullScreenQuad = new QuadMesh(virtualSceneMaterial);
  }

  protected override createBackgroundVideoQuad(
    videoTexture: THREE.Texture
  ): QuadMesh {
    return createWebGPUBackgroundVideoQuad(videoTexture);
  }

  protected override clearBeforeSimulatorScene(): void {
    if (this.backgroundVideoQuad) {
      this.deps.renderer.clearDepth();
    } else {
      this.deps.renderer.clear();
    }
  }

  renderFrame(renderCamera: THREE.Camera, mainCamera: THREE.Camera): void {
    if (
      this.virtualSceneRenderTarget.width !==
        this.deps.renderer.domElement.width ||
      this.virtualSceneRenderTarget.height !==
        this.deps.renderer.domElement.height
    ) {
      this.virtualSceneRenderTarget.dispose();
      this.virtualSceneRenderTarget = new THREE.RenderTarget(
        this.deps.renderer.domElement.width,
        this.deps.renderer.domElement.height,
        {stencilBuffer: this.stencilBuffer}
      );
      (this.virtualSceneFullScreenQuad.material as MeshBasicNodeMaterial).map =
        this.virtualSceneRenderTarget.texture;
    }

    const renderer = this.deps.renderer as WebGPURenderer;
    this.setSparkEncodeLinear(true);
    renderer.setRenderTarget(this.virtualSceneRenderTarget);
    renderer.clear();
    this.deps.renderMainScene(renderCamera);
    this.renderSimulatorScenePass(renderCamera, mainCamera);
    this.virtualSceneFullScreenQuad.render(renderer);
  }

  override dispose(): void {
    (this.virtualSceneFullScreenQuad.material as THREE.Material).dispose();
    this.virtualSceneRenderTarget.dispose();
    super.dispose();
  }
}
