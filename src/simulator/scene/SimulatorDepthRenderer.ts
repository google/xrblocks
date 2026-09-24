import type * as THREE from 'three';

/**
 * Backend renderer interface for rendering and reading back Simulator depth buffers.
 */
export interface SimulatorDepthRenderer {
  readonly depthMaterial: THREE.Material;
  readRenderTargetPixels(
    renderTarget: THREE.WebGLRenderTarget,
    width: number,
    height: number,
    outputBuffer: Float32Array
  ): Promise<THREE.TypedArray>;
  unpackDepthPixels(
    readbackResult: THREE.TypedArray,
    width: number,
    height: number,
    outputBuffer: Float32Array
  ): void;
  dispose(): void;
}
