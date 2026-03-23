import * as xb from 'xrblocks';
import { UICardBehavior } from './UICardBehavior.js';

/**
 * ToggleAnimationBehavior
 * Handles smooth show/hide transitions for a `UICard` when its visibility changes.
 * Animates scale or translations over finite curves cleanly.
 */
class ToggleAnimationBehavior extends UICardBehavior {
    /**
     * Constructs a new ToggleAnimationBehavior.
     */
    constructor(config = {}) {
        super({
            showAnimation: config.showAnimation ?? 'scale',
            hideAnimation: config.hideAnimation ?? 'scale',
            duration: config.duration ?? 0.3,
        });
        this.isAnimating = false;
        this.progress = 0; // 0 to 1.
        this.targetState = 'visible';
    }
    onAttach(card) {
        super.onAttach(card);
        // Sync state with initial visibility.
        this.targetState = card.visible ? 'visible' : 'hidden';
        this.progress = this.targetState === 'visible' ? 1 : 0;
        if (this.targetState === 'hidden') {
            // Ensure visual properties match hidden state if needed.
            if (this.properties.showAnimation === 'scale') {
                card.scale.setScalar(0);
            }
        }
    }
    /** Plays the show layout visibility animation trigger. */
    playShow() {
        if (!this.card)
            return;
        this.card.visible = true;
        this.targetState = 'visible';
        this.isAnimating = true;
        // If starting from hidden/zero.
        if (this.properties.showAnimation === 'scale' && this.progress <= 0) {
            this.card.scale.setScalar(0);
        }
    }
    /** Plays the hide layout visibility animation trigger. */
    playHide() {
        if (!this.card)
            return;
        this.targetState = 'hidden';
        this.isAnimating = true;
    }
    /** Toggles between show/hide layout states. */
    toggle() {
        if (this.targetState === 'visible') {
            this.playHide();
        }
        else {
            this.playShow();
        }
    }
    update() {
        if (!this.card || !this.isAnimating)
            return;
        // Clamp delta to avoid massive jumps when waking up from a hidden state
        const safeDt = Math.min(xb.getDeltaTime(), 0.1);
        const duration = this.properties.duration ?? 0.3;
        const speed = 1.0 / Math.max(0.001, duration);
        const dir = this.targetState === 'visible' ? 1 : -1;
        // Advance progress.
        this.progress += dir * speed * safeDt;
        this.progress = Math.max(0, Math.min(1, this.progress));
        // Apply Animation.
        const currentAnim = this.targetState === 'visible'
            ? this.properties.showAnimation
            : this.properties.hideAnimation;
        // Easing (Quad Out).
        // t: 0->1.
        const t = this.progress;
        // Ease out quad: 1 - (1-t)*(1-t).
        const eased = 1 - (1 - t) * (1 - t);
        if (currentAnim === 'scale') {
            const s = eased;
            this.card.scale.setScalar(s);
        }
        // Check completion.
        if ((this.targetState === 'visible' && this.progress >= 1) ||
            (this.targetState === 'hidden' && this.progress <= 0)) {
            this.isAnimating = false;
            if (this.targetState === 'hidden') {
                this.card.visible = false;
            }
        }
    }
}

export { ToggleAnimationBehavior };
