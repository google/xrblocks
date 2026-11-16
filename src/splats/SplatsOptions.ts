import {deepMerge} from '../utils/OptionsUtils';
import type {DeepPartial, DeepReadonly} from '../utils/Types';

export type RadixProjectionMethod = 'ewa' | '3dgut' | 'htgs' | 'raygs';
export type RadixSortBits = 16 | 24 | 32;

/**
 * Configuration options for 3D Gaussian Splatting (`@sparkjsdev/radix`) on
 * `THREE.WebGPURenderer` (covering both native WebGPU and its WebGL2 fallback).
 */
export class SplatsOptions {
  /** Whether the Radix splats configuration was explicitly enabled. */
  enabled = false;

  /** Splat projection method used by Radix's `SplatRenderer`. */
  method: RadixProjectionMethod = 'ewa';

  /**
   * Sort key width in bits (`16`, `24`, or `32`). Defaults to `16` (`65,536`
   * depth buckets, executing 2 GPU radix-sort passes instead of 3–4 to keep
   * stereo XR command encoding and compute time within a single 72/90 Hz vsync).
   */
  sortBits: RadixSortBits = 16;

  /**
   * Gaussian cutoff in standard deviations (defaults to `Math.sqrt(4)` = `2.0`
   * to bound stereo alpha-blending overdraw on mobile XR GPUs; Radix's upstream
   * desktop default is `Math.sqrt(8)`).
   */
  maxStdDev?: number = Math.sqrt(4);

  /**
   * Minimum splat/fragment alpha threshold (`0`–`1`). Culls near-invisible
   * splats before sorting and tightens per-splat screen-space quad bounds
   * (`sqrt(2 * ln(alpha / minAlpha))`). Defaults to `5 / 255` (`~0.02`).
   */
  minAlpha?: number = 5 / 255;

  /**
   * Optional minimum integrated 2D screen contribution (`opacity * 2π * sqrt(det(cov2D))`
   * in pixel²·alpha) required to sort and draw a splat.
   */
  minContribution?: number;

  /** Optional minimum screen-space Gaussian radius in pixels. */
  minPixelRadius?: number;

  /** Optional maximum screen-space Gaussian radius in pixels. */
  maxPixelRadius?: number;

  /** Optional maximum Spherical Harmonics degree (`0`–`4`). */
  maxShDegree?: number;

  /** Render order assigned to the shared `SplatRenderer` mesh in the scene. */
  renderOrder = -1;

  /**
   * Number of background workers in Radix's shared CPU sort pool when
   * `WebGPURenderer` runs on its WebGL2 fallback backend (`forceWebGL: true`).
   */
  sortWorkers?: number;

  constructor(options?: DeepReadonly<DeepPartial<SplatsOptions>>) {
    deepMerge(this, options);
  }

  /**
   * Enables Radix splat configuration and merges optional overrides.
   */
  enable(options?: DeepReadonly<DeepPartial<SplatsOptions>>): this {
    this.enabled = true;
    if (options) {
      deepMerge(this, options);
    }
    return this;
  }
}
