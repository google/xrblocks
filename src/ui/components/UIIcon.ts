import type * as THREE from 'three';

import {UIElement, type UIElementOptions} from '../UIElement';

export type UIIconVariant = 'outlined' | 'rounded' | 'sharp';
export type UIIconWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700;

export interface UIIconOptions extends UIElementOptions {
  icon: string;
  variant?: UIIconVariant;
  weight?: UIIconWeight;
  filled?: boolean;
  ariaLabel?: string;
}

/** One Material Symbol icon. */
export class UIIcon<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIIcon';
  readonly ariaLabel?: string;
  private _icon: string;
  private _variant: UIIconVariant;
  private _weight: UIIconWeight;
  private _filled: boolean;

  constructor({
    icon,
    variant = 'outlined',
    weight = 400,
    filled = false,
    ariaLabel,
    ...options
  }: UIIconOptions) {
    if (!icon) throw new Error('UIIcon requires an icon name.');
    validateVariant(variant);
    validateWeight(weight);
    if (typeof filled !== 'boolean') {
      throw new Error('UIIcon filled must be a boolean.');
    }
    super('icon', options);
    this._icon = icon;
    this._variant = variant;
    this._weight = weight;
    this._filled = filled;
    this.ariaLabel = ariaLabel;
  }

  get icon(): string {
    return this._icon;
  }

  set icon(value: string) {
    if (!value) throw new Error('UIIcon.icon must be a non-empty string.');
    if (value === this._icon) return;
    this._icon = value;
    this.markUIDirty();
  }

  get variant(): UIIconVariant {
    return this._variant;
  }

  set variant(value: UIIconVariant) {
    validateVariant(value);
    if (value === this._variant) return;
    this._variant = value;
    this.markUIDirty();
  }

  get weight(): UIIconWeight {
    return this._weight;
  }

  set weight(value: UIIconWeight) {
    validateWeight(value);
    if (value === this._weight) return;
    this._weight = value;
    this.markUIDirty();
  }

  get filled(): boolean {
    return this._filled;
  }

  set filled(value: boolean) {
    if (typeof value !== 'boolean') {
      throw new Error('UIIcon filled must be a boolean.');
    }
    if (value === this._filled) return;
    this._filled = value;
    this.markUIDirty();
  }
}

function validateVariant(value: UIIconVariant): void {
  if (!['outlined', 'rounded', 'sharp'].includes(value)) {
    throw new Error('UIIcon variant must be outlined, rounded, or sharp.');
  }
}

function validateWeight(value: UIIconWeight): void {
  if (![100, 200, 300, 400, 500, 600, 700].includes(value)) {
    throw new Error('UIIcon weight must be from 100 to 700 in steps of 100.');
  }
}
