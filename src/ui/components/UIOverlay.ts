import type * as THREE from 'three';

import {type UIAppearance, validateUIAppearance} from '../UIAppearance';
import {UIElement, type UIElementOptions} from '../UIElement';
import {UIExitButton, type UIExitButtonOptions} from './UIExitButton';

export interface UIOverlayOptions extends UIElementOptions {
  appearance?: UIAppearance;
  /** Optional exit button configuration. Pass `true` for standard button or an options object. */
  exitButton?: boolean | UIExitButtonOptions;
}

/** A view-space UI root. World transforms have no rendering effect. */
export class UIOverlay<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIOverlay';
  readonly appearance: UIAppearance;
  readonly exitButton?: UIExitButton;

  constructor({
    appearance = 'surface',
    exitButton,
    children = [],
    ...options
  }: UIOverlayOptions = {}) {
    validateUIAppearance(appearance);
    let resolvedExitButton: UIExitButton | undefined;
    const finalChildren = [...children];
    if (exitButton) {
      const exitOptions = typeof exitButton === 'boolean' ? {} : exitButton;
      resolvedExitButton = new UIExitButton(exitOptions);
      finalChildren.unshift(resolvedExitButton);
    }
    super('overlay', {...options, children: finalChildren});
    this.appearance = appearance;
    this.exitButton = resolvedExitButton;
  }
}
