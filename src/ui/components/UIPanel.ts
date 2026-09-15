import type * as THREE from 'three';

import {UIElement, type UIElementOptions} from '../UIElement';

export type UIPanelOptions = UIElementOptions;

/** A passive flex-layout and visual grouping element. */
export class UIPanel<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIPanel';

  constructor(options: UIPanelOptions = {}) {
    super('panel', options);
  }
}
