import {
  abortableEffect,
  InProperties,
  RenderContext,
  WithSignal,
} from '@pmndrs/uikit';
import {GradientFillFragmentShader} from '../../shaders/GradientFill.frag';
import {Paint} from '../../types/ShaderTypes';
import {
  createPaintUniforms,
  updatePaintUniforms,
} from '../../utils/GradientPanelUtils';
import {
  PanelLayer,
  PanelLayerProperties,
  PanelShaderMaterial,
  SignalProperties,
} from './PanelLayer';

/**
 * Properties for configuring a FillLayer.
 */
export type FillLayerProperties = PanelLayerProperties & {
  /** Color or gradient of the fill. */
  fillColor?: Paint;
};

/**
 * Layer responsible for rendering the background fill color or gradient.
 * Uses GradientFillFragmentShader.
 */
export class FillLayer extends PanelLayer<FillLayerProperties> {
  name = 'FillLayer';

  constructor(
    inputProperties: InProperties<FillLayerProperties> | undefined,
    initialClasses:
      | Array<InProperties<FillLayerProperties> | string>
      | undefined = undefined,
    config: {
      renderContext?: RenderContext;
      defaultOverrides?: InProperties<FillLayerProperties>;
      defaults?: WithSignal<FillLayerProperties>;
    } = {}
  ) {
    const material = new PanelShaderMaterial({
      fragmentShader: GradientFillFragmentShader,
      uniforms: {
        ...createPaintUniforms('u_fill_'),
        u_corner_radius: {value: 0.0},
        u_stroke_width: {value: 0.0},
        u_drop_shadow_margin: {value: 0.0},
      },
    });

    super(material, inputProperties, initialClasses, config);

    // Sync Signals to Uniforms.
    abortableEffect(() => {
      const signalProps = (
        this.properties as unknown as {
          signal: SignalProperties<FillLayerProperties>;
        }
      ).signal;

      updatePaintUniforms(
        this.material.uniforms,
        signalProps.fillColor?.value,
        'u_fill_'
      );
    }, this.abortSignal);
  }
}
