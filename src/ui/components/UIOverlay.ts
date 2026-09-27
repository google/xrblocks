import type * as THREE from 'three';

import {type UIAppearance, validateUIAppearance} from '../UIAppearance';
import {UIElement, type UIElementOptions} from '../UIElement';

export type UIOverlayCompositing = 'direct' | 'screen';

export interface UIOverlayOptions extends UIElementOptions {
  appearance?: UIAppearance;
  /** How this overlay is blended into the rendered scene. */
  compositing?: UIOverlayCompositing;
}

/** A view-space UI root. World transforms have no rendering effect. */
export class UIOverlay<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIOverlay';
  readonly appearance: UIAppearance;
  readonly compositing: UIOverlayCompositing;

  constructor({
    appearance = 'surface',
    compositing = 'direct',
    pointerEvents,
    ...options
  }: UIOverlayOptions = {}) {
    validateUIAppearance(appearance);
    if (compositing !== 'direct' && compositing !== 'screen') {
      throw new Error(
        `Invalid UI overlay compositing "${String(compositing)}".`
      );
    }
    if (
      compositing === 'screen' &&
      pointerEvents !== undefined &&
      pointerEvents !== 'none'
    ) {
      throw new Error('Screen-composited UI overlays cannot receive input.');
    }
    super('overlay', {
      ...options,
      pointerEvents: compositing === 'screen' ? 'none' : pointerEvents,
    });
    this.appearance = appearance;
    this.compositing = compositing;
  }
}
