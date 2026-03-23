import { XRUI } from '../mixins/XRUI.js';
import { GradientPanel } from '../primitives/GradientPanel.js';
import 'xrblocks';
import '@preact/signals-core';
import '../constants/GradientPanelConstants.js';
import 'three';
import '../primitives/ShaderPanel.js';
import '@pmndrs/uikit';
import '../primitives/layers/DropShadowLayer.js';
import '../shaders/GradientDropShadow.frag.js';
import '../shaders/CommonFunctions.glsl.js';
import '../shaders/GradientFunctions.glsl.js';
import '../utils/GradientPanelUtils.js';
import '../types/ShaderTypes.js';
import '../utils/ColorUtils.js';
import '../utils/ShaderUtils.js';
import '../primitives/layers/PanelLayer.js';
import '../shaders/Panel.vert.js';
import '../primitives/layers/FillLayer.js';
import '../shaders/GradientFill.frag.js';
import '../primitives/layers/InnerShadowLayer.js';
import '../shaders/GradientInnerShadow.frag.js';
import '../primitives/layers/StrokeLayer.js';
import '../shaders/GradientStroke.frag.js';

/**
 * UIPanel
 * A unified component for both layout arrangement and visual styling.
 * Supports background gradients, shadows, borders, and flexbox styles.
 *
 * It is also the default entry point for capturing laser pointer Interactions via the XRUI mixin.
 */
class UIPanel extends XRUI(GradientPanel) {
    /**
     * Constructs a new UIPanel.
     * Forces transparency support default for standard overlays and registers internal callbacks for standard beam clicks.
     */
    constructor(properties = {}) {
        // Handle Interaction Defaults.
        const superProps = {
            ...properties,
            pointerEvents: properties.pointerEvents ?? 'none',
        };
        super(superProps);
        // Overwrite the raycast of the uikit to not return false.
        this.raycast = () => { };
        // Assign Callbacks.
        this._onHoverEnter = properties.onHoverEnter;
        this._onHoverExit = properties.onHoverExit;
        this.onClick = properties.onClick;
    }
    /**
     * Internal hook triggered by Mixin beam listeners to trigger user pointer enter hooks.
     */
    onHoverEnter(controller) {
        if (this._onHoverEnter)
            this._onHoverEnter(controller);
        return true;
    }
    /**
     * Internal hook triggered by Mixin beam listeners to trigger user pointer exit hooks.
     */
    onHoverExit(controller) {
        if (this._onHoverExit)
            this._onHoverExit(controller);
        return true;
    }
    /**
     * Internal hook triggered by Mixin beam listeners on select releases to trigger click triggers.
     */
    onObjectSelectEnd() {
        if (this.onClick)
            this.onClick();
        return true;
    }
}

export { UIPanel };
