import type * as THREE from 'three';

import {clamp} from '../../utils/utils';
import {UIElement, type UIElementOptions} from '../UIElement';

export interface UIProgressOptions extends UIElementOptions {
  ariaLabel: string;
  value?: number;
  min?: number;
  max?: number;
}

/**
 * A display-only bar whose fill shows how far a task has progressed. `value`
 * is clamped to `[min, max]`; `min` and `max` are fixed at construction.
 */
export class UIProgress<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIProgress';
  readonly ariaLabel: string;

  private readonly _min: number;
  private readonly _max: number;
  private _value: number;

  constructor({
    ariaLabel,
    value = 0,
    min = 0,
    max = 1,
    ...options
  }: UIProgressOptions) {
    if (!ariaLabel) throw new Error('UIProgress requires ariaLabel.');
    validateRange(min, max);
    validateValue(value);
    super('progress', options);
    this.ariaLabel = ariaLabel;
    this._min = min;
    this._max = max;
    this._value = clamp(value, min, max);
  }

  get min(): number {
    return this._min;
  }

  get max(): number {
    return this._max;
  }

  get value(): number {
    return this._value;
  }

  set value(value: number) {
    validateValue(value);
    const next = clamp(value, this._min, this._max);
    if (next === this._value) return;
    this._value = next;
    this.markUIDirty();
  }
}

function validateRange(min: number, max: number): void {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    throw new Error('UIProgress requires finite values with min < max.');
  }
}

function validateValue(value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error('UIProgress value must be finite.');
  }
}
