import type {RenderItem} from 'three';

/**
 * Options for configuring integration with \@pmndrs/uikit.
 */
export class UIKitOptions {
  /** Whether UIKit support is enabled. */
  enabled = false;

  /** The custom sorting function provided by \@pmndrs/uikit. */
  reversePainterSortStable?: (a: RenderItem, b: RenderItem) => number;

  /**
   * Enables \@pmndrs/uikit integration.
   *
   * @param uikit - The imported `@pmndrs/uikit` module instance.
   * @returns The instance for chaining.
   */
  enable(uikit: {
    reversePainterSortStable: (a: RenderItem, b: RenderItem) => number;
  }): this {
    this.enabled = true;
    this.reversePainterSortStable = uikit.reversePainterSortStable;
    return this;
  }
}
