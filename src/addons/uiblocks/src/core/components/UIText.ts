import {
  BaseOutProperties,
  InProperties,
  RenderContext,
  Text,
  TextProperties,
  WithSignal,
} from '@pmndrs/uikit';
import {ColorRepresentation} from 'three';
import {XRUI} from '../mixins/XRUI';

/**
 * Properties for initializing a UIText.
 * Aliases standard \@pmndrs/uikit TextProperties.
 */
export type UITextProperties = TextProperties;

/**
 * UIText
 * A wrapper component for rendering flat 3D text nodes.
 * Inherits from standard \@pmndrs/uikit `Text` and mixes in `XRUI` for layout/styling adapters.
 */
export class UIText extends XRUI(Text) {
  name = 'UIText';

  /**
   * Constructs a new UIText.
   * @param text - The initial string content to display.
   * @param properties - Standard styling overrides (fontSize, color, etc).
   * @param initialClasses - Optional layout class strings.
   * @param config - Optional context references.
   */
  constructor(
    text: string,
    properties?: UITextProperties,
    initialClasses?: Array<InProperties<BaseOutProperties> | string>,
    config?: {
      renderContext?: RenderContext;
      defaults?: WithSignal<UITextProperties>;
    }
  ) {
    super(
      {
        text: text,
        ...properties,
      },
      initialClasses,
      // Cast the configuration parameter to match the strict `@pmndrs/uikit`
      // `Text` class constructor, bypassing structural type inference errors.
      config as unknown as ConstructorParameters<typeof Text>[2]
    );
  }

  /** Updates the text content dynamically. */
  setText(text: string) {
    this.setProperties({text});
  }

  /** Updates font size (in layout points/pixels depending on pixelSize). */
  setFontSize(fontSize: number) {
    this.setProperties({fontSize});
  }

  /** Updates text color representation (HEX, CSS, or THREE.Color). */
  setColor(color: ColorRepresentation) {
    this.setProperties({color});
  }

  /** Updates font weight configuration. */
  setFontWeight(fontWeight: UITextProperties['fontWeight']) {
    this.setProperties({fontWeight});
  }

  /** Updates text opacity (0.0 - 1.0). */
  setOpacity(opacity: number) {
    this.setProperties({opacity});
  }
}
