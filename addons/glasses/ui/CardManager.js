import { signal } from '@preact/signals-core';
import * as xb from 'xrblocks';
import { Card } from './Card.js';
import '@pmndrs/uikit';
import './ActionButton.js';
import './HighlightMaterial.js';
import 'three';
import './MaterialSymbolsIcon.js';
import './utils.js';
import './CardActionButton.js';
import './BoxShadow.js';
import './CardTitleChip.js';

class CardManager extends xb.Script {
    constructor() {
        super(...arguments);
        this.cardActiveSignals = new Map();
        this.emptyCard = new Card({
            flexGrow: 1,
        });
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
            flexGrow: 1,
        });
        this.cardActiveSignals.set(newCard, cardActiveSignal);
        this.cards.value = [
            ...this.cards.value.slice(0, -1),
            newCard,
            this.emptyCard,
        ];
        return {
            cardTitleSignal,
            cardBodySignal,
            cardImageSrcSignal,
            cardActionButtonSignal,
            cardActiveSignal,
        };
    }
    update() {
        if (!this.autoscroll) {
            return;
        }
        if (this.autoscrollToLastCard) {
            this.scrollTarget = Math.max(0, this.cards.value.length - 2);
        }
        // Scroll to the target card.
        const deltaTime = xb.getDeltaTime();
        this.scrollPosition.value = xb.clamp(this.scrollPosition.value +
            deltaTime * Math.sign(this.scrollTarget - this.scrollPosition.value), 0, this.scrollTarget);
    }
}

export { CardManager };
