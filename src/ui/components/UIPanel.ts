import type * as THREE from 'three';

import {
  isUIElement,
  markUIElementDirty,
  UIElement,
  type UIElementOptions,
} from '../UIElement';

export type UIPanelAppearance = 'none' | 'raised' | 'cluster';

export interface UIPanelOptions extends UIElementOptions {
  appearance?: UIPanelAppearance;
}

/** A passive flex-layout and visual grouping element. */
export class UIPanel<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIPanel';
  private _appearance: UIPanelAppearance;

  constructor({appearance = 'none', ...options}: UIPanelOptions = {}) {
    validateUIPanelAppearance(appearance);
    super('panel', options);
    this._appearance = appearance;
  }

  get appearance(): UIPanelAppearance {
    return this._appearance;
  }

  set appearance(value: UIPanelAppearance) {
    validateUIPanelAppearance(value);
    if (value === this._appearance) return;
    this._appearance = value;
    this.markUIDirty();
    for (const child of this.children) {
      if (isUIElement(child)) markUIElementDirty(child);
    }
  }
}

function validateUIPanelAppearance(
  value: unknown
): asserts value is UIPanelAppearance {
  if (value !== 'none' && value !== 'raised' && value !== 'cluster') {
    throw new Error(`Invalid UI panel appearance "${String(value)}".`);
  }
}
