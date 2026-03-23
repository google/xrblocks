import { Custom, abortableEffect } from '@pmndrs/uikit';
import { effect } from '@preact/signals-core';
import * as THREE from 'three';
import { PanelVertexShader } from '../../shaders/Panel.vert.js';

/**
 * Base ShaderMaterial for Panels.
 *
 * Provides default uniforms safe for general use:
 * - `u_time`: 0.0 (safe default for animated shaders)
 * - `u_resolution`: 1x1 (updated automatically by PanelLayer)
 *
 * Subclasses should extend this and add their own specific uniforms.
 */
class PanelShaderMaterial extends THREE.ShaderMaterial {
    constructor(parameters) {
        super({
            vertexShader: PanelVertexShader,
            // Default to pink to indicate "Missing Shader" - Subclasses must override
            fragmentShader: 'void main() { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }',
            transparent: true,
            side: THREE.DoubleSide,
            dithering: true,
            ...parameters,
            uniforms: {
                u_time: { value: 0 },
                u_resolution: { value: new THREE.Vector2(1, 1) },
                ...parameters?.uniforms,
            },
        });
    }
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
class PanelLayer extends Custom {
    /**
     * @param material - The PanelShaderMaterial instance to use for rendering.
     * @param inputProperties - Properties provided by the consumer component.
     * @param initialClasses - Array of classes or styles to apply.
     * @param config - Optional configuration settings for the layer lifecycle.
     */
    constructor(material, inputProperties, initialClasses, config) {
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
                this.orderInfo.value = { ...orderInfo, elementType: 0 };
            }
        }, this.abortSignal);
        // Handle resizing.
        effect(() => {
            const size = this.size.value;
            if (size) {
                this.material.uniforms.u_resolution.value.set(size[0], size[1]);
            }
        });
    }
    /**
     * Helper method to update a shader uniform safely if it exists.
     * @param name - The name of the uniform to update.
     * @param value - The new value for the uniform.
     */
    updateUniform(name, value) {
        if (this.material.uniforms[name]) {
            const u = this.material.uniforms[name];
            if (u)
                u.value = value;
        }
    }
}

export { PanelLayer, PanelShaderMaterial };
