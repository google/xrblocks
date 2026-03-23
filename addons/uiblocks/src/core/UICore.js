import { AdditiveUICard } from './components/additive/AdditiveUICard.js';
import { UICard } from './components/UICard.js';
import '@pmndrs/uikit';
import 'three';
import 'xrblocks';
import './constants/ManipulationPanelConstants.js';
import './constants/UICardConstants.js';
import './mixins/XRUI.js';
import './primitives/ManipulationPanel.js';
import '@preact/signals-core';
import './primitives/ShaderPanel.js';
import './primitives/layers/ManipulationLayer.js';
import './shaders/ManipulationPanel.frag.js';
import './shaders/CommonFunctions.glsl.js';
import './utils/ManipulationPanelUtils.js';
import './utils/ColorUtils.js';
import './utils/ShaderUtils.js';
import './primitives/layers/PanelLayer.js';
import './shaders/Panel.vert.js';

/**
 * UICore: The central entry point for the UI system.
 * Manages the lifecycle of UICards.
 */
class UICore {
    /**
     * @param root - The xrblocks Script to attach UI components to.
     */
    constructor(root) {
        this._cards = [];
        this._root = root;
    }
    /**
     * Creates and registers a new UICard.
     * @param config - The configuration for the new card.
     * @returns The created UICard instance.
     */
    createCard(config) {
        const card = new UICard(config);
        this.register(card);
        // Auto-add to root
        if (this._root && this._root.add) {
            this._root.add(card);
        }
        return card;
    }
    /**
     * Creates and registers a new AdditiveUICard.
     * @param config - The configuration for the new card.
     * @returns The created AdditiveUICard instance.
     */
    createAdditiveCard(config) {
        const card = new AdditiveUICard(config);
        this.register(card);
        // Auto-add to root
        if (this._root && this._root.add) {
            this._root.add(card);
        }
        return card;
    }
    /**
     * Register an existing card to be managed.
     * @param card - The card to register.
     */
    register(card) {
        if (!this._cards.includes(card)) {
            this._cards.push(card);
        }
    }
    /**
     * Unregister and dispose a specific card.
     * @param card - The card to remove.
     */
    unregister(card) {
        const index = this._cards.indexOf(card);
        if (index > -1) {
            this._cards.splice(index, 1);
            // Auto-remove from root
            if (this._root && this._root.remove) {
                this._root.remove(card);
            }
            if (card.dispose)
                card.dispose();
        }
    }
    /**
     * Clear all managed cards.
     */
    clear() {
        const cardsToClear = [...this._cards];
        for (const card of cardsToClear) {
            // Auto-remove from root
            if (this._root && this._root.remove) {
                this._root.remove(card);
            }
            if (card.dispose)
                card.dispose();
        }
        this._cards = [];
    }
    /**
     * Dispose all.
     */
    dispose() {
        this.clear();
    }
    get cards() {
        return this._cards;
    }
}

export { UICore };
