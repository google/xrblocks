import { ButtonProperties } from "./ButtonProperties.js";
import { Card } from "./Card.js";
import * as xb from "xrblocks";
import { Signal } from "@preact/signals-core";
//#region src/addons/glasses/ui/CardManager.d.ts
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
//#endregion