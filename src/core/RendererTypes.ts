import * as THREE from 'three';
import type {WebGPURenderer} from 'three/webgpu';

/**
 * Union type representing either a THREE.WebGLRenderer or a THREE.WebGPURenderer.
 */
export type WebGLOrWebGPURenderer = THREE.WebGLRenderer | WebGPURenderer;

/**
 * Type guard to determine if a renderer instance is a THREE.WebGPURenderer.
 *
 * @param renderer - The renderer instance to test.
 * @returns True if the renderer is a WebGPURenderer, false otherwise.
 */
export function isWebGPURenderer(
  renderer: WebGLOrWebGPURenderer
): renderer is WebGPURenderer {
  return (
    'isWebGPURenderer' in renderer &&
    (renderer as {isWebGPURenderer?: boolean}).isWebGPURenderer === true
  );
}

/**
 * Asserts that the provided renderer is a THREE.WebGLRenderer.
 *
 * @param renderer - The renderer instance to check.
 * @param consumerName - The name of the subsystem or feature requiring WebGLRenderer.
 * @throws Error if the renderer is a WebGPURenderer or not an instance of THREE.WebGLRenderer.
 */
export function assertWebGLRenderer(
  renderer: WebGLOrWebGPURenderer,
  consumerName: string
): asserts renderer is THREE.WebGLRenderer {
  if (
    isWebGPURenderer(renderer) ||
    !(renderer instanceof THREE.WebGLRenderer)
  ) {
    throw new Error(
      `${consumerName} requires THREE.WebGLRenderer, but Core is configured with WebGPURenderer.`
    );
  }
}
