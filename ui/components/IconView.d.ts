import { TextView, TextViewOptions } from '../components/TextView.js';
/**
 * A specialized `TextView` component designed for conveniently
 * displaying icons from the Google Material Icons font library.
 *
 * This class simplifies the process of creating an icon by pre-configuring the
 * `font` property. To use it, you provide the codepoint or ligature for the
 * desired icon in the `text` option.
 *
 * @example
 * ```typescript
 * // Creates a 'home' icon.
 * const homeIcon = new IconView({ text: 'home', fontSize: 0.1 });
 * ```
 */
export type IconViewOptions = TextViewOptions;
export declare class IconView extends TextView {
    constructor(options?: IconViewOptions);
}
