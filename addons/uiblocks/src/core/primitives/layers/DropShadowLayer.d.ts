import { InProperties, RenderContext, WithSignal } from '@pmndrs/uikit';
import * as THREE from 'three';
import { Paint, StrokeAlign } from '../../types/ShaderTypes';
import { PanelLayer, PanelLayerProperties } from './PanelLayer';
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
export declare class DropShadowLayer extends PanelLayer<DropShadowLayerProperties> {
    name: string;
    constructor(inputProperties: InProperties<DropShadowLayerProperties> | undefined, initialClasses?: Array<InProperties<DropShadowLayerProperties> | string> | undefined, config?: {
        renderContext?: RenderContext;
        defaultOverrides?: InProperties<DropShadowLayerProperties>;
        defaults?: WithSignal<DropShadowLayerProperties>;
    });
}
