import { Container } from '@pmndrs/uikit';
import * as THREE from 'three';
import * as xb from 'xrblocks';
import { DEFAULT_MANIPULATION_PANEL_PROPS } from '../constants/ManipulationPanelConstants.js';
import { DEFAULT_CARD_PROPS } from '../constants/UICardConstants.js';
import { XRUI } from '../mixins/XRUI.js';
import { ManipulationPanel } from '../primitives/ManipulationPanel.js';
import '@preact/signals-core';
import '../primitives/ShaderPanel.js';
import '../primitives/layers/ManipulationLayer.js';
import '../shaders/ManipulationPanel.frag.js';
import '../shaders/CommonFunctions.glsl.js';
import '../utils/ManipulationPanelUtils.js';
import '../utils/ColorUtils.js';
import '../utils/ShaderUtils.js';
import '../primitives/layers/PanelLayer.js';
import '../shaders/Panel.vert.js';

/**
 * UICard
 * The **Physical World** bridge. It serves as the root container anchoring UI menus in 3D scene space.
 * Inherits from ManipulationPanel via the XRUI mixin to handle grabbable spatial operations and bounding borders.
 */
class UICard extends XRUI(ManipulationPanel) {
    get isDragging() {
        return this.behaviors.some((b) => 'isDragging' in b && Boolean(b.isDragging));
    }
    /**
     * Constructs a new UICard.
     * Initializes layouts, transparent bounding wrappers, and mounts attached behaviors.
     */
    constructor(config) {
        const { name, position, rotation, behaviors, visible, ...userContainerProps } = config;
        super({
            ...DEFAULT_CARD_PROPS,
            ...userContainerProps,
            cursorSpotlightColor: DEFAULT_MANIPULATION_PANEL_PROPS.cursorSpotlightColor,
            cursorRadius: DEFAULT_MANIPULATION_PANEL_PROPS.cursorRadius,
            cursorSpotlightBlur: DEFAULT_MANIPULATION_PANEL_PROPS.cursorSpotlightBlur,
            manipulationEdgeWidth: DEFAULT_MANIPULATION_PANEL_PROPS.manipulationEdgeWidth,
            manipulationEdgeColor: DEFAULT_MANIPULATION_PANEL_PROPS.manipulationEdgeColor,
            manipulationMargin: 0, // Set by layout method later.
            manipulationCornerRadius: 0, // Set by layout method later.
            // Force transparency and pointer events passthrough on root.
            pointerEvents: 'none',
            backgroundColor: undefined,
            borderColor: undefined,
            borderWidth: undefined,
            borderRadius: undefined,
        });
        this.name = 'UICard';
        this.behaviors = [];
        this.cardPixelSize = config.pixelSize ?? DEFAULT_CARD_PROPS.pixelSize;
        if (userContainerProps.width !== undefined)
            this.baseWidth = userContainerProps.width;
        if (userContainerProps.height !== undefined)
            this.baseHeight = userContainerProps.height;
        this.baseSizeX = config.sizeX ?? DEFAULT_CARD_PROPS.sizeX;
        this.baseSizeY = config.sizeY ?? DEFAULT_CARD_PROPS.sizeY;
        this.name = name || 'UICard';
        // Parse Anchors for position compensation.
        let ax = 0.5;
        let ay = 0.5;
        const rawAx = userContainerProps.anchorX ?? DEFAULT_CARD_PROPS.anchorX;
        const rawAy = userContainerProps.anchorY ?? DEFAULT_CARD_PROPS.anchorY;
        if (rawAx === 'left')
            ax = 0.0;
        else if (rawAx === 'right')
            ax = 1.0;
        else if (typeof rawAx === 'number')
            ax = rawAx;
        if (rawAy === 'bottom')
            ay = 0.0;
        else if (rawAy === 'top')
            ay = 1.0;
        else if (typeof rawAy === 'number')
            ay = rawAy;
        this.anchorX = ax;
        this.anchorY = ay;
        // Setup initial position (store base position before applying layout offsets).
        if (position) {
            this.basePosition = position.clone();
        }
        else {
            this.basePosition = new THREE.Vector3();
        }
        if (position) {
            this.position.copy(position);
        }
        if (rotation) {
            this.quaternion.copy(rotation);
        }
        if (visible !== undefined) {
            this.visible = visible;
        }
        if (behaviors) {
            behaviors.forEach((b) => this.addBehavior(b));
        }
        // Overwrite the raycast of the uikit to not return false.
        this.raycast = () => { };
        // Override intersection logic to correctly target the inner ManipulationLayer.
        // Use local cast to unknown here because bundled '@xrblocks' types might fit outdated interfaces.
        const ux = this.ux;
        if (ux && ux.isRelevantIntersection) {
            ux.isRelevantIntersection = (intersection) => {
                return (intersection.object &&
                    intersection.object.parent === this);
            };
        }
    }
    /**
     * Displays the card.
     * Triggers ToggleAnimationBehavior triggers if available; otherwise toggles `.visible` directly.
     */
    show() {
        // Check for ToggleAnimationBehavior (duck typing).
        const animBehavior = this.behaviors.find((b) => 'playShow' in b &&
            typeof b.playShow === 'function');
        if (animBehavior) {
            animBehavior.playShow();
        }
        else {
            this.visible = true;
        }
    }
    /**
     * Hides the card.
     * Triggers ToggleAnimationBehavior trigger if available; otherwise toggles `.visible` directly.
     */
    hide() {
        const animBehavior = this.behaviors.find((b) => 'playHide' in b &&
            typeof b.playHide === 'function');
        if (animBehavior) {
            animBehavior.playHide();
        }
        else {
            this.visible = false;
        }
    }
    /**
     * Toggles the card's visibility.
     * Defers to ToggleAnimationBehavior if present.
     */
    toggle() {
        const animBehavior = this.behaviors.find((b) => 'toggle' in b &&
            typeof b.toggle === 'function');
        if (animBehavior) {
            animBehavior.toggle();
        }
        else {
            if (this.visible)
                this.hide();
            else
                this.show();
        }
    }
    init(xrCoreInstance) {
        super.init(xrCoreInstance);
    }
    /**
     * Attaches a behavior modifier to the card and triggers its setup cycle.
     */
    addBehavior(behavior) {
        this.behaviors.push(behavior);
        if (behavior.onAttach)
            behavior.onAttach(this);
        if (behavior.update)
            behavior.update();
    }
    /**
     * Detaches a behavior modifier and calls its disposal logic to release event hooks.
     */
    removeBehavior(behavior) {
        const index = this.behaviors.indexOf(behavior);
        if (index !== -1) {
            this.behaviors.splice(index, 1);
            if (behavior.dispose)
                behavior.dispose();
        }
    }
    update() {
        const time = xb.getDeltaTime();
        // Call XRUI mixin update.
        super.update();
        // Safely call Container.update if mixed in.
        if (Container.prototype['update']) {
            Container.prototype['update'].call(this, time);
        }
        for (const behavior of this.behaviors) {
            if (behavior.update)
                behavior.update();
        }
    }
    dispose() {
        for (const behavior of this.behaviors) {
            if (behavior.dispose)
                behavior.dispose();
        }
        this.behaviors = [];
        super.dispose();
    }
}

export { UICard };
