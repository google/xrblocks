import * as THREE from 'three';

import {Depth} from '../depth/Depth';

import {SimulatorDepthMaterial} from './SimulatorDepthMaterial';
import {SimulatorScene} from './SimulatorScene';

export class SimulatorDepth {
  renderer!: THREE.WebGLRenderer;
  camera!: THREE.Camera;
  depth!: Depth;
  depthWidth = 160;
  depthHeight = 160;
  depthBufferSlice = new Float32Array();
  depthMaterial!: SimulatorDepthMaterial;
  depthRenderTarget!: THREE.WebGLRenderTarget;
  depthBuffer!: Float32Array;

  constructor(private simulatorScene: SimulatorScene) {}

  /**
   * Initialize Simulator Depth.
   */
  init(renderer: THREE.WebGLRenderer, camera: THREE.Camera, depth: Depth) {
    this.renderer = renderer;
    this.camera = camera;
    this.depth = depth;

    this.createRenderTarget();
    this.depthMaterial = new SimulatorDepthMaterial();
  }

  createRenderTarget() {
    this.depthRenderTarget =
        new THREE.WebGLRenderTarget(this.depthWidth, this.depthHeight, {
          format: THREE.RedFormat,
          type: THREE.FloatType,
        });
    this.depthBuffer = new Float32Array(this.depthWidth * this.depthHeight);
  }

  update() {
    this.renderDepthScene();
    this.updateDepth();
  }

  renderDepthScene() {
    const originalRenderTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.depthRenderTarget);
    this.simulatorScene.overrideMaterial = this.depthMaterial;
    this.renderer.render(this.simulatorScene, this.camera);
    this.simulatorScene.overrideMaterial = null;
    this.renderer.setRenderTarget(originalRenderTarget);
  }

  updateDepth() {
    // We preventively unbind the PIXEL_PACK_BUFFER before reading from the
    // render target in case external libraries (Spark.js) left it bound.
    const context = this.renderer.getContext() as WebGL2RenderingContext;
    context.bindBuffer(context.PIXEL_PACK_BUFFER, null);

    this.renderer.readRenderTargetPixels(
        this.depthRenderTarget, 0, 0, this.depthWidth, this.depthHeight,
        this.depthBuffer);

    // Flip the depth buffer.
    if (this.depthBufferSlice.length != this.depthWidth) {
      this.depthBufferSlice = new Float32Array(this.depthWidth);
    }
    for (let i = 0; i < this.depthHeight / 2; ++i) {
      const j = this.depthHeight - 1 - i;
      const i_offset = i * this.depthWidth;
      const j_offset = j * this.depthWidth;

      // Copy row i to a temp slice
      this.depthBufferSlice.set(
          this.depthBuffer.subarray(i_offset, i_offset + this.depthWidth));
      // Copy row j to row i
      this.depthBuffer.copyWithin(
          i_offset, j_offset, j_offset + this.depthWidth);
      // Copy the temp slice (original row i) to row j
      this.depthBuffer.set(this.depthBufferSlice, j_offset);
    }

    const depthData = {
      width: this.depthWidth,
      height: this.depthHeight,
      data: this.depthBuffer.buffer,
      rawValueToMeters: 1.0,
    };

    this.depth.updateDepthData(depthData as XRCPUDepthInformation, 0);
  }
}
