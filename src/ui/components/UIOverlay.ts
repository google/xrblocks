import type * as THREE from 'three';

import {type UIAppearance, validateUIAppearance} from '../UIAppearance';
import {UIElement, type UIElementOptions} from '../UIElement';

export interface UIOverlayOptions extends UIElementOptions {
  appearance?: UIAppearance;
}

/** A view-space UI root. World transforms have no rendering effect. */
export class UIOverlay<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIOverlay';
  readonly appearance: UIAppearance;

  constructor({appearance = 'surface', ...options}: UIOverlayOptions = {}) {
    validateUIAppearance(appearance);
    super('overlay', options);
    this.appearance = appearance;
  }
}
