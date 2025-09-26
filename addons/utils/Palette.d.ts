import * as THREE from 'three';
/**
 * Singleton Palette class for generating random colors and
 * selecting from a predefined color palette.
 */
declare class XRPalette {
    private static instance;
    private fullGColors_;
    private liteGColors_;
    private lastRandomColor_;
    /**
     * Creates a singleton instance of the Palette class.
     */
    constructor();
    /**
     * Returns a completely random color.
     * @returns A random color.
     */
    getRandom(): THREE.Color;
    getRandomColorFromPalette(palette: number[]): THREE.Color;
    /**
     * Returns a random color from the predefined Google color palette.
     * @returns A random base color.
     */
    getRandomLiteGColor(): THREE.Color;
    /**
     * Returns a random color from the predefined Google color palette.
     * @returns A random base color.
     */
    getRandomFullGColor(): THREE.Color;
}
declare const palette: XRPalette;
export { palette };
