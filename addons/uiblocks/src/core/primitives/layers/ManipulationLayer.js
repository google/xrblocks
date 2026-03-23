import { effect } from '@preact/signals-core';
import { ManipulationPanelFragmentShader } from '../../shaders/ManipulationPanel.frag.js';
import { createManipulationUniforms, updateManipulationUniforms } from '../../utils/ManipulationPanelUtils.js';
import { PanelLayer, PanelShaderMaterial } from './PanelLayer.js';
import '../../shaders/CommonFunctions.glsl.js';
import 'three';
import '../../utils/ColorUtils.js';
import '../../utils/ShaderUtils.js';
import '@pmndrs/uikit';
import '../../shaders/Panel.vert.js';

/**
 * Layer responsible for rendering interactive manipulation effects.
 * Includes cursor spotlights and edge selection highlights.
 */
class ManipulationLayer extends PanelLayer {
    constructor(inputProperties, initialClasses = undefined, config = {}) {
        const material = new PanelShaderMaterial({
            fragmentShader: ManipulationPanelFragmentShader,
            uniforms: {
                ...createManipulationUniforms(),
            },
        });
        super(material, inputProperties, initialClasses, {
            ...config,
            defaultOverrides: {
                positionType: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                width: 'auto',
                height: 'auto',
                ...config.defaultOverrides,
            },
        });
        this.name = 'ManipulationLayer';
        // Sync Signals to Uniforms.
        // This effect runs whenever any of the bound properties change on the component,
        // translating them into updated float/vec/color values in the material uniforms.
        effect(() => {
            const signalProps = this.properties.signal;
            updateManipulationUniforms(this.material.uniforms, {
                u_manipulation_margin: signalProps.u_manipulation_margin?.value,
                u_manipulation_corner_radius: signalProps.u_manipulation_corner_radius?.value,
                u_manipulation_edge_width: signalProps.u_manipulation_edge_width?.value,
                u_manipulation_edge_color: signalProps.u_manipulation_edge_color?.value,
                u_cursor_spotlight_color: signalProps.u_cursor_spotlight_color?.value,
                u_cursor_radius: signalProps.u_cursor_radius?.value,
                u_cursor_spotlight_blur: signalProps.u_cursor_spotlight_blur?.value,
                u_debug: signalProps.u_debug?.value,
                u_cursor_uv: signalProps.u_cursor_uv?.value,
                u_show_glow: signalProps.u_show_glow?.value,
                u_cursor_uv_2: signalProps.u_cursor_uv_2?.value,
                u_show_glow_2: signalProps.u_show_glow_2?.value,
            });
        });
    }
    updateCursor(uv, index = 0) {
        const signalProps = this.properties.signal;
        if (index === 0) {
            if (signalProps.u_cursor_uv)
                signalProps.u_cursor_uv.value = uv ?? undefined;
            if (signalProps.u_show_glow)
                signalProps.u_show_glow.value = uv ? 1.0 : 0.0;
        }
        else if (index === 1) {
            if (signalProps.u_cursor_uv_2)
                signalProps.u_cursor_uv_2.value = uv ?? undefined;
            if (signalProps.u_show_glow_2)
                signalProps.u_show_glow_2.value = uv ? 1.0 : 0.0;
        }
    }
}

export { ManipulationLayer };
