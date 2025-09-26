import * as THREE from 'three';

/**
 * Singleton Palette class for generating random colors and
 * selecting from a predefined color palette.
 */

class XRPalette {
  private static instance: XRPalette;

  private fullGColors_: number[] = [
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

  private liteGColors_: number[] = [0xEA4335, 0x4285F4, 0x34AB53, 0xFBBC04];

  private lastRandomColor_: THREE.Color|null = null;

  /**
   * Creates a singleton instance of the Palette class.
   */
  constructor() {
    if (XRPalette.instance) {
      return XRPalette.instance;
    }
    XRPalette.instance = this;
  }

  /**
   * Returns a completely random color.
   * @returns A random color.
   */
  getRandom(): THREE.Color {
    return new THREE.Color(Math.random() * 0xffffff);
  }

  getRandomColorFromPalette(palette: number[]): THREE.Color {
    let newColor: THREE.Color;
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
  getRandomLiteGColor(): THREE.Color {
    return this.getRandomColorFromPalette(this.liteGColors_);
  }

  /**
   * Returns a random color from the predefined Google color palette.
   * @returns A random base color.
   */
  getRandomFullGColor(): THREE.Color {
    return this.getRandomColorFromPalette(this.fullGColors_);
  }
}

// Exporting a singleton instance of the Palette class.
const palette = new XRPalette();
export {palette};
