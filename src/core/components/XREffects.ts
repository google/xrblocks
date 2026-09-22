import * as THREE from 'three';
import {Pass} from 'three/addons/postprocessing/Pass.js';

import {
  assertWebGLRenderer,
  type WebGLOrWebGPURenderer,
} from '../RendererTypes';

export class XRPass extends Pass {
  render(
    _renderer: WebGLOrWebGPURenderer,
    _writeBuffer: THREE.RenderTarget,
    _readBuffer: THREE.RenderTarget,
    _deltaTime: number,
    _maskActive: boolean,
    _viewId: number = 0
  ) {}
}

/**
 * XREffects manages the XR rendering pipeline.
 * Use core.effects
 * It handles multiple passes and render targets for applying effects to XR
 * scenes.
 */
export class XREffects {
  passes: XRPass[] = [];
  renderTargets: THREE.RenderTarget[] = [];
  dimensions = new THREE.Vector2();

  constructor(
    private renderer: WebGLOrWebGPURenderer,
    private scene: THREE.Scene,
    private timer: THREE.Timer
  ) {}

  private setRenderTarget(target: THREE.RenderTarget | null) {
    this.renderer.setRenderTarget(target as THREE.WebGLRenderTarget | null);
  }

  /**
   * Adds a pass to the effect pipeline.
   */
  addPass(pass: XRPass) {
    pass.renderToScreen = false;
    this.passes.push(pass);
  }

  /**
   * Sets up render targets for the effect pipeline.
   */
  setupRenderTargets(dimensions: THREE.Vector2) {
    const defaultTarget = this.renderer.getRenderTarget();
    if (defaultTarget == null) {
      return;
    }
    const neededRenderTargets = this.renderer.xr.isPresenting ? 4 : 2;
    for (let i = 0; i < neededRenderTargets; i++) {
      if (
        i >= this.renderTargets.length ||
        this.renderTargets[i].width != dimensions.x ||
        this.renderTargets[i].height != dimensions.y
      ) {
        this.renderTargets[i]?.depthTexture?.dispose();
        this.renderTargets[i]?.dispose();
        this.renderTargets[i] = defaultTarget.clone();
        const hasStencil = this.renderTargets[i].stencilBuffer;
        this.renderTargets[i].depthTexture = new THREE.DepthTexture(
          dimensions.x,
          dimensions.y,
          hasStencil ? THREE.UnsignedInt248Type : THREE.UnsignedIntType,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          hasStencil ? THREE.DepthStencilFormat : THREE.DepthFormat
        );
      }
    }
    for (let i = neededRenderTargets; i < this.renderTargets.length; i++) {
      this.renderTargets[i].depthTexture?.dispose();
      this.renderTargets[i].dispose();
    }
  }

  /**
   * Renders the XR effects.
   */
  render(camera: THREE.Camera) {
    this.renderer.getDrawingBufferSize(this.dimensions);
    this.setupRenderTargets(this.dimensions);
    this.renderer.xr.cameraAutoUpdate = false;
    const defaultTarget = this.renderer.getRenderTarget();
    if (!defaultTarget) {
      return;
    }
    if (this.renderer.xr.isPresenting) {
      this.renderXr();
    } else {
      this.renderSimulator(camera);
    }
  }

  private renderXr() {
    assertWebGLRenderer(this.renderer, 'XREffects.renderXr');
    const defaultTarget = this.renderer.getRenderTarget()!;
    const renderer = this.renderer;
    const xrEnabled = renderer.xr.enabled;
    const xrIsPresenting = renderer.xr.isPresenting;
    const prevAutoClearColor = renderer.autoClearColor;
    const renderTargets = this.renderTargets;
    renderer.xr.cameraAutoUpdate = false;
    renderer.xr.enabled = false;
    const deltaTime = this.timer.getDelta();
    const numCameras = renderer.xr.getCamera().cameras.length;
    if (numCameras > 0) {
      const prevMatrixWorldAutoUpdate = this.scene.matrixWorldAutoUpdate;
      if (prevMatrixWorldAutoUpdate) {
        this.scene.updateMatrixWorld();
      }
      this.scene.matrixWorldAutoUpdate = false;
      try {
        for (let camIndex = 0; camIndex < numCameras; ++camIndex) {
          const cam = renderer.xr.getCamera().cameras[camIndex];
          renderer.setViewport(cam.viewport);
          this.setRenderTarget(renderTargets[camIndex]);
          renderer.clear();
          renderer.xr.isPresenting = true;
          renderer.render(this.scene, cam);
        }
      } finally {
        this.scene.matrixWorldAutoUpdate = prevMatrixWorldAutoUpdate;
      }
      this.setRenderTarget(defaultTarget);
      renderer.clear();
      renderer.xr.isPresenting = false;
      renderer.autoClearColor = false;
      for (let eye = 0; eye < numCameras; eye++) {
        for (let i = 0; i < this.passes.length - 1; ++i) {
          const lastRenderTargetIndex = i % 2;
          const nextRenderTargetIndex = (i + 1) % 2;
          defaultTarget.viewport.set(
            (eye * this.dimensions.x) / numCameras,
            0,
            this.dimensions.x / numCameras,
            this.dimensions.y
          );
          this.passes[i].render(
            renderer,
            this.renderTargets[2 * nextRenderTargetIndex + eye],
            this.renderTargets[2 * lastRenderTargetIndex + eye],
            deltaTime,
            /*maskActive=*/ false,
            /*viewId=*/ eye
          );
        }
        if (this.passes.length > 0) {
          const lastRenderTargetIndex = (this.passes.length - 1) % 2;
          defaultTarget.viewport.set(
            (eye * this.dimensions.x) / numCameras,
            0,
            this.dimensions.x / numCameras,
            this.dimensions.y
          );
          this.passes[this.passes.length - 1].render(
            renderer,
            defaultTarget,
            this.renderTargets[2 * lastRenderTargetIndex + eye],
            deltaTime,
            /*maskActive=*/ false,
            /*viewId=*/ eye
          );
        }
      }
      renderer.autoClearColor = prevAutoClearColor;
      renderer.xr.enabled = xrEnabled;
      renderer.xr.isPresenting = xrIsPresenting;
    }
  }

  private renderSimulator(camera: THREE.Camera) {
    const defaultTarget = this.renderer.getRenderTarget()!;
    const renderer = this.renderer;
    const xrEnabled = renderer.xr.enabled;
    const prevAutoClearColor = renderer.autoClearColor;
    renderer.xr.cameraAutoUpdate = false;
    renderer.xr.enabled = false;
    const deltaTime = this.timer.getDelta();
    if (this.passes.length === 0) {
      this.setRenderTarget(defaultTarget);
      renderer.render(this.scene, camera);
      renderer.xr.enabled = xrEnabled;
      return;
    }
    this.setRenderTarget(this.renderTargets[0]);
    renderer.clear();
    renderer.render(this.scene, camera);
    this.setRenderTarget(defaultTarget);
    renderer.clear();
    renderer.autoClearColor = false;
    for (let i = 0; i < this.passes.length - 1; ++i) {
      const lastRenderTargetIndex = i % 2;
      const nextRenderTargetIndex = (i + 1) % 2;
      this.passes[i].render(
        renderer,
        this.renderTargets[nextRenderTargetIndex],
        this.renderTargets[lastRenderTargetIndex],
        deltaTime,
        /*maskActive=*/ false,
        /*viewId=*/ 0
      );
    }
    if (this.passes.length > 0) {
      const lastRenderTargetIndex = (this.passes.length - 1) % 2;
      this.passes[this.passes.length - 1].render(
        renderer,
        defaultTarget,
        this.renderTargets[lastRenderTargetIndex],
        deltaTime,
        /*maskActive=*/ false,
        /*viewId=*/ 0
      );
    }
    renderer.autoClearColor = prevAutoClearColor;
    renderer.xr.enabled = xrEnabled;
  }

  dispose() {
    let firstError: unknown;
    for (const target of this.renderTargets) {
      for (const dispose of [
        () => target.depthTexture?.dispose(),
        () => target.dispose(),
      ]) {
        try {
          dispose();
        } catch (error: unknown) {
          firstError ??= error;
        }
      }
    }
    this.renderTargets.length = 0;
    for (const pass of this.passes) {
      try {
        pass.dispose();
      } catch (error: unknown) {
        firstError ??= error;
      }
    }
    this.passes.length = 0;
    if (firstError !== undefined) throw firstError;
  }
}
