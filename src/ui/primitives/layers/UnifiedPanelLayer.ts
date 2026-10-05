import {
  abortableEffect,
  InProperties,
  RenderContext,
  WithSignal,
} from '@pmndrs/uikit';
import * as THREE from 'three';
import {UnifiedGradientPanelFragmentShader} from '../../shaders/UnifiedGradientPanel.frag';
import {Paint, StrokeAlign} from '../../types/ShaderTypes';
import {
  createPaintUniforms,
  createShadowUniforms,
  isPaintVisible,
  updatePaintUniforms,
  updateShadowUniforms,
  updateStrokeUniforms,
} from '../../utils/GradientPanelUtils';
import {
  PanelLayer,
  PanelLayerProperties,
  PanelShaderMaterial,
  SignalProperties,
} from './PanelLayer';

export type UnifiedPanelLayerProperties = PanelLayerProperties & {
  fillColor?: Paint;
  dropShadowColor?: Paint;
  dropShadowBlur?: number;
  dropShadowPosition?: THREE.Vector2 | [number, number];
  dropShadowSpread?: number;
  dropShadowFalloff?: number;
  innerShadowColor?: Paint;
  innerShadowBlur?: number;
  innerShadowPosition?: THREE.Vector2 | [number, number];
  innerShadowSpread?: number;
  innerShadowFalloff?: number;
  strokeColor?: Paint;
  strokeWidth?: number;
  strokeAlign?: StrokeAlign;
  cornerRadius?: number;
  dropShadowMargin?: number;
};

export class UnifiedPanelLayer extends PanelLayer<UnifiedPanelLayerProperties> {
  name = 'UnifiedPanelLayer';

  constructor(
    inputProperties: InProperties<UnifiedPanelLayerProperties> | undefined,
    initialClasses:
      | Array<InProperties<UnifiedPanelLayerProperties> | string>
      | undefined = undefined,
    config: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<UnifiedPanelLayerProperties>;
      defaults?: WithSignal<UnifiedPanelLayerProperties>;
      side?: THREE.Side;
    } = {}
  ) {
    const material = new PanelShaderMaterial({
      fragmentShader: UnifiedGradientPanelFragmentShader,
      side: config.side ?? THREE.FrontSide,
      uniforms: {
        // Fill
        u_has_fill: {value: 0},
        ...createPaintUniforms('u_fill_'),

        // Drop Shadow
        u_has_drop_shadow: {value: 0},
        ...createPaintUniforms('u_drop_'),
        ...createShadowUniforms('u_drop_'),

        // Inner Shadow
        u_has_inner_shadow: {value: 0},
        ...createPaintUniforms('u_inner_'),
        ...createShadowUniforms('u_inner_'),

        // Stroke
        u_has_stroke: {value: 0},
        ...createPaintUniforms('u_stroke_'),
        u_stroke_width: {value: 0.0},
        u_stroke_align: {value: 0.0},

        // Common
        u_corner_radius: {value: 0.0},
        u_drop_shadow_margin: {value: 0.0},
      },
    });

    super(material, inputProperties, initialClasses, config);

    abortableEffect(() => {
      const signalProps = (
        this.properties as unknown as {
          signal: SignalProperties<UnifiedPanelLayerProperties>;
        }
      ).signal;

      // 1. Fill
      const fillColor = signalProps.fillColor?.value;
      const hasFill = isPaintVisible(fillColor);
      updatePaintUniforms(this.material.uniforms, fillColor, 'u_fill_');
      this.material.uniforms.u_has_fill.value = hasFill ? 1 : 0;

      // 2. Drop Shadow
      const dropShadowColor = signalProps.dropShadowColor?.value;
      const hasDropShadow = isPaintVisible(dropShadowColor);
      updatePaintUniforms(this.material.uniforms, dropShadowColor, 'u_drop_');
      updateShadowUniforms(
        this.material.uniforms,
        {
          blur: signalProps.dropShadowBlur?.value,
          position: signalProps.dropShadowPosition?.value,
          spread: signalProps.dropShadowSpread?.value,
          falloff: signalProps.dropShadowFalloff?.value,
        },
        'u_drop_'
      );
      this.material.uniforms.u_has_drop_shadow.value = hasDropShadow ? 1 : 0;

      // 3. Inner Shadow
      const innerShadowColor = signalProps.innerShadowColor?.value;
      const hasInnerShadow = isPaintVisible(innerShadowColor);
      updatePaintUniforms(this.material.uniforms, innerShadowColor, 'u_inner_');
      updateShadowUniforms(
        this.material.uniforms,
        {
          blur: signalProps.innerShadowBlur?.value,
          position: signalProps.innerShadowPosition?.value,
          spread: signalProps.innerShadowSpread?.value,
          falloff: signalProps.innerShadowFalloff?.value,
        },
        'u_inner_'
      );
      this.material.uniforms.u_has_inner_shadow.value = hasInnerShadow ? 1 : 0;

      // 4. Stroke
      const strokeColor = signalProps.strokeColor?.value;
      const strokeWidth = signalProps.strokeWidth?.value ?? 0;
      const hasStroke = isPaintVisible(strokeColor) && strokeWidth > 0;
      updatePaintUniforms(this.material.uniforms, strokeColor, 'u_stroke_');
      updateStrokeUniforms(this.material.uniforms, {
        strokeWidth,
        strokeAlign: signalProps.strokeAlign?.value,
      });
      this.material.uniforms.u_has_stroke.value = hasStroke ? 1 : 0;

      // 5. Common
      const cornerRadius = signalProps.cornerRadius?.value ?? 0;
      this.material.uniforms.u_corner_radius.value = cornerRadius;

      const dropShadowMargin = signalProps.dropShadowMargin?.value ?? 0;
      this.material.uniforms.u_drop_shadow_margin.value = dropShadowMargin;

      this.material.visible =
        hasFill || hasDropShadow || hasInnerShadow || hasStroke;
    }, this.abortSignal);
  }
}
