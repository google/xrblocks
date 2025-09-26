import * as THREE from 'three';
import {Pass} from 'three/addons/postprocessing/Pass.js';

export class XRPass extends Pass {
  render(
      _renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget,
      _readBuffer: THREE.WebGLRenderTarget, _deltaTime: number,
      _maskActive: boolean, _viewId: number = 0) {}
}

/**
 * XREffects manages the XR rendering pipeline.
 * Use core.effects
 * It handles multiple passes and render targets for applying effects to XR
 * scenes.
 */
export class XREffects {
  passes: XRPass[] = [];
  renderTargets: THREE.WebGLRenderTarget[] = [];
  dimensions = new THREE.Vector2();

  constructor(
      private renderer: THREE.WebGLRenderer, private scene: THREE.Scene,
      private timer: THREE.Timer) {};

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
      if (i >= this.renderTargets.length ||
          this.renderTargets[i].width != dimensions.x ||
          this.renderTargets[i].height != dimensions.y) {
        this.renderTargets[i]?.depthTexture?.dispose();
        this.renderTargets[i]?.dispose();
        this.renderTargets[i] = defaultTarget.clone();
        this.renderTargets[i].depthTexture =
            new THREE.DepthTexture(dimensions.x, dimensions.y);
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
  render() {
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
      this.renderSimulator();
    }
  }

  private renderXr() {
    const defaultTarget = this.renderer.getRenderTarget()!;
    const renderer = this.renderer;
    const xrEnabled = renderer.xr.enabled;
    const xrIsPresenting = renderer.xr.isPresenting;
    const renderTargets = this.renderTargets;
    const viewport = new THREE.Vector4();
    renderer.getViewport(viewport);
    renderer.xr.cameraAutoUpdate = false;
    renderer.xr.enabled = false;
    const deltaTime = this.timer.getDelta();
    if (renderer.xr.getCamera().cameras.length == 2) {
      for (let camIndex = 0; camIndex < 2; ++camIndex) {
        const cam = renderer.xr.getCamera().cameras[camIndex];
        renderer.setViewport(cam.viewport);
        renderer.setRenderTarget(renderTargets[camIndex]);
        renderer.clear();
        renderer.xr.isPresenting = true;
        renderer.render(this.scene, cam);
      }
      renderer.setRenderTarget(defaultTarget);
      renderer.clear();
      renderer.xr.isPresenting = false;
      renderer.autoClearColor = false;
      for (let eye = 0; eye < 2; eye++) {
        for (let i = 0; i < this.passes.length - 1; ++i) {
          const lastRenderTargetIndex = i % 2;
          const nextRenderTargetIndex = (i + 1) % 2;
          defaultTarget.viewport.set(
              eye * this.dimensions.x / 2, 0, this.dimensions.x / 2,
              this.dimensions.y);
          this.passes[i].render(
              renderer, this.renderTargets[2 * nextRenderTargetIndex + eye],
              this.renderTargets[2 * lastRenderTargetIndex + eye], deltaTime,
              /*maskActive=*/ false, /*viewId=*/ eye);
        }
        if (this.passes.length > 0) {
          const lastRenderTargetIndex = (this.passes.length - 1) % 2;
          defaultTarget.viewport.set(
              eye * this.dimensions.x / 2, 0, this.dimensions.x / 2,
              this.dimensions.y);
          this.passes[this.passes.length - 1].render(
              renderer, defaultTarget,
              this.renderTargets[2 * lastRenderTargetIndex + eye], deltaTime,
              /*maskActive=*/ false, /*viewId=*/ eye);
        }
      }
      renderer.xr.enabled = xrEnabled;
      renderer.xr.isPresenting = xrIsPresenting;
    }
  }

  private renderSimulator() {
    const defaultTarget = this.renderer.getRenderTarget()!;
    const renderer = this.renderer;
    const xrEnabled = renderer.xr.enabled;
    const xrIsPresenting = renderer.xr.isPresenting;
    const viewport = new THREE.Vector4();
    renderer.getViewport(viewport);
    renderer.xr.cameraAutoUpdate = false;
    renderer.xr.enabled = false;
    const deltaTime = this.timer.getDelta();
    renderer.setRenderTarget(defaultTarget);
    renderer.clear();
    renderer.xr.isPresenting = false;
    renderer.autoClearColor = false;
    for (let i = 0; i < this.passes.length - 1; ++i) {
      const lastRenderTargetIndex = i % 2;
      const nextRenderTargetIndex = (i + 1) % 2;
      this.passes[i].render(
          renderer, this.renderTargets[nextRenderTargetIndex],
          this.renderTargets[lastRenderTargetIndex], deltaTime,
          /*maskActive=*/ false, /*viewId=*/ 0);
    }
    if (this.passes.length > 0) {
      const lastRenderTargetIndex = (this.passes.length - 1) % 2;
      this.passes[this.passes.length - 1].render(
          renderer, defaultTarget, this.renderTargets[lastRenderTargetIndex],
          deltaTime,
          /*maskActive=*/ false, /*viewId=*/ 0);
    }
    renderer.xr.enabled = xrEnabled;
    renderer.xr.isPresenting = xrIsPresenting;
  }
}
