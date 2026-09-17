import * as THREE from 'three';

import {WebGLDirectCompositor} from './WebGLDirectCompositor';

/**
 * WebGPU compositor implementation for the simulator.
 *
 * Note: Phase 1 limitations apply: renders directly to the canvas without an
 * offscreen render target, ignores the background video quad, and does not apply
 * custom screen blending (deferred to Phase 2 TSL NodeMaterial compositor).
 */
export class WebGPUCompositor extends WebGLDirectCompositor {
  protected override clearBeforeSimulatorScene(): void {
    this.deps.renderer.clear();
  }

  override setBackgroundVideo(_texture?: THREE.Texture): void {}
}
