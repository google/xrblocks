import { effect } from '@preact/signals-core';
import { GradientDropShadowFragmentShader } from '../../shaders/GradientDropShadow.frag.js';
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

class DropShadowLayer extends PanelLayer {
    constructor(inputProperties, initialClasses = undefined, config = {}) {
        const material = new PanelShaderMaterial({
            fragmentShader: GradientDropShadowFragmentShader,
            uniforms: {
                ...createPaintUniforms('u_drop_'),
                ...createShadowUniforms('u_drop_'),
                u_corner_radius: { value: 0.0 },
                u_stroke_width: { value: 0.0 },
                u_stroke_align: { value: 0.0 },
                u_drop_shadow_margin: { value: 0.0 },
            },
        });
        super(material, inputProperties, initialClasses, config);
        this.name = 'DropShadowLayer';
        effect(() => {
            const signalProps = this.properties.signal;
            updatePaintUniforms(this.material.uniforms, signalProps.dropShadowColor?.value, 'u_drop_');
            updateShadowUniforms(this.material.uniforms, {
                blur: signalProps.dropShadowBlur?.value,
                position: signalProps.dropShadowPosition?.value,
                spread: signalProps.dropShadowSpread?.value,
                falloff: signalProps.dropShadowFalloff?.value,
            }, 'u_drop_');
            // Stroke Props for shadow adjustment.
            updateStrokeUniforms(this.material.uniforms, {
                strokeWidth: signalProps.strokeWidth?.value,
                strokeAlign: signalProps.strokeAlign?.value,
            });
        });
    }
}

export { DropShadowLayer };
