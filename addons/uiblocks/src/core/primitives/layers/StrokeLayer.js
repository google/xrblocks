import { effect } from '@preact/signals-core';
import { GradientStrokeFragmentShader } from '../../shaders/GradientStroke.frag.js';
import { createPaintUniforms, updatePaintUniforms, updateStrokeUniforms } from '../../utils/GradientPanelUtils.js';
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
 * Layer responsible for rendering the panel's stroke or border.
 * Uses GradientStrokeFragmentShader.
 */
class StrokeLayer extends PanelLayer {
    constructor(inputProperties, initialClasses = undefined, config = {}) {
        const material = new PanelShaderMaterial({
            fragmentShader: GradientStrokeFragmentShader,
            uniforms: {
                ...createPaintUniforms('u_stroke_'),
                u_stroke_align: { value: 0.0 },
                u_corner_radius: { value: 0.0 },
                u_stroke_width: { value: 0.0 },
                u_drop_shadow_margin: { value: 0.0 },
            },
        });
        super(material, inputProperties, initialClasses, config);
        this.name = 'StrokeLayer';
        effect(() => {
            const signalProps = this.properties.signal;
            updatePaintUniforms(this.material.uniforms, signalProps.strokeColor?.value, 'u_stroke_');
            updateStrokeUniforms(this.material.uniforms, {
                strokeWidth: signalProps.strokeWidth?.value,
                strokeAlign: signalProps.strokeAlign?.value,
            });
        });
    }
}

export { StrokeLayer };
