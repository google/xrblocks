import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

export interface ViewportSize {
  width: number;
  height: number;
}

interface RendererState {
  activeCubeFace: number;
  activeMipmapLevel: number;
  autoClear: boolean;
  clearAlpha: number;
  renderTarget: THREE.WebGLRenderTarget | null;
  scissor: THREE.Vector4;
  scissorTest: boolean;
  viewport: THREE.Vector4;
  xrPresenting: boolean;
}

/** Renders screen overlays offscreen, then blends them over the world. */
export class UIOverlayCompositor {
  private readonly sourceScene = new THREE.Scene();
  private readonly sourceCamera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0.01,
    10
  );
  private readonly displayMaterial = new THREE.ShaderMaterial({
    name: 'XR Blocks screen overlay composite',
    uniforms: {overlayTexture: {value: null}},
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D overlayTexture;
      varying vec2 vUv;

      void main() {
        gl_FragColor = texture2D(overlayTexture, vUv);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
    blendEquation: THREE.AddEquation,
  });
  private readonly displayQuad = new FullScreenQuad(this.displayMaterial);
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly savedClearColor = new THREE.Color();
  private readonly viewTargets: THREE.WebGLRenderTarget[] = [];
  private captureTarget?: THREE.WebGLRenderTarget;

  constructor() {
    this.sourceScene.name = 'XR Blocks screen overlay source';
    this.sourceCamera.position.set(0, 0, 1);
  }

  add(source: THREE.Object3D): void {
    this.sourceScene.add(source);
  }

  render(
    renderer: THREE.WebGLRenderer,
    viewport: ViewportSize,
    layout: (viewport: ViewportSize) => void,
    capture = false
  ): void {
    if (!this.hasVisibleSource()) return;

    const state = this.captureRendererState(renderer);
    const views = this.getViewports(renderer, state.renderTarget);
    const pixelRatio = renderer.getPixelRatio();
    try {
      renderer.xr.isPresenting = false;
      renderer.autoClear = false;
      for (let index = 0; index < views.length; index++) {
        const view = views[index];
        const logicalHeight = Math.max(1, viewport.height);
        const logicalViewport = {
          width: logicalHeight * (view.z / view.w),
          height: logicalHeight,
        };
        layout(logicalViewport);
        const target = this.ensureRenderTarget(view.z, view.w, index, capture);
        this.updateSourceCamera(logicalViewport);
        renderer.setRenderTarget(target);
        renderer.setScissorTest(false);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
        renderer.render(this.sourceScene, this.sourceCamera);

        renderer.setRenderTarget(
          state.renderTarget,
          state.activeCubeFace,
          state.activeMipmapLevel
        );
        // XR viewports use physical pixels; renderer setters use logical pixels.
        const logicalRect = view.clone().divideScalar(pixelRatio);
        renderer.setViewport(logicalRect);
        renderer.setScissor(logicalRect);
        renderer.setScissorTest(true);
        this.displayMaterial.uniforms.overlayTexture.value = target.texture;
        this.displayQuad.render(renderer);
      }
    } finally {
      this.restoreRendererState(renderer, state);
    }
  }

  dispose(): void {
    for (const target of this.viewTargets) target.dispose();
    this.viewTargets.length = 0;
    this.captureTarget?.dispose();
    this.captureTarget = undefined;
    this.displayQuad.dispose();
    this.displayMaterial.dispose();
    this.sourceScene.clear();
  }

  private captureRendererState(renderer: THREE.WebGLRenderer): RendererState {
    renderer.getClearColor(this.savedClearColor);
    return {
      activeCubeFace: renderer.getActiveCubeFace(),
      activeMipmapLevel: renderer.getActiveMipmapLevel(),
      autoClear: renderer.autoClear,
      clearAlpha: renderer.getClearAlpha(),
      renderTarget: renderer.getRenderTarget(),
      scissor: renderer.getScissor(new THREE.Vector4()),
      scissorTest: renderer.getScissorTest(),
      viewport: renderer.getViewport(new THREE.Vector4()),
      xrPresenting: renderer.xr.isPresenting,
    };
  }

  private restoreRendererState(
    renderer: THREE.WebGLRenderer,
    state: RendererState
  ): void {
    renderer.xr.isPresenting = state.xrPresenting;
    renderer.autoClear = state.autoClear;
    renderer.setRenderTarget(
      state.renderTarget,
      state.activeCubeFace,
      state.activeMipmapLevel
    );
    renderer.setViewport(state.viewport);
    renderer.setScissor(state.scissor);
    renderer.setScissorTest(state.scissorTest);
    renderer.setClearColor(this.savedClearColor, state.clearAlpha);
  }

  private getViewports(
    renderer: THREE.WebGLRenderer,
    currentTarget: THREE.WebGLRenderTarget | null
  ): THREE.Vector4[] {
    if (renderer.xr.isPresenting) {
      const cameras = renderer.xr.getCamera()?.cameras ?? [];
      const views = cameras.map((camera) => camera.viewport);
      if (
        views.length > 0 &&
        views.every((view) => view && view.z > 0 && view.w > 0)
      ) {
        return views.map((view) => view!.clone());
      }
    }
    if (currentTarget) return [currentTarget.viewport.clone()];
    const size = renderer.getDrawingBufferSize(this.drawingBufferSize);
    return [new THREE.Vector4(0, 0, Math.max(1, size.x), Math.max(1, size.y))];
  }

  private ensureRenderTarget(
    width: number,
    height: number,
    viewIndex: number,
    capture: boolean
  ): THREE.WebGLRenderTarget {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    let target = capture ? this.captureTarget : this.viewTargets[viewIndex];
    if (!target) {
      target = new THREE.WebGLRenderTarget(width, height, {
        colorSpace: THREE.LinearSRGBColorSpace,
        depthBuffer: false,
        stencilBuffer: false,
      });
      target.texture.name = 'XR Blocks screen overlay texture';
      if (capture) this.captureTarget = target;
      else this.viewTargets[viewIndex] = target;
    } else if (target.width !== width || target.height !== height) {
      target.setSize(width, height);
    }
    return target;
  }

  private updateSourceCamera(viewport: ViewportSize): void {
    const halfWidth = viewport.width * 0.0005;
    const halfHeight = viewport.height * 0.0005;
    this.sourceCamera.left = -halfWidth;
    this.sourceCamera.right = halfWidth;
    this.sourceCamera.top = halfHeight;
    this.sourceCamera.bottom = -halfHeight;
    this.sourceCamera.updateProjectionMatrix();
  }

  private hasVisibleSource(): boolean {
    return this.sourceScene.children.some((source) => source.visible);
  }
}
