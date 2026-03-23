import * as THREE from 'three';
import { Paint, StrokeAlign } from '../types/ShaderTypes';
import { ShaderPanel, ShaderPanelProperties } from './ShaderPanel';
/**
 * Properties for configuring a GradientPanel.
 * Supports Gradients for Stroke, InnerShadow, and DropShadow.
 */
export type GradientPanelProperties = Omit<ShaderPanelProperties, 'borderColor' | 'borderOpacity' | 'backgroundColor' | 'backgroundOpacity' | 'borderRadius' | 'borderWidth'> & {
    /** Corner radius of the panel. */
    cornerRadius?: number;
    /** Fill color or gradient. */
    fillColor?: Paint;
    /** Inner shadow color or gradient. */
    innerShadowColor?: Paint;
    /** Blurring radius of the inner shadow. */
    innerShadowBlur?: number;
    /** Directional offset of the inner shadow. */
    innerShadowPosition?: THREE.Vector2 | [number, number];
    /** Expansion of the inner shadow silhouette. */
    innerShadowSpread?: number;
    /** Rate of exponential decay for the inner shadow. */
    innerShadowFalloff?: number;
    /** Drop shadow color or gradient. */
    dropShadowColor?: Paint;
    /** Blurring radius of the drop shadow. */
    dropShadowBlur?: number;
    /** Directional offset of the drop shadow. */
    dropShadowPosition?: THREE.Vector2 | [number, number];
    /** Expansion of the drop shadow silhouette. */
    dropShadowSpread?: number;
    /** Rate of exponential decay for the drop shadow. */
    dropShadowFalloff?: number;
    /** Stroke color or gradient. */
    strokeColor?: Paint;
    /** Width of the stroke. */
    strokeWidth?: number;
    /** Alignment of the stroke (inside, outside, center). */
    strokeAlign?: StrokeAlign;
};
/**
 * GradientPanel.
 * Supports Gradients for Stroke, InnerShadow, and DropShadow.
 */
export declare class GradientPanel extends ShaderPanel<GradientPanelProperties> {
    name: string;
    /** Signal storing the nesting level for order offset. */
    private nestingLevelSignal;
    /** Signal storing the corner radius. */
    private cornerRadiusSignal;
    /** Signal storing the fill color/gradient. */
    private fillColorSignal;
    /** Signal storing the inner shadow color/gradient. */
    private innerShadowColorSignal;
    /** Signal storing the inner shadow blur radius. */
    private innerShadowBlurSignal;
    /** Signal storing the inner shadow position offset. */
    private innerShadowPositionSignal;
    /** Signal storing the inner shadow spread expansion. */
    private innerShadowSpreadSignal;
    /** Signal storing the inner shadow falloff rate. */
    private innerShadowFalloffSignal;
    /** Signal storing the computed expansion margin for all layers. */
    private expansionMarginSignal;
    /** Signal storing the drop shadow color/gradient. */
    private dropShadowColorSignal;
    /** Signal storing the drop shadow blur radius. */
    private dropShadowBlurSignal;
    /** Signal storing the drop shadow position offset. */
    private dropShadowPositionSignal;
    /** Signal storing the drop shadow spread expansion. */
    private dropShadowSpreadSignal;
    /** Signal storing the drop shadow falloff rate. */
    private dropShadowFalloffSignal;
    /** Signal storing the stroke color/gradient. */
    private strokeColorSignal;
    /** Signal storing the stroke width. */
    private strokeWidthSignal;
    /** Signal storing the stroke alignment. */
    private strokeAlignSignal;
    /** Layer for rendering the drop shadow. */
    private dropShadowLayer;
    /** Layer for rendering the fill. */
    private fillLayer;
    /** Layer for rendering the inner shadow. */
    private innerShadowLayer;
    /** Layer for rendering the stroke. */
    private strokeLayer;
    constructor(properties?: GradientPanelProperties);
    /** Overrides add method to cascade physical Z-position offsets for nested panels. */
    add(...objects: THREE.Object3D[]): this;
    /** Sets the corner radius of the panel. */
    setCornerRadius(radius: number): void;
    /** Sets the fill color or gradient. */
    setFillColor(c: Paint): void;
    /** Sets the inner shadow color or gradient. */
    setInnerShadowColor(c: Paint): void;
    /** Sets the inner shadow blur radius. */
    setInnerShadowBlur(v: number): void;
    /** Sets the inner shadow position offset. */
    setInnerShadowPosition(v: THREE.Vector2): void;
    /** Sets the inner shadow spread expansion. */
    setInnerShadowSpread(v: number): void;
    /** Sets the inner shadow falloff rate. */
    setInnerShadowFalloff(v: number): void;
    /** Sets the drop shadow color or gradient. */
    setDropShadowColor(c: Paint): void;
    /** Sets the drop shadow blur radius. */
    setDropShadowBlur(v: number): void;
    /** Sets the drop shadow position offset. */
    setDropShadowPosition(v: THREE.Vector2): void;
    /** Sets the drop shadow spread expansion. */
    setDropShadowSpread(v: number): void;
    /** Sets the drop shadow falloff rate. */
    setDropShadowFalloff(v: number): void;
    /** Sets the stroke color or gradient. */
    setStrokeColor(c: Paint): void;
    /** Sets the stroke width. */
    setStrokeWidth(width: number): void;
    /** Sets the stroke alignment (inside, outside, center). */
    setStrokeAlign(align: StrokeAlign): void;
    /**
     * Updates multiple properties at once.
     * Extracts known properties to apply them via signals/setters,
     * passing remaining properties to the super class.
     * @param props - Object containing properties to update.
     */
    setProperties(props: Partial<GradientPanelProperties> & Record<string, unknown>): void;
}
