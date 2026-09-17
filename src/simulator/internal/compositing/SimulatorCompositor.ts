import {isWebGPURenderer} from '../../../core/RendererTypes';
import {
  BaseSimulatorCompositor,
  type SimulatorCompositor,
  type SimulatorCompositorDeps,
} from './BaseSimulatorCompositor';
import {WebGLDirectCompositor} from './WebGLDirectCompositor';
import {WebGLRenderTargetCompositor} from './WebGLRenderTargetCompositor';
import type {WebGPUDirectCompositor} from './WebGPUDirectCompositor';
import type {WebGPURenderTargetCompositor} from './WebGPURenderTargetCompositor';

/**
 * Factory function to create the appropriate SimulatorCompositor instance based
 * on the active renderer and render-target configuration.
 *
 * @param deps - Dependencies for the compositor.
 * @param renderToRenderTexture - Whether to render the main scene to an offscreen render target.
 * @returns The instantiated SimulatorCompositor.
 */
export async function createSimulatorCompositor(
  deps: SimulatorCompositorDeps,
  renderToRenderTexture: boolean
): Promise<SimulatorCompositor> {
  if (isWebGPURenderer(deps.renderer)) {
    if (renderToRenderTexture) {
      const {WebGPURenderTargetCompositor} = await import(
        './WebGPURenderTargetCompositor.js'
      );
      return new WebGPURenderTargetCompositor(deps);
    } else {
      const {WebGPUDirectCompositor} = await import(
        './WebGPUDirectCompositor.js'
      );
      return new WebGPUDirectCompositor(deps);
    }
  } else if (renderToRenderTexture) {
    return new WebGLRenderTargetCompositor(deps);
  } else {
    return new WebGLDirectCompositor(deps);
  }
}

export {
  BaseSimulatorCompositor,
  type SimulatorCompositor,
  type SimulatorCompositorDeps,
  WebGLDirectCompositor,
  WebGLRenderTargetCompositor,
  type WebGPUDirectCompositor,
  type WebGPURenderTargetCompositor,
};
