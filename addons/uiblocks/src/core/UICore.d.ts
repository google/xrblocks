import * as xb from 'xrblocks';
import { AdditiveUICard } from './components/additive/AdditiveUICard';
import { UICard, UICardOutProperties } from './components/UICard';
/**
 * UICore: The central entry point for the UI system.
 * Manages the lifecycle of UICards.
 */
export declare class UICore {
    private _cards;
    private _root;
    /**
     * @param root - The xrblocks Script to attach UI components to.
     */
    constructor(root: xb.Script);
    /**
     * Creates and registers a new UICard.
     * @param config - The configuration for the new card.
     * @returns The created UICard instance.
     */
    createCard(config: UICardOutProperties): UICard;
    /**
     * Creates and registers a new AdditiveUICard.
     * @param config - The configuration for the new card.
     * @returns The created AdditiveUICard instance.
     */
    createAdditiveCard(config: UICardOutProperties): AdditiveUICard;
    /**
     * Register an existing card to be managed.
     * @param card - The card to register.
     */
    register(card: UICard): void;
    /**
     * Unregister and dispose a specific card.
     * @param card - The card to remove.
     */
    unregister(card: UICard): void;
    /**
     * Clear all managed cards.
     */
    clear(): void;
    /**
     * Dispose all.
     */
    dispose(): void;
    get cards(): ReadonlyArray<UICard>;
}
