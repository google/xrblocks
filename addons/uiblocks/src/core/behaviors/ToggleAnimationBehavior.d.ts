import { UICard } from '../components/UICard';
import { UICardBehavior } from './UICardBehavior';
/**
 * ToggleAnimationType
 * 'scale' - Standard uniform scale transition factors.
 */
export type ToggleAnimationType = 'scale';
/**
 * Configuration parameters for ToggleAnimationBehavior setup options.
 */
export interface ToggleAnimationConfig {
    /** The show animation approach configuration. */
    showAnimation?: ToggleAnimationType;
    /** The hide animation approach configuration. */
    hideAnimation?: ToggleAnimationType;
    /** Duration in seconds. Defaults to 0.3. */
    duration?: number;
}
/**
 * ToggleAnimationBehavior
 * Handles smooth show/hide transitions for a `UICard` when its visibility changes.
 * Animates scale or translations over finite curves cleanly.
 */
export declare class ToggleAnimationBehavior extends UICardBehavior<ToggleAnimationConfig> {
    private isAnimating;
    private progress;
    private targetState;
    /**
     * Constructs a new ToggleAnimationBehavior.
     */
    constructor(config?: ToggleAnimationConfig);
    onAttach(card: UICard): void;
    /** Plays the show layout visibility animation trigger. */
    playShow(): void;
    /** Plays the hide layout visibility animation trigger. */
    playHide(): void;
    /** Toggles between show/hide layout states. */
    toggle(): void;
    update(): void;
}
