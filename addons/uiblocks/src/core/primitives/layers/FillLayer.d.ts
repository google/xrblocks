import { InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
import { Paint } from '../../types/ShaderTypes';
import { PanelLayer, PanelLayerProperties } from './PanelLayer';
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
export declare class FillLayer extends PanelLayer<FillLayerProperties> {
    name: string;
    constructor(inputProperties: InProperties<FillLayerProperties> | undefined, initialClasses?: Array<InProperties<FillLayerProperties> | string> | undefined, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<FillLayerProperties>;
        defaults?: WithSignal<FillLayerProperties>;
    });
}
