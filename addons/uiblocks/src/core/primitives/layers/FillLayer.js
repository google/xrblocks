import { effect } from '@preact/signals-core';
import { GradientFillFragmentShader } from '../../shaders/GradientFill.frag.js';
import { createPaintUniforms, updatePaintUniforms } from '../../utils/GradientPanelUtils.js';
import { PanelLayer, PanelShaderMaterial } from './PanelLayer.js';
import '../../shaders/CommonFunctions.glsl.js';
import '../../shaders/GradientFunctions.glsl.js';
import 'three';
import '../../constants/GradientPanelConstants.js';
import '../../types/ShaderTypes.js';
import '../../utils/ColorUtils.js';
import '../../utils/ShaderUtils.js';
import '@pmndrs/uikit';
import '../../shaders/Panel.vert.js';

/**
 * Layer responsible for rendering the background fill color or gradient.
 * Uses GradientFillFragmentShader.
 */
class FillLayer extends PanelLayer {
    constructor(inputProperties, initialClasses = undefined, config = {}) {
        const material = new PanelShaderMaterial({
            fragmentShader: GradientFillFragmentShader,
            uniforms: {
                ...createPaintUniforms('u_fill_'),
                u_corner_radius: { value: 0.0 },
                u_stroke_width: { value: 0.0 },
                u_drop_shadow_margin: { value: 0.0 },
            },
        });
        super(material, inputProperties, initialClasses, config);
        this.name = 'FillLayer';
        // Sync Signals to Uniforms.
        effect(() => {
            const signalProps = this.properties.signal;
            updatePaintUniforms(this.material.uniforms, signalProps.fillColor?.value, 'u_fill_');
        });
    }
}

export { FillLayer };
