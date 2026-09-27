import { Card } from "./Card.js";
import { BaseOutProperties, Container, InProperties } from "@pmndrs/uikit";
//#region src/addons/glasses/ui/CardStack.d.ts
export type CardStackProperties = BaseOutProperties & {
  scrollPosition: number;
  cards: Card[];
};
export declare class CardStack extends Container<CardStackProperties> {
  private containerCache;
  constructor(properties: InProperties<CardStackProperties>);
  private createContainer;
  private removeAndDisposeContainer;
  /**
   * Disposes the component, triggering the abortableEffect cleanup
   * to dispose all cached containers.
   */
  dispose(): void;
}
//#endregion