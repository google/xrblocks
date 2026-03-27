import { Signal } from '@preact/signals-core';
import * as xb from 'xrblocks';
import { ButtonProperties } from './ButtonProperties';
import { Card } from './Card';
export declare class CardManager extends xb.Script {
    private cardActiveSignals;
    private emptyCard;
    scrollPosition: Signal<number>;
    scrollTarget: number;
    cards: Signal<Card[]>;
    autoscroll: boolean;
    autoscrollToLastCard: boolean;
    createNewCard(): {
        cardTitleSignal: Signal<string | undefined>;
        cardBodySignal: Signal<string | undefined>;
        cardImageSrcSignal: Signal<string | undefined>;
        cardActionButtonSignal: Signal<ButtonProperties | undefined>;
        cardActiveSignal: Signal<boolean>;
    };
    update(): void;
}
