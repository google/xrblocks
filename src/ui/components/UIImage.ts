import * as THREE from 'three';

import {UIElement, type UIElementOptions} from '../UIElement';

export interface UIImageOptions extends UIElementOptions {
  src: string | THREE.Texture;
  ariaLabel?: string;
}

/** URL-backed or caller-texture-backed image content. */
export class UIImage extends UIElement {
  name = 'UIImage';
  readonly ariaLabel?: string;
  private _src: string | THREE.Texture;

  constructor({src, ariaLabel, ...options}: UIImageOptions) {
    if (typeof src !== 'string' && !(src instanceof THREE.Texture)) {
      throw new Error('UIImage.src must be a URL or THREE.Texture.');
    }
    super('image', options);
    this._src = src;
    this.ariaLabel = ariaLabel;
  }

  get src(): string | THREE.Texture {
    return this._src;
  }

  set src(value: string | THREE.Texture) {
    if (typeof value !== 'string' && !(value instanceof THREE.Texture)) {
      throw new Error('UIImage.src must be a URL or THREE.Texture.');
    }
    if (value === this._src) return;
    this._src = value;
    this.markUIDirty();
  }
}
