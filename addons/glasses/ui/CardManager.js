import { Card } from "./Card.js";
import * as xb from "xrblocks";
import { signal } from "@preact/signals-core";
//#region src/addons/glasses/ui/CardManager.ts
var CardManager = class extends xb.Script {
	constructor(..._args) {
		super(..._args);
		this.cardActiveSignals = /* @__PURE__ */ new Map();
		this.emptyCard = new Card({ flexGrow: 1 });
		this.scrollPosition = signal(0);
		this.scrollTarget = 0;
		this.cards = signal([]);
		this.autoscroll = true;
		this.autoscrollToLastCard = true;
	}
	createNewCard() {
		const cardTitleSignal = signal();
		const cardBodySignal = signal();
		const cardImageSrcSignal = signal();
		const cardActionButtonSignal = signal();
		const cardActiveSignal = signal(true);
		const newCard = new Card({
			title: cardTitleSignal,
			imageSrc: cardImageSrcSignal,
			body: cardBodySignal,
			actionButton: cardActionButtonSignal,
			flexGrow: 1
		});
		this.cardActiveSignals.set(newCard, cardActiveSignal);
		this.cards.value = [
			...this.cards.value.slice(0, -1),
			newCard,
			this.emptyCard
		];
		return {
			cardTitleSignal,
			cardBodySignal,
			cardImageSrcSignal,
			cardActionButtonSignal,
			cardActiveSignal
		};
	}
	update() {
		if (!this.autoscroll) return;
		if (this.autoscrollToLastCard) this.scrollTarget = Math.max(0, this.cards.value.length - 2);
		const deltaTime = xb.getDeltaTime();
		this.scrollPosition.value = xb.clamp(this.scrollPosition.value + deltaTime * Math.sign(this.scrollTarget - this.scrollPosition.value), 0, this.scrollTarget);
	}
};
//#endregion
export { CardManager };
