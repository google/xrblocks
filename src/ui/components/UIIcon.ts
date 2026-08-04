import {UIElement, type UIElementOptions} from '../UIElement';

export interface UIIconOptions extends UIElementOptions {
  icon: string;
  ariaLabel?: string;
}

/** One Material Symbol icon. */
export class UIIcon extends UIElement {
  name = 'UIIcon';
  readonly ariaLabel?: string;
  private _icon: string;

  constructor({icon, ariaLabel, ...options}: UIIconOptions) {
    if (!icon) throw new Error('UIIcon requires an icon name.');
    super('icon', options);
    this._icon = icon;
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
}
