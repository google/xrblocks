import {
  abortableEffect,
  BaseOutProperties,
  Custom,
  InProperties,
  RenderContext,
  WithSignal,
} from '@pmndrs/uikit';
import {ReadonlySignal, Signal} from '@preact/signals-core';
import * as THREE from 'three';
import {
  type PanelMaterial,
  PanelShaderMaterial,
} from '../../internal/PanelMaterialFactory';

export {PanelShaderMaterial};

/**
 * A constraint type for PanelLayer properties.
 *
 * It enforces that properties must extends `BaseOutProperties` (width, height, flex, etc.),
 * while allowing arbitrary additional string keys (index signature) to support custom
 * shader uniforms (e.g. `u_panelColor`).
 *
 * Use this in your generic `extends` clause:
 * `class MyLayer<T extends PanelLayerProperties> ...`
 */
export type PanelLayerProperties = BaseOutProperties & {
  [uniform: string]: unknown;
};

/**
 * Helper to extract Signal types for local layer component consuming structures.
 * Maps every property `P` in `T` to a `ReadonlySignal<T[P] | undefined>`.
 */
export type SignalProperties<T> = {
  [K in keyof T]: ReadonlySignal<T[K] | undefined>;
};

/**
 * Helper to extract Writable Signal types for layer properties.
 * Maps every property `P` in `T` to a `Signal<T[K] | undefined>`.
 */
export type WritableSignalProperties<T> = {
  [K in keyof T]: Signal<T[K] | undefined>;
};

/**
 * A Custom component that wraps a PanelShaderMaterial.
 *
 * It automatically handles:
 * - Rendering Order (forces `elementType: 0` to render before content)
 * - Resolution Syncing (updates `u_resolution` uniform on resize)
 *
 * It is designed to be added to a `ShaderPanel` via `addLayer()`.
 */
export abstract class PanelLayer<
  TProps extends PanelLayerProperties,
> extends Custom<TProps> {
  /** The underlying material managed by this layer (GLSL or TSL). */
  public material: PanelMaterial;

  /**
   * @param material - The PanelShaderMaterial instance to use for rendering.
   * @param inputProperties - Properties provided by the consumer component.
   * @param initialClasses - Array of classes or styles to apply.
   * @param config - Optional configuration settings for the layer lifecycle.
   */
  constructor(
    material: PanelMaterial,
    inputProperties?: InProperties<TProps>,
    initialClasses?: Array<InProperties<TProps> | string>,
    config?: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<TProps>;
      defaults?: WithSignal<TProps>;
    }
  ) {
    super(inputProperties, initialClasses, {
      material,
      ...config,
    });
    this.material = material;

    // Force ElementType.Panel (0) to ensure background renders before content (Icons/Text).
    abortableEffect(() => {
      const orderInfo = this.orderInfo.value;
      if (orderInfo && orderInfo.elementType !== 0) {
        // We override the elementType in place to correct the sorting order.
        this.orderInfo.value = {...orderInfo, elementType: 0};
      }
    }, this.abortSignal);

    // Handle resizing.
    abortableEffect(() => {
      const size = this.size.value;
      if (size) {
        (this.material.uniforms.u_resolution.value as THREE.Vector2).set(
          size[0],
          size[1]
        );
      }
    }, this.abortSignal);

    // Custom shader layers do not use UIKit's built-in panel material, so they
    // must apply the resolved opacity property through a shared uniform.
    abortableEffect(() => {
      const opacity = (
        this.properties as unknown as {
          signal: SignalProperties<TProps>;
        }
      ).signal.opacity?.value;

      this.material.uniforms.u_opacity.value =
        typeof opacity === 'string'
          ? Number.parseFloat(opacity) / 100
          : (opacity ?? 1);
    }, this.abortSignal);
  }

  /**
   * Helper method to update a shader uniform safely if it exists.
   * @param name - The name of the uniform to update.
   * @param value - The new value for the uniform.
   */
  protected updateUniform(name: string, value: unknown) {
    if (this.material.uniforms[name]) {
      const u = this.material.uniforms[name];
      if (u) u.value = value;
    }
  }
}
