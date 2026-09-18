import * as THREE from 'three';
import {texture as tslTexture, uv} from 'three/tsl';
import {NodeMaterial, QuadMesh} from 'three/webgpu';

import {WebGLDirectCompositor} from './WebGLDirectCompositor';

/**
 * Creates a fullscreen QuadMesh with a NodeMaterial configured to sample a
 * video texture right-side-up in both WebGPU and WebGL2 fallback modes.
 */
export function createWebGPUBackgroundVideoQuad(
  videoTexture: THREE.Texture
): QuadMesh {
  const material = new NodeMaterial();
  material.fragmentNode = tslTexture(videoTexture, uv().flipY());
  material.depthTest = false;
  material.depthWrite = false;
  material.lights = false;
  return new QuadMesh(material);
}

/**
 * Compositor that renders the simulator scene directly to the canvas
 * followed by the main scene without an intermediate offscreen render target,
 * configured specifically for WebGPURenderer.
 */
export class WebGPUDirectCompositor extends WebGLDirectCompositor {
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
}
