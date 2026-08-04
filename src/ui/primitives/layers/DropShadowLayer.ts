import {
  abortableEffect,
  InProperties,
  RenderContext,
  WithSignal,
} from '@pmndrs/uikit';
import * as THREE from 'three';
import {GradientDropShadowFragmentShader} from '../../shaders/GradientDropShadow.frag';
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

/**
 * Properties for configuring a DropShadowLayer.
 */
export type DropShadowLayerProperties = PanelLayerProperties & {
  /** Color or gradient of the drop shadow. */
  dropShadowColor?: Paint;
  /** Blur radius of the drop shadow. */
  dropShadowBlur?: number;
  /** Position offset of the drop shadow. */
  dropShadowPosition?: THREE.Vector2 | [number, number];
  /** Spread expansion of the drop shadow. */
  dropShadowSpread?: number;
  /** Falloff rate of the drop shadow. */
  dropShadowFalloff?: number;
  /** Stroke width of the parent panel (used for offset calculation). */
  strokeWidth?: number;
  /** Stroke alignment of the parent panel. */
  strokeAlign?: StrokeAlign;
};

export class DropShadowLayer extends PanelLayer<DropShadowLayerProperties> {
  name = 'DropShadowLayer';

  constructor(
    inputProperties: InProperties<DropShadowLayerProperties> | undefined,
    initialClasses:
      | Array<InProperties<DropShadowLayerProperties> | string>
      | undefined = undefined,
    config: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<DropShadowLayerProperties>;
      defaults?: WithSignal<DropShadowLayerProperties>;
    } = {}
  ) {
    const material = new PanelShaderMaterial({
      fragmentShader: GradientDropShadowFragmentShader,
      uniforms: {
        ...createPaintUniforms('u_drop_'),
        ...createShadowUniforms('u_drop_'),
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
          signal: SignalProperties<DropShadowLayerProperties>;
        }
      ).signal;

      updatePaintUniforms(
        this.material.uniforms,
        signalProps.dropShadowColor?.value,
        'u_drop_'
      );

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

      // Stroke Props for shadow adjustment.
      updateStrokeUniforms(this.material.uniforms, {
        strokeWidth: signalProps.strokeWidth?.value,
        strokeAlign: signalProps.strokeAlign?.value,
      });
    }, this.abortSignal);
  }
}
