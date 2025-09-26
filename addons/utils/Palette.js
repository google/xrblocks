import * as THREE from 'three';

/**
 * Singleton Palette class for generating random colors and
 * selecting from a predefined color palette.
 */
class XRPalette {
    /**
     * Creates a singleton instance of the Palette class.
     */
    constructor() {
        this.fullGColors_ = [
            0x174EA6,
            0xA50E0E,
            0xE37400,
            0x0D652D,
            0x4285F4,
            0xEA4335,
            0xFBBC04,
            0x34A853,
            0xD2E3FC,
            0xFAD2CF,
            0xFEEFC3,
            0xCEEAD6,
            0xF1F3F4,
            0x9AA0A6,
            0x202124,
        ];
        this.liteGColors_ = [0xEA4335, 0x4285F4, 0x34AB53, 0xFBBC04];
        this.lastRandomColor_ = null;
        if (XRPalette.instance) {
            return XRPalette.instance;
        }
        XRPalette.instance = this;
    }
    /**
     * Returns a completely random color.
     * @returns A random color.
     */
    getRandom() {
        return new THREE.Color(Math.random() * 0xffffff);
    }
    getRandomColorFromPalette(palette) {
        let newColor;
        do {
            const baseColorIndex = Math.floor(Math.random() * palette.length);
            const baseColor = palette[baseColorIndex];
            newColor = new THREE.Color(baseColor);
        } while (this.lastRandomColor_ && newColor.equals(this.lastRandomColor_));
        this.lastRandomColor_ = newColor;
        return newColor;
    }
    /**
     * Returns a random color from the predefined Google color palette.
     * @returns A random base color.
     */
    getRandomLiteGColor() {
        return this.getRandomColorFromPalette(this.liteGColors_);
    }
    /**
     * Returns a random color from the predefined Google color palette.
     * @returns A random base color.
     */
    getRandomFullGColor() {
        return this.getRandomColorFromPalette(this.fullGColors_);
    }
}
// Exporting a singleton instance of the Palette class.
const palette = new XRPalette();

export { palette };
