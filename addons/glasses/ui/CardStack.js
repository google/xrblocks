import * as THREE from "three";
import { computed, signal } from "@preact/signals-core";
import { Container, abortableEffect } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/CardStack.ts
const VERTICAL_OFFSET = 18;
var CardContainer = class extends Container {
	constructor(options) {
		super(options);
		this.name = "Card Container";
		const containerBackground = new Container({
			width: "100%",
			height: computed(() => this.size.value?.[1] ?? 0),
			borderBottomRadius: 40,
			backgroundColor: "black",
			positionType: "absolute",
			positionTop: 0
		});
		this.add(containerBackground);
		this.internalBackground = containerBackground;
	}
	dispose() {
		super.dispose();
		this.internalBackground.dispose();
	}
};
var CardStack = class extends Container {
	constructor(properties) {
		super(properties, void 0, { defaultOverrides: {
			width: "100%",
			flexGrow: 1,
			positionType: "relative",
			flexDirection: "column"
		} });
		this.containerCache = /* @__PURE__ */ new Map();
		const currentContainerCardIndex = computed(() => Math.ceil(this.properties.signal.scrollPosition.value));
		abortableEffect(() => {
			const x = currentContainerCardIndex.value;
			const cards = this.properties.signal.cards.value;
			if (x == null || cards == null) return;
			const visibleCards = /* @__PURE__ */ new Set();
			for (let i = Math.max(x - 2, 0); i <= Math.min(x + 2, cards.length - 1); i++) {
				const card = cards[i];
				visibleCards.add(card);
				const cacheEntry = this.containerCache.get(card);
				if (cacheEntry) {
					cacheEntry.cardIndexSignal.value = i;
					this.add(cacheEntry.container);
				} else {
					const cardIndexSignal = signal(i);
					const container = this.createContainer(cardIndexSignal);
					this.add(container);
					container.add(card);
					this.containerCache.set(card, {
						container,
						cardIndexSignal
					});
				}
			}
			for (const [card, { container }] of this.containerCache.entries()) if (!visibleCards.has(card)) this.removeAndDisposeContainer(card, container);
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
		const scrollTransitionAmount = computed(() => this.properties.signal.scrollPosition.value - cardIndex.value + 1);
		const previousContainerPosition = computed(() => {
			return VERTICAL_OFFSET + (scrollTransitionAmount.value - 1) * (myHeight.value - VERTICAL_OFFSET);
		});
		const currentContainerPosition = computed(() => scrollTransitionAmount.value * VERTICAL_OFFSET);
		const isPreviousCard = computed(() => cardIndex.value == currentCardIndex.value - 1);
		const isCurrentCard = computed(() => cardIndex.value == currentCardIndex.value);
		const isNextCard = computed(() => cardIndex.value == currentCardIndex.value + 1);
		return new CardContainer({
			width: "100%",
			height: computed(() => myHeight.value - 18),
			positionType: "absolute",
			positionBottom: computed(() => {
				if (isPreviousCard.value) return previousContainerPosition.value;
				else if (isCurrentCard.value) return currentContainerPosition.value;
				else if (isNextCard.value) return 0;
				return 9999;
			}),
			alignItems: "flex-end",
			transformScale: computed(() => THREE.MathUtils.lerp(.94, 1, THREE.MathUtils.clamp(scrollTransitionAmount.value, 0, 1))),
			zIndex: computed(() => -cardIndex.value),
			opacity: computed(() => isPreviousCard.value || isCurrentCard.value || isNextCard.value ? 1 : 0),
			flexDirection: "column"
		});
	}
	removeAndDisposeContainer(card, container) {
		container.remove(card);
		this.remove(container);
		container.dispose();
		this.containerCache.delete(card);
	}
	/**
	* Disposes the component, triggering the abortableEffect cleanup
	* to dispose all cached containers.
	*/
	dispose() {
		super.dispose();
		for (const [card, { container }] of this.containerCache.entries()) this.removeAndDisposeContainer(card, container);
		this.containerCache.clear();
	}
};
//#endregion
export { CardStack };
