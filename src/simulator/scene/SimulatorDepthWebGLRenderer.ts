import * as THREE from 'three';

import {SimulatorDepthMaterial} from './SimulatorDepthMaterial';
import type {SimulatorDepthRenderer} from './SimulatorDepthRenderer';

/**
 * WebGL backend implementation for rendering and reading back Simulator depth buffers.
 */
export class SimulatorDepthWebGLRenderer implements SimulatorDepthRenderer {
  readonly depthMaterial = new SimulatorDepthMaterial();
  private depthBufferSlice = new Float32Array();

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  readRenderTargetPixels(
    renderTarget: THREE.WebGLRenderTarget,
    width: number,
    height: number,
    outputBuffer: Float32Array
  ): Promise<THREE.TypedArray> {
    // Preventively unbind PIXEL_PACK_BUFFER before reading from the render target
    // in case external libraries (e.g. Spark.js) left it bound.
    const context = this.renderer.getContext() as WebGL2RenderingContext;
    context.bindBuffer(context.PIXEL_PACK_BUFFER, null);

    return this.renderer.readRenderTargetPixelsAsync(
      renderTarget,
      0,
      0,
      width,
      height,
      outputBuffer
    );
  }

  unpackDepthPixels(
    _readbackResult: THREE.TypedArray,
    width: number,
    height: number,
    outputBuffer: Float32Array
  ): void {
    // Flip the depth buffer vertically in-place (gl.readPixels origin is bottom-left).
    if (this.depthBufferSlice.length !== width) {
      this.depthBufferSlice = new Float32Array(width);
    }
    for (let i = 0; i < height / 2; ++i) {
      const j = height - 1 - i;
      const iOffset = i * width;
      const jOffset = j * width;

      this.depthBufferSlice.set(
        outputBuffer.subarray(iOffset, iOffset + width)
      );
      outputBuffer.copyWithin(iOffset, jOffset, jOffset + width);
      outputBuffer.set(this.depthBufferSlice, jOffset);
    }
  }

  dispose(): void {
    this.depthMaterial.dispose();
  }
}
