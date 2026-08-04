import {
  abortableEffect,
  InProperties,
  RenderContext,
  WithSignal,
} from '@pmndrs/uikit';
import * as THREE from 'three';
import {GradientInnerShadowFragmentShader} from '../../shaders/GradientInnerShadow.frag';
import {Paint, StrokeAlign} from '../../types/ShaderTypes';
import {
  createPaintUniforms,
  createShadowUniforms,
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
import {StrokeLayerProperties} from './StrokeLayer';

/**
 * Properties for configuring an InnerShadowLayer.
 */
export type InnerShadowLayerProperties = PanelLayerProperties & {
  /** Color or gradient of the inner shadow. */
  innerShadowColor?: Paint;
  /** Blur radius of the inner shadow. */
  innerShadowBlur?: number;
  /** Position offset of the inner shadow. */
  innerShadowPosition?: THREE.Vector2 | [number, number];
  /** Spread expansion of the inner shadow. */
  innerShadowSpread?: number;
  /** Falloff rate of the inner shadow. */
  innerShadowFalloff?: number;
  /** Stroke width of the parent panel (used for offset calculation). */
  strokeWidth?: number;
  /** Stroke alignment of the parent panel. */
  strokeAlign?: StrokeAlign;
};

/**
 * Layer responsible for rendering the panel's inner shadow.
 * Uses GradientInnerShadowFragmentShader.
 */
export class InnerShadowLayer extends PanelLayer<InnerShadowLayerProperties> {
  name = 'InnerShadowLayer';

  constructor(
    inputProperties: InProperties<InnerShadowLayerProperties> | undefined,
    initialClasses:
      | Array<InProperties<InnerShadowLayerProperties> | string>
      | undefined = undefined,
    config: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<InnerShadowLayerProperties>;
      defaults?: WithSignal<InnerShadowLayerProperties>;
    } = {}
  ) {
    const material = new PanelShaderMaterial({
      fragmentShader: GradientInnerShadowFragmentShader,
      uniforms: {
        ...createPaintUniforms('u_inner_'),
        ...createShadowUniforms('u_inner_'),
        u_corner_radius: {value: 0.0},
        u_stroke_width: {value: 0.0},
        u_stroke_align: {value: 0.0},
        u_drop_shadow_margin: {value: 0.0},
      },
    });

    super(material, inputProperties, initialClasses, config);

    abortableEffect(() => {
      const signalProps = (
        this.properties as unknown as {
          signal: SignalProperties<
            InnerShadowLayerProperties & StrokeLayerProperties
          >;
        }
      ).signal;

      updatePaintUniforms(
        this.material.uniforms,
        signalProps.innerShadowColor?.value,
        'u_inner_'
      );

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

      // Stroke Props for shadow adjustment.
      updateStrokeUniforms(this.material.uniforms, {
        strokeWidth: signalProps.strokeWidth?.value,
        strokeAlign: signalProps.strokeAlign?.value,
      });
    }, this.abortSignal);
  }
}
