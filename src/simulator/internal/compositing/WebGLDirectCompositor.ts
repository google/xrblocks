import * as THREE from 'three';

import {BaseSimulatorCompositor} from './BaseSimulatorCompositor';

/**
 * Compositor that renders the simulator scene directly to the canvas
 * followed by the main scene without an intermediate offscreen render target.
 */
export class WebGLDirectCompositor extends BaseSimulatorCompositor {
  renderFrame(renderCamera: THREE.Camera, mainCamera: THREE.Camera): void {
    this.renderSimulatorScenePass(renderCamera, mainCamera);
    const {renderer} = this.deps;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      this.deps.renderMainScene(renderCamera);
    } finally {
      renderer.autoClear = prevAutoClear;
    }
  }
}
