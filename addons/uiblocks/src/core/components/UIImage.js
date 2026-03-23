import { Image, abortableEffect } from '@pmndrs/uikit';
import { XRUI } from '../mixins/XRUI.js';
import 'xrblocks';

/**
 * UIImage
 * A wrapper component for rendering layout mapped static 2D images or textures.
 * Inherits from standard \@pmndrs/uikit `Image` and overrides updates to correctly sync responsive standard layouts over to internal basic map items properly.
 */
class UIImage extends XRUI(Image) {
    /**
     * Constructs a new UIImage.
     * Forces reactivity chains maintaining material transparencies against opacity changes via internal signals accurately.
     *
     * @param src - The visual source mapping (URL string, Texture, or Signal).
     * @param properties - Optional layout, sizing, and styling properties overriding defaults.
     * @param initialClasses - Optional styling class array identifiers for batch design applying rules.
     * @param config - Optional render contexts or template static mappings defaults triggers.
     */
    constructor(src, properties, initialClasses, config) {
        super({
            src: src,
            ...properties,
        }, initialClasses, 
        // Use the `never` type to forcefully satisfy the strict generic parameter
        // requirements of the `\@pmndrs/uikit` primitive Image class constructor,
        // avoiding `any` overrides and TypeScript generic inference mismatches.
        config);
        this.name = 'UIImage';
        // Force opacity and color on material.
        abortableEffect(() => {
            const { opacity, color } = this.properties.value;
            if (this.material) {
                if (opacity != null) {
                    this.material.transparent = true;
                    this.material.opacity = Number(opacity);
                }
                if (color != null) {
                    const mat = this.material;
                    mat.color.set(color);
                }
                this.material.needsUpdate = true;
            }
        }, this.abortSignal);
    }
    /** Updates the visual src binding (URL string or THREE.Texture). */
    setSrc(src) {
        this.setProperties({ src });
    }
    /** Updates optional tint overlay color dynamically. */
    setColor(color) {
        this.setProperties({ color });
    }
    /** Updates image opacity (0.0 - 1.0) on underlying material setup. */
    setOpacity(opacity) {
        this.setProperties({ opacity });
    }
    /** Updates edge corner curves of the bounding layout mapping setup. */
    setBorderRadius(borderRadius) {
        this.setProperties({ borderRadius });
    }
}

export { UIImage };
