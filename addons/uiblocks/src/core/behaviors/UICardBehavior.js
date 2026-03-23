/**
 * UICardBehavior
 * Abstract base class for attaching executable layout or spatial modifier logics to a `UICard`.
 * Offers lifecycles for attaching, on-frame ticks updates, and disposes.
 */
class UICardBehavior {
    constructor(properties = {}) {
        this.card = null;
        this.properties = properties;
    }
    /**
     * Called when the behavior is attached to the card.
     */
    onAttach(card) {
        this.card = card;
    }
    /**
     * Cleanup.
     */
    dispose() { }
}

export { UICardBehavior };
