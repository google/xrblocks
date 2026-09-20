import * as THREE from 'three';
import {float, positionView, vec4} from 'three/tsl';
import {NodeMaterial, type WebGPURenderer} from 'three/webgpu';

import type {SimulatorDepthRenderer} from './SimulatorDepthRenderer';

/**
 * Creates a WebGPU NodeMaterial for rendering linear view-space depth
 * (-positionView.z) into a float render target in the Simulator.
 *
 * @returns The configured NodeMaterial instance.
 */
export function createSimulatorDepthNodeMaterial(): NodeMaterial {
  const material = new NodeMaterial();
  material.blending = THREE.NoBlending;
  material.forceSinglePass = true;
  material.fragmentNode = vec4(
    positionView.z.negate(),
    float(0.0),
    float(0.0),
    float(1.0)
  );
  return material;
}

/**
 * WebGPU backend implementation for rendering and reading back Simulator depth buffers.
 */
export class SimulatorDepthWebGPURenderer implements SimulatorDepthRenderer {
  readonly depthMaterial = createSimulatorDepthNodeMaterial();

  constructor(private readonly renderer: WebGPURenderer) {}

  readRenderTargetPixels(
    renderTarget: THREE.WebGLRenderTarget,
    width: number,
    height: number
  ): Promise<THREE.TypedArray> {
    return this.renderer.readRenderTargetPixelsAsync(
      renderTarget,
      0,
      0,
      width,
      height
    );
  }

  unpackDepthPixels(
    readbackResult: THREE.TypedArray,
    width: number,
    height: number,
    outputBuffer: Float32Array
  ): void {
    const readbackBuffer = readbackResult as Float32Array;
    const isWebGLFallback =
      'isWebGLBackend' in this.renderer.backend &&
      this.renderer.backend.isWebGLBackend === true;
    const expectedLength = width * height;
    const rowStride =
      readbackBuffer.length > expectedLength
        ? (Math.ceil((width * 4) / 256) * 256) / 4
        : width;

    for (let y = 0; y < height; ++y) {
      const srcRow = isWebGLFallback ? height - 1 - y : y;
      const srcOffset = srcRow * rowStride;
      const dstOffset = y * width;
      outputBuffer.set(
        readbackBuffer.subarray(srcOffset, srcOffset + width),
        dstOffset
      );
    }
  }

  dispose(): void {
    this.depthMaterial.dispose();
  }
}
