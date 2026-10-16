import * as THREE from 'three';
import type {WebGPURenderer} from 'three/webgpu';
import {
  isSerializerRenderer,
  type SerializerRenderer,
  type SerializerRendererFactory,
  type SerializerXRManager,
} from './SerializerTypes';

export {
  isSerializerRenderer,
  type SerializerRenderer,
  type SerializerRendererFactory,
  type SerializerXRManager,
};

/**
 * Union type representing either a THREE.WebGLRenderer or a THREE.WebGPURenderer.
 */
export type WebGLOrWebGPURenderer = THREE.WebGLRenderer | WebGPURenderer;

/**
 * Union type representing any renderer supported by XR Blocks
 * (`THREE.WebGLRenderer`, `THREE.WebGPURenderer`, or `SerializerRenderer`).
 */
export type SupportedRenderer = WebGLOrWebGPURenderer | SerializerRenderer;

/**
 * Type guard to determine if a renderer instance is a THREE.WebGPURenderer.
 *
 * @param renderer - The renderer instance to test.
 * @returns True if the renderer is a WebGPURenderer, false otherwise.
 */
export function isWebGPURenderer(
  renderer?: unknown
): renderer is WebGPURenderer {
  return (
    renderer != null &&
    typeof renderer === 'object' &&
    'isWebGPURenderer' in renderer &&
    (renderer as {isWebGPURenderer?: boolean}).isWebGPURenderer === true
  );
}

/**
 * Asserts that the provided renderer is a THREE.WebGLRenderer.
 *
 * @param renderer - The renderer instance to check.
 * @param consumerName - The name of the subsystem or feature requiring WebGLRenderer.
 * @throws Error if the renderer is a WebGPURenderer.
 */
export function assertWebGLRenderer(
  renderer: SupportedRenderer | undefined,
  consumerName: string
): asserts renderer is THREE.WebGLRenderer {
  if (isWebGPURenderer(renderer)) {
    throw new Error(
      `${consumerName} requires THREE.WebGLRenderer, but Core is configured with WebGPURenderer.`
    );
  }
  if (isSerializerRenderer(renderer)) {
    throw new Error(
      `${consumerName} requires THREE.WebGLRenderer, but Core is configured with SerializerRenderer.`
    );
  }
}

/**
 * Dependency injection holder for the active Three.js renderer (`WebGLRenderer`,
 * `WebGPURenderer`, or `SerializerRenderer`), allowing scripts to request the
 * renderer via `Registry` in O(1) time without statically importing `three/webgpu`.
 */
export class RendererHolder {
  constructor(public readonly renderer: WebGLOrWebGPURenderer) {}
}
