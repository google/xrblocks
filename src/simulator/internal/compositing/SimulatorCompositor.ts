import {isWebGPURenderer} from '../../../core/RendererTypes';
import {
  BaseSimulatorCompositor,
  type SimulatorCompositor,
  type SimulatorCompositorDeps,
} from './BaseSimulatorCompositor';
import {WebGLDirectCompositor} from './WebGLDirectCompositor';
import {WebGLRenderTargetCompositor} from './WebGLRenderTargetCompositor';
import {WebGPUCompositor} from './WebGPUCompositor';

/**
 * Factory function to create the appropriate SimulatorCompositor instance based
 * on the active renderer and render-target configuration.
 *
 * @param deps - Dependencies for the compositor.
 * @param renderToRenderTexture - Whether to render the main scene to an offscreen render target.
 * @returns The instantiated SimulatorCompositor.
 */
export function createSimulatorCompositor(
  deps: SimulatorCompositorDeps,
  renderToRenderTexture: boolean
): SimulatorCompositor {
  if (isWebGPURenderer(deps.renderer)) {
    return new WebGPUCompositor(deps);
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
  WebGPUCompositor,
};
