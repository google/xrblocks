import { Container, abortableEffect } from '@pmndrs/uikit';
import { computed, signal } from '@preact/signals-core';
import * as THREE from 'three';

const VERTICAL_OFFSET = 18;
class CardContainer extends Container {
    constructor(options) {
        super(options);
        this.name = 'Card Container';
        const containerBackground = new Container({
            width: '100%',
            height: computed(() => this.size.value?.[1] ?? 0),
            borderBottomRadius: 40,
            backgroundColor: 'black',
            positionType: 'absolute',
            positionTop: 0,
        });
        this.add(containerBackground);
        this.internalBackground = containerBackground;
    }
    dispose() {
        super.dispose();
        this.internalBackground.dispose();
    }
}
class CardStack extends Container {
    constructor(properties) {
        super(properties, undefined, {
            defaultOverrides: {
                width: '100%',
                flexGrow: 1,
                positionType: 'relative',
                flexDirection: 'column',
            },
        });
        // Cache to store created containers, keyed by the Card object
        this.containerCache = new Map();
        const currentContainerCardIndex = computed(() => Math.ceil(this.properties.signal.scrollPosition.value));
        abortableEffect(() => {
            const x = currentContainerCardIndex.value;
            const cards = this.properties.signal.cards.value;
            if (x == null || cards == null)
                return;
            const visibleCards = new Set();
            // Iterate through the range of visible cards
            for (let i = Math.max(x - 2, 0); i <= Math.min(x + 2, cards.length - 1); i++) {
                const card = cards[i];
                visibleCards.add(card);
                const cacheEntry = this.containerCache.get(card);
                if (cacheEntry) {
                    // Cache Hit: Update the card's index signal and re-add to scene
                    cacheEntry.cardIndexSignal.value = i;
                    this.add(cacheEntry.container);
                }
                else {
                    // Cache Miss: Create a new container, add the card, and cache it
                    const cardIndexSignal = signal(i);
                    const container = this.createContainer(cardIndexSignal);
                    this.add(container);
                    container.add(card); // Add the external card content
                    this.containerCache.set(card, { container, cardIndexSignal });
                }
            }
            // Prune non-visible containers from the cache
            for (const [card, { container }] of this.containerCache.entries()) {
                if (!visibleCards.has(card)) {
                    this.removeAndDisposeContainer(card, container);
                }
            }
            return () => {
                this.containerCache.forEach(({ container }) => {
                    this.remove(container);
                });
            };
        }, this.abortSignal);
    }
    createContainer(cardIndex) {
        const myHeight = computed(() => this.size.value?.[1] ?? 0);
        const currentCardIndex = computed(() => Math.ceil(this.properties.signal.scrollPosition.value));
        const scrollTransitionAmount = computed(() => this.properties.signal.scrollPosition.value - cardIndex.value + 1.0);
        const previousContainerPosition = computed(() => {
            return (VERTICAL_OFFSET +
                (scrollTransitionAmount.value - 1.0) *
                    (myHeight.value - VERTICAL_OFFSET));
        });
        const currentContainerPosition = computed(() => scrollTransitionAmount.value * VERTICAL_OFFSET);
        const isPreviousCard = computed(() => cardIndex.value == currentCardIndex.value - 1);
        const isCurrentCard = computed(() => cardIndex.value == currentCardIndex.value);
        const isNextCard = computed(() => cardIndex.value == currentCardIndex.value + 1);
        const container = new CardContainer({
            width: '100%',
            height: computed(() => myHeight.value - 18),
            positionType: 'absolute',
            positionBottom: computed(() => {
                if (isPreviousCard.value) {
                    return previousContainerPosition.value;
                }
                else if (isCurrentCard.value) {
                    return currentContainerPosition.value;
                }
                else if (isNextCard.value) {
                    return 0;
                }
                // Card out of range, keep it off screen.
                return 9999;
            }),
            alignItems: 'flex-end',
            transformScale: computed(() => THREE.MathUtils.lerp(0.94, 1, THREE.MathUtils.clamp(scrollTransitionAmount.value, 0, 1))),
            zIndex: computed(() => -cardIndex.value),
            opacity: computed(() => isPreviousCard.value || isCurrentCard.value || isNextCard.value
                ? 1.0
                : 0.0),
            flexDirection: 'column',
        });
        return container;
    }
    removeAndDisposeContainer(card, container) {
        container.remove(card); // Remove the external card content
        this.remove(container); // Remove the container from the stack
        container.dispose();
        this.containerCache.delete(card); // Delete from cache
    }
    /**
     * Disposes the component, triggering the abortableEffect cleanup
     * to dispose all cached containers.
     */
    dispose() {
        super.dispose();
        for (const [card, { container }] of this.containerCache.entries()) {
            this.removeAndDisposeContainer(card, container);
        }
        this.containerCache.clear();
    }
}

export { CardStack };
