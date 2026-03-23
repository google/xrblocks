import { InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
import * as THREE from 'three';
import { Paint, StrokeAlign } from '../../types/ShaderTypes';
import { PanelLayer, PanelLayerProperties } from './PanelLayer';
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
export declare class InnerShadowLayer extends PanelLayer<InnerShadowLayerProperties> {
    name: string;
    constructor(inputProperties: InProperties<InnerShadowLayerProperties> | undefined, initialClasses?: Array<InProperties<InnerShadowLayerProperties> | string> | undefined, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<InnerShadowLayerProperties>;
        defaults?: WithSignal<InnerShadowLayerProperties>;
    });
}
