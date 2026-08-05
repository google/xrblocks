import {UIElement, type UIElementOptions} from '../UIElement';

export type UIOverlayOptions = UIElementOptions;

/** A view-space UI root. World transforms have no rendering effect. */
export class UIOverlay extends UIElement {
  name = 'UIOverlay';

  constructor(options: UIOverlayOptions = {}) {
    super('overlay', options);
  }
}
