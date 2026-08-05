import {type UIAppearance, validateUIAppearance} from '../UIAppearance';
import {UIElement, type UIElementOptions} from '../UIElement';

export interface UIOverlayOptions extends UIElementOptions {
  appearance?: UIAppearance;
}

/** A view-space UI root. World transforms have no rendering effect. */
export class UIOverlay extends UIElement {
  name = 'UIOverlay';
  readonly appearance: UIAppearance;

  constructor({appearance = 'surface', ...options}: UIOverlayOptions = {}) {
    validateUIAppearance(appearance);
    super('overlay', options);
    this.appearance = appearance;
  }
}
