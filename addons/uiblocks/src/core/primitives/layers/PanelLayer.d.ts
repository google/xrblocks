import { BaseOutProperties, Custom, InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
import { ReadonlySignal, Signal } from '@preact/signals-core';
import * as THREE from 'three';
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
 * Maps every property `P` in `T` to a `Signal<T[P] | undefined>`.
 */
export type WritableSignalProperties<T> = {
    [K in keyof T]: Signal<T[K] | undefined>;
};
/**
 * Base ShaderMaterial for Panels.
 *
 * Provides default uniforms safe for general use:
 * - `u_time`: 0.0 (safe default for animated shaders)
 * - `u_resolution`: 1x1 (updated automatically by PanelLayer)
 *
 * Subclasses should extend this and add their own specific uniforms.
 */
export declare class PanelShaderMaterial extends THREE.ShaderMaterial {
    constructor(parameters?: THREE.ShaderMaterialParameters);
}
/**
 * A Custom component that wraps a PanelShaderMaterial.
 *
 * It automatically handles:
 * - Rendering Order (forces `elementType: 0` to render before content)
 * - Resolution Syncing (updates `u_resolution` uniform on resize)
 *
 * It is designed to be added to a `ShaderPanel` via `addLayer()`.
 */
export declare abstract class PanelLayer<TProps extends PanelLayerProperties> extends Custom<TProps> {
    /** The underlying ShaderMaterial instance managed by this layer. */
    material: PanelShaderMaterial;
    /**
     * @param material - The PanelShaderMaterial instance to use for rendering.
     * @param inputProperties - Properties provided by the consumer component.
     * @param initialClasses - Array of classes or styles to apply.
     * @param config - Optional configuration settings for the layer lifecycle.
     */
    constructor(material: PanelShaderMaterial, inputProperties?: InProperties<TProps>, initialClasses?: Array<InProperties<TProps> | string>, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<TProps>;
        defaults?: WithSignal<TProps>;
    });
    /**
     * Helper method to update a shader uniform safely if it exists.
     * @param name - The name of the uniform to update.
     * @param value - The new value for the uniform.
     */
    protected updateUniform(name: string, value: unknown): void;
}
