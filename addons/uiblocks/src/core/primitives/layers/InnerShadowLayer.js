import { effect } from '@preact/signals-core';
import { GradientInnerShadowFragmentShader } from '../../shaders/GradientInnerShadow.frag.js';
import { createShadowUniforms, createPaintUniforms, updatePaintUniforms, updateShadowUniforms, updateStrokeUniforms } from '../../utils/GradientPanelUtils.js';
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
 * Layer responsible for rendering the panel's inner shadow.
 * Uses GradientInnerShadowFragmentShader.
 */
class InnerShadowLayer extends PanelLayer {
    constructor(inputProperties, initialClasses = undefined, config = {}) {
        const material = new PanelShaderMaterial({
            fragmentShader: GradientInnerShadowFragmentShader,
            uniforms: {
                ...createPaintUniforms('u_inner_'),
                ...createShadowUniforms('u_inner_'),
                u_corner_radius: { value: 0.0 },
                u_stroke_width: { value: 0.0 },
                u_stroke_align: { value: 0.0 },
                u_drop_shadow_margin: { value: 0.0 },
            },
        });
        super(material, inputProperties, initialClasses, config);
        this.name = 'InnerShadowLayer';
        effect(() => {
            const signalProps = this.properties.signal;
            updatePaintUniforms(this.material.uniforms, signalProps.innerShadowColor?.value, 'u_inner_');
            updateShadowUniforms(this.material.uniforms, {
                blur: signalProps.innerShadowBlur?.value,
                position: signalProps.innerShadowPosition?.value,
                spread: signalProps.innerShadowSpread?.value,
                falloff: signalProps.innerShadowFalloff?.value,
            }, 'u_inner_');
            // Stroke Props for shadow adjustment.
            updateStrokeUniforms(this.material.uniforms, {
                strokeWidth: signalProps.strokeWidth?.value,
                strokeAlign: signalProps.strokeAlign?.value,
            });
        });
    }
}

export { InnerShadowLayer };
