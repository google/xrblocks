import type * as THREE from 'three';

import type {SelectEvent} from '../../core/Script';
import {registerSemanticControl} from '../../interaction/SemanticControl';
import {UIElement, type UIElementOptions} from '../UIElement';

export interface UIToggleOptions extends UIElementOptions {
  ariaLabel: string;
  checked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}

/** An on/off switch that flips after a valid captured press and release. */
export class UIToggle<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends UIElement<TEventMap> {
  name = 'UIToggle';
  readonly ariaLabel: string;
  onChange?: (checked: boolean) => void;
  private _checked: boolean;
  private _disabled: boolean;

  constructor({
    ariaLabel,
    checked = false,
    disabled = false,
    onChange,
    ...options
  }: UIToggleOptions) {
    if (!ariaLabel) throw new Error('UIToggle requires ariaLabel.');
    validateBoolean('checked', checked);
    validateBoolean('disabled', disabled);
    super('toggle', options);
    this.ariaLabel = ariaLabel;
    this._checked = checked;
    this._disabled = disabled;
    this.onChange = onChange;

    registerSemanticControl(this, {
      kind: 'button',
      isDisabled: () => this._disabled,
      activate: () => {
        this._checked = !this._checked;
        this.markUIDirty();
        this.onChange?.(this._checked);
      },
    });
  }

  get checked(): boolean {
    return this._checked;
  }

  set checked(value: boolean) {
    validateBoolean('checked', value);
    if (value === this._checked) return;
    this._checked = value;
    this.markUIDirty();
  }

  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    validateBoolean('disabled', value);
    if (value === this._disabled) return;
    this._disabled = value;
    this.markUIDirty();
  }

  onObjectSelectStart(event: SelectEvent): void {
    event.stopPropagation();
    event.stopGlobalPropagation();
  }

  onObjectSelectEnd(event: SelectEvent): void {
    event.stopPropagation();
    event.stopGlobalPropagation();
  }
}

function validateBoolean(
  property: 'checked' | 'disabled',
  value: unknown
): void {
  if (typeof value !== 'boolean') {
    throw new Error(`UIToggle ${property} must be a boolean.`);
  }
}
