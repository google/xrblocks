import { UICard } from '../components/UICard';
/**
 * UICardBehavior
 * Abstract base class for attaching executable layout or spatial modifier logics to a `UICard`.
 * Offers lifecycles for attaching, on-frame ticks updates, and disposes.
 */
export declare abstract class UICardBehavior<T = unknown> {
    protected card: UICard | null;
    protected properties: T;
    constructor(properties?: T);
    /**
     * Called when the behavior is attached to the card.
     */
    onAttach(card: UICard): void;
    /**
     * Called every frame.
     */
    abstract update(): void;
    /**
     * Cleanup.
     */
    dispose(): void;
}
