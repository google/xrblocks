import type * as THREE from 'three';

import type {SelectEvent} from '../../core/Script';
import {registerSemanticControl} from '../../interaction/SemanticControl';
import {isUIElement, UIElement, type UIElementOptions} from '../UIElement';

export interface UIButtonOptions extends UIElementOptions {
  label?: string;
  icon?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
}

/** A semantic button that activates after a valid captured press and release. */
export class UIButton extends UIElement {
  name = 'UIButton';
  onClick?: () => void;
  private _label?: string;
  private _icon?: string;
  private _ariaLabel?: string;
  private _disabled = false;

  constructor({
    label,
    icon,
    ariaLabel,
    disabled = false,
    onClick,
    children,
    ...options
  }: UIButtonOptions = {}) {
    if (typeof disabled !== 'boolean') {
      throw new Error('UIButton disabled must be a boolean.');
    }
    if (children?.length && (label !== undefined || icon !== undefined)) {
      throw new Error(
        'UIButton convenience label/icon content cannot be combined with children.'
      );
    }
    if (!ariaLabel && !label) {
      throw new Error('UIButton requires ariaLabel when it has no text label.');
    }
    super('button', {...options, children});
    this._label = label;
    this._icon = icon;
    this._ariaLabel = ariaLabel;
    this._disabled = disabled;
    this.onClick = onClick;

    registerSemanticControl(this, {
      kind: 'button',
      isDisabled: () => this._disabled,
      activate: () => this.onClick?.(),
    });
  }

  get label(): string | undefined {
    return this._label;
  }

  set label(value: string | undefined) {
    this.assertConvenienceContent(value);
    const previous = this._label;
    this._label = value;
    try {
      this.assertAccessibleName();
    } catch (error) {
      this._label = previous;
      throw error;
    }
    this.markUIDirty();
    if ((previous === undefined) !== (value === undefined)) {
      this.markUIStructureDirty();
    }
  }

  get icon(): string | undefined {
    return this._icon;
  }

  set icon(value: string | undefined) {
    this.assertConvenienceContent(value);
    const previous = this._icon;
    this._icon = value;
    this.assertAccessibleName();
    this.markUIDirty();
    if ((previous === undefined) !== (value === undefined)) {
      this.markUIStructureDirty();
    }
  }

  get ariaLabel(): string {
    return this._ariaLabel ?? this._label!;
  }

  set ariaLabel(value: string | undefined) {
    const previous = this._ariaLabel;
    this._ariaLabel = value;
    try {
      this.assertAccessibleName();
    } catch (error) {
      this._ariaLabel = previous;
      throw error;
    }
    this.markUIDirty();
  }

  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    if (typeof value !== 'boolean') {
      throw new Error('UIButton disabled must be a boolean.');
    }
    if (value === this._disabled) return;
    this._disabled = value;
    this.markUIDirty();
  }

  onObjectSelectStart(_event: SelectEvent): true {
    return true;
  }

  onObjectSelectEnd(_event: SelectEvent): true {
    return true;
  }

  override add(...objects: THREE.Object3D[]): this {
    if (
      objects.some(isUIElement) &&
      (this._label !== undefined || this._icon !== undefined)
    ) {
      throw new Error(
        'UIButton convenience label/icon content cannot be combined with children.'
      );
    }
    return super.add(...objects);
  }

  private assertConvenienceContent(value: string | undefined): void {
    if (this.children.some(isUIElement) && value !== undefined) {
      throw new Error(
        'UIButton convenience label/icon content cannot be combined with children.'
      );
    }
  }

  private assertAccessibleName(): void {
    if (!this._ariaLabel && !this._label) {
      throw new Error('UIButton requires an accessible name.');
    }
  }
}
