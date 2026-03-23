import { signal } from '@preact/signals-core';
import { ShaderPanel } from './ShaderPanel.js';
import { ManipulationLayer } from './layers/ManipulationLayer.js';
import '@pmndrs/uikit';
import '../shaders/ManipulationPanel.frag.js';
import '../shaders/CommonFunctions.glsl.js';
import '../utils/ManipulationPanelUtils.js';
import 'three';
import '../utils/ColorUtils.js';
import '../utils/ShaderUtils.js';
import './layers/PanelLayer.js';
import '../shaders/Panel.vert.js';

/**
 * A panel that renders interactive manipulation effects like cursor spotlights and edge highlights.
 * It uses a `ManipulationLayer` to draw these effects using custom shaders.
 */
class ManipulationPanel extends ShaderPanel {
    constructor(properties) {
        super(properties);
        this.name = 'ManipulationPanel';
        // Dynamic signals for live cursor tracking (supports up to 2 cursors).
        this._cursorUV = signal(undefined);
        this._showGlow = signal(0);
        this._cursorUV2 = signal(undefined);
        this._showGlow2 = signal(0);
        this._cursorRadius = signal(properties.cursorRadius);
        this._cursorSpotlightColor = signal(properties.cursorSpotlightColor);
        this._cursorSpotlightBlur = signal(properties.cursorSpotlightBlur);
        this._manipulationMargin = signal(properties.manipulationMargin);
        this._manipulationCornerRadius = signal(properties.manipulationCornerRadius);
        this._manipulationEdgeWidth = signal(properties.manipulationEdgeWidth);
        this._manipulationEdgeColor = signal(properties.manipulationEdgeColor);
        this._debug = signal(properties.debug ? 1.0 : 0.0);
        this.manipulationLayer = new ManipulationLayer({
            u_manipulation_margin: this._manipulationMargin,
            u_manipulation_corner_radius: this._manipulationCornerRadius,
            u_cursor_spotlight_color: this._cursorSpotlightColor,
            u_cursor_radius: this._cursorRadius,
            u_cursor_spotlight_blur: this._cursorSpotlightBlur,
            u_manipulation_edge_width: this._manipulationEdgeWidth,
            u_manipulation_edge_color: this._manipulationEdgeColor,
            u_debug: this._debug,
            u_cursor_uv: this._cursorUV,
            u_show_glow: this._showGlow,
            u_cursor_uv_2: this._cursorUV2,
            u_show_glow_2: this._showGlow2,
        });
        this.addLayer(this.manipulationLayer);
        this.manipulationLayer.setProperties({
            zIndexOffset: -20,
        });
    }
    /**
     * Updates the cursor position and visibility.
     * @param uv - The UV coordinates of the cursor, or null to hide.
     * @param index - The cursor index (0 or 1).
     */
    setCursor(uv, index = 0) {
        this.manipulationLayer.updateCursor(uv, index);
    }
    /** Sets the margin for the manipulation area. */
    setManipulationMargin(value) {
        this._manipulationMargin.value = value;
    }
    /** Sets the corner radius for the manipulation area. */
    setManipulationCornerRadius(value) {
        this._manipulationCornerRadius.value = value;
    }
    /** Sets the color of the cursor spotlight. */
    setCursorSpotlightColor(value) {
        this._cursorSpotlightColor.value = value;
    }
    /** Sets the blurring radius of the cursor spotlight. */
    setCursorSpotlightBlur(value) {
        this._cursorSpotlightBlur.value = value;
    }
    /** Sets the radius of the cursor spotlight effect. */
    setCursorRadius(value) {
        this._cursorRadius.value = value;
    }
    /** Sets the width of the manipulation edge highlight. */
    setManipulationEdgeWidth(value) {
        this._manipulationEdgeWidth.value = value;
    }
    /** Sets the color of the manipulation edge highlight. */
    setManipulationEdgeColor(value) {
        this._manipulationEdgeColor.value = value;
    }
}

export { ManipulationPanel };
