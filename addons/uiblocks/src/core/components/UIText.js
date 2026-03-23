import { Text } from '@pmndrs/uikit';
import { XRUI } from '../mixins/XRUI.js';
import 'xrblocks';

/**
 * UIText
 * A wrapper component for rendering flat 3D text nodes.
 * Inherits from standard \@pmndrs/uikit `Text` and mixes in `XRUI` for layout/styling adapters.
 */
class UIText extends XRUI(Text) {
    /**
     * Constructs a new UIText.
     * @param text - The initial string content to display.
     * @param properties - Standard styling overrides (fontSize, color, etc).
     * @param initialClasses - Optional layout class strings.
     * @param config - Optional context references.
     */
    constructor(text, properties, initialClasses, config) {
        super({
            text: text,
            ...properties,
        }, initialClasses, 
        // Cast the configuration parameter to match the strict `@pmndrs/uikit`
        // `Text` class constructor, bypassing structural type inference errors.
        config);
        this.name = 'UIText';
    }
    /** Updates the text content dynamically. */
    setText(text) {
        this.setProperties({ text });
    }
    /** Updates font size (in layout points/pixels depending on pixelSize). */
    setFontSize(fontSize) {
        this.setProperties({ fontSize });
    }
    /** Updates text color representation (HEX, CSS, or THREE.Color). */
    setColor(color) {
        this.setProperties({ color });
    }
    /** Updates font weight configuration. */
    setFontWeight(fontWeight) {
        this.setProperties({ fontWeight });
    }
    /** Updates text opacity (0.0 - 1.0). */
    setOpacity(opacity) {
        this.setProperties({ opacity });
    }
}

export { UIText };
