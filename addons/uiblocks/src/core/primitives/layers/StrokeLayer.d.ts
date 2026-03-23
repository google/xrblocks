import { InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
import { Paint, StrokeAlign } from '../../types/ShaderTypes';
import { PanelLayer, PanelLayerProperties } from './PanelLayer';
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
export declare class StrokeLayer extends PanelLayer<StrokeLayerProperties> {
    name: string;
    constructor(inputProperties: InProperties<StrokeLayerProperties> | undefined, initialClasses?: Array<InProperties<StrokeLayerProperties> | string> | undefined, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<StrokeLayerProperties>;
        defaults?: WithSignal<StrokeLayerProperties>;
    });
}
