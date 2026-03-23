import * as THREE from 'three';
import { ShaderPanel, ShaderPanelProperties } from './ShaderPanel';
import { ManipulationLayer } from './layers/ManipulationLayer';
/**
 * Properties for configuring a ManipulationPanel.
 */
export type ManipulationPanelProperties = ShaderPanelProperties & {
    /** Radius of the cursor spotlight effect. */
    cursorRadius?: number;
    /** Color of the cursor spotlight. */
    cursorSpotlightColor?: THREE.ColorRepresentation;
    /** Blurring radius of the cursor spotlight. */
    cursorSpotlightBlur?: number;
    /** Margin for the manipulation area. */
    manipulationMargin?: number;
    /** Corner radius for the manipulation area. */
    manipulationCornerRadius?: number;
    /** Width of the manipulation edge/border. */
    manipulationEdgeWidth?: number;
    /** Color of the manipulation edge/border. */
    manipulationEdgeColor?: THREE.ColorRepresentation;
    /** Enable debug rendering. */
    debug?: boolean;
};
/**
 * A panel that renders interactive manipulation effects like cursor spotlights and edge highlights.
 * It uses a `ManipulationLayer` to draw these effects using custom shaders.
 */
export declare class ManipulationPanel extends ShaderPanel<ManipulationPanelProperties> {
    name: string;
    /** The layer responsible for rendering the manipulation shader. */
    protected manipulationLayer: ManipulationLayer;
    private readonly _cursorRadius;
    private readonly _cursorSpotlightColor;
    private readonly _cursorSpotlightBlur;
    private readonly _manipulationMargin;
    private readonly _manipulationCornerRadius;
    private readonly _manipulationEdgeWidth;
    private readonly _manipulationEdgeColor;
    private readonly _debug;
    private readonly _cursorUV;
    private readonly _showGlow;
    private readonly _cursorUV2;
    private readonly _showGlow2;
    constructor(properties: ManipulationPanelProperties);
    /**
     * Updates the cursor position and visibility.
     * @param uv - The UV coordinates of the cursor, or null to hide.
     * @param index - The cursor index (0 or 1).
     */
    setCursor(uv: THREE.Vector2 | null, index?: number): void;
    /** Sets the margin for the manipulation area. */
    setManipulationMargin(value: number): void;
    /** Sets the corner radius for the manipulation area. */
    setManipulationCornerRadius(value: number): void;
    /** Sets the color of the cursor spotlight. */
    setCursorSpotlightColor(value: THREE.ColorRepresentation): void;
    /** Sets the blurring radius of the cursor spotlight. */
    setCursorSpotlightBlur(value: number): void;
    /** Sets the radius of the cursor spotlight effect. */
    setCursorRadius(value: number): void;
    /** Sets the width of the manipulation edge highlight. */
    setManipulationEdgeWidth(value: number): void;
    /** Sets the color of the manipulation edge highlight. */
    setManipulationEdgeColor(value: THREE.ColorRepresentation): void;
}
