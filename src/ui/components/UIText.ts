import {UIElement, type UIElementOptions} from '../UIElement';

export interface UITextOptions extends UIElementOptions {
  text: string;
}

/** Text content in a card or overlay layout. */
export class UIText extends UIElement {
  name = 'UIText';
  private _text: string;

  constructor({text, ...options}: UITextOptions) {
    if (typeof text !== 'string') throw new Error('UIText requires text.');
    super('text', options);
    this._text = text;
  }

  get text(): string {
    return this._text;
  }

  set text(value: string) {
    if (typeof value !== 'string')
      throw new Error('UIText.text must be a string.');
    if (value === this._text) return;
    this._text = value;
    this.markUIDirty();
  }
}
