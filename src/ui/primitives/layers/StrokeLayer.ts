import {
  abortableEffect,
  InProperties,
  RenderContext,
  WithSignal,
} from '@pmndrs/uikit';
import {GradientStrokeFragmentShader} from '../../shaders/GradientStroke.frag';
import {Paint, StrokeAlign} from '../../types/ShaderTypes';
import {
  createPaintUniforms,
  updatePaintUniforms,
  updateStrokeUniforms,
} from '../../utils/GradientPanelUtils';
import {
  PanelLayer,
  PanelLayerProperties,
  PanelShaderMaterial,
  SignalProperties,
} from './PanelLayer';

/**
 * Properties for configuring a StrokeLayer.
 */
export type StrokeLayerProperties = PanelLayerProperties & {
  /** Color or gradient of the stroke. */
  strokeColor?: Paint;
  /** Width of the stroke. */
  strokeWidth?: number;
  /** Alignment of the stroke (inside, outside, center). */
  strokeAlign?: StrokeAlign;
};

/**
 * Layer responsible for rendering the panel's stroke or border.
 * Uses GradientStrokeFragmentShader.
 */
export class StrokeLayer extends PanelLayer<StrokeLayerProperties> {
  name = 'StrokeLayer';

  constructor(
    inputProperties: InProperties<StrokeLayerProperties> | undefined,
    initialClasses:
      | Array<InProperties<StrokeLayerProperties> | string>
      | undefined = undefined,
    config: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<StrokeLayerProperties>;
      defaults?: WithSignal<StrokeLayerProperties>;
    } = {}
  ) {
    const material = new PanelShaderMaterial({
      fragmentShader: GradientStrokeFragmentShader,
      uniforms: {
        ...createPaintUniforms('u_stroke_'),
        u_stroke_align: {value: 0.0},
        u_corner_radius: {value: 0.0},
        u_stroke_width: {value: 0.0},
        u_drop_shadow_margin: {value: 0.0},
      },
    });

    super(material, inputProperties, initialClasses, config);

    abortableEffect(() => {
      const signalProps = (
        this.properties as unknown as {
          signal: SignalProperties<StrokeLayerProperties>;
        }
      ).signal;

      updatePaintUniforms(
        this.material.uniforms,
        signalProps.strokeColor?.value,
        'u_stroke_'
      );

      updateStrokeUniforms(this.material.uniforms, {
        strokeWidth: signalProps.strokeWidth?.value,
        strokeAlign: signalProps.strokeAlign?.value,
      });
    }, this.abortSignal);
  }
}
