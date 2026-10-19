import * as THREE from 'three';

import {PanelVertexShader} from '../shaders/Panel.vert';
import {UICardEdgeFragmentShader} from '../shaders/UICardEdge.frag';
import {UnifiedGradientPanelFragmentShader} from '../shaders/UnifiedGradientPanel.frag';

/**
 * Base ShaderMaterial for Panels.
 *
 * Provides default uniforms safe for general use:
 * - `u_time`: 0.0 (safe default for animated shaders)
 * - `u_resolution`: 1x1 (updated automatically by PanelLayer)
 * - `u_opacity`: 1.0 (updated automatically from the UI opacity property)
 *
 * Subclasses should extend this and add their own specific uniforms.
 */
export class PanelShaderMaterial extends THREE.ShaderMaterial {
  constructor(parameters?: THREE.ShaderMaterialParameters) {
    super({
      vertexShader: PanelVertexShader,
      // Default to pink to indicate "Missing Shader" - Subclasses must override
      fragmentShader: `
        #include <clipping_planes_pars_fragment>
        void main() {
          vec4 diffuseColor = vec4(1.0, 0.0, 1.0, 1.0);
          #include <clipping_planes_fragment>
          gl_FragColor = diffuseColor;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      clipping: true,
      transparent: true,
      toneMapped: false,
      side: THREE.FrontSide,
      forceSinglePass: true,
      dithering: true,
      ...parameters,
      uniforms: {
        u_time: {value: 0},
        u_resolution: {value: new THREE.Vector2(1, 1)},
        u_opacity: {value: 1},
        ...parameters?.uniforms,
      },
    });
  }
}

/** A shader uniform entry: a `{value}` holder like THREE.ShaderMaterial uses. */
export type PanelUniformEntry = {value: unknown};

/** The flat uniform map shared by the GLSL and TSL panel materials. */
export type PanelUniforms = Record<string, PanelUniformEntry>;

/**
 * A panel material exposes the standard `uniforms` map so the layer update
 * code (`updatePaintUniforms`, `setNumber`, ...) works identically for the
 * GLSL and TSL implementations.
 */
export type PanelMaterial = THREE.Material & {uniforms: PanelUniforms};

/** Material options shared by the GLSL and TSL panel material constructors. */
export interface PanelMaterialOptions {
  uniforms: PanelUniforms;
  side?: THREE.Side;
  depthWrite?: boolean;
}

/**
 * Builds the TSL (node material) implementations. Registered by
 * `WebGPUUIMaterials` (loaded via dynamic import on WebGPURenderer) so that
 * nothing in the base UI path statically requires `three/tsl` or
 * `three/webgpu`.
 */
export interface WebGPUUIHandler {
  createUnifiedPanelMaterial(options: PanelMaterialOptions): PanelMaterial;
  createCardEdgeMaterial(options: PanelMaterialOptions): PanelMaterial;
}

let webgpuUIHandler: WebGPUUIHandler | undefined;
let webgpuMaterialLoader: (() => Promise<unknown>) | undefined;
let webgpuMaterialsPromise: Promise<void> | undefined;

/** Installs (or clears) the WebGPU material handler. */
export function setWebGPUUIHandler(handler?: WebGPUUIHandler) {
  webgpuUIHandler = handler;
  if (!handler) {
    webgpuMaterialsPromise = undefined;
  }
}

/**
 * Registers the loader for the TSL material module (called on WebGPURenderer
 * init). The module itself is only fetched when UI is actually used.
 */
export function setWebGPUUIMaterialLoader(
  loader?: () => Promise<unknown>
): void {
  webgpuMaterialLoader = loader;
  webgpuMaterialsPromise = undefined;
}

/**
 * Loads (at most once) and registers the TSL materials. Awaited before any
 * UI material is created, so callers must not create panel materials until it
 * settles.
 */
export function ensureWebGPUUIMaterials(): Promise<void> {
  if (webgpuUIHandler) return Promise.resolve();
  if (!webgpuMaterialLoader) return Promise.resolve();
  webgpuMaterialsPromise ??= webgpuMaterialLoader().then(() => undefined);
  return webgpuMaterialsPromise;
}

function mergeDefaultUniforms(uniforms: PanelUniforms): PanelUniforms {
  return {
    u_time: {value: 0},
    u_resolution: {value: new THREE.Vector2(1, 1)},
    u_opacity: {value: 1},
    ...uniforms,
  };
}

/** Creates the composite fill/stroke/shadow panel material. */
export function createUnifiedPanelMaterial(
  options: PanelMaterialOptions
): PanelMaterial {
  const uniforms = mergeDefaultUniforms(options.uniforms);
  if (webgpuUIHandler) {
    return webgpuUIHandler.createUnifiedPanelMaterial({
      ...options,
      uniforms,
    });
  }
  return new PanelShaderMaterial({
    fragmentShader: UnifiedGradientPanelFragmentShader,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true,
    uniforms,
  }) as unknown as PanelMaterial;
}

/** Creates the hover-lit manipulation edge material. */
export function createCardEdgeMaterial(
  options: PanelMaterialOptions
): PanelMaterial {
  const uniforms = mergeDefaultUniforms(options.uniforms);
  if (webgpuUIHandler) {
    return webgpuUIHandler.createCardEdgeMaterial({...options, uniforms});
  }
  return new PanelShaderMaterial({
    fragmentShader: UICardEdgeFragmentShader,
    side: options.side ?? THREE.DoubleSide,
    depthWrite: options.depthWrite ?? false,
    uniforms,
  }) as unknown as PanelMaterial;
}
