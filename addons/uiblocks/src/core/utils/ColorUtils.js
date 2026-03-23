import * as THREE from 'three';

/**
 * Parses a THREE.ColorRepresentation into a THREE.Color and an opacity value.
 * Supports:
 * - Hex strings (#RRGGBB, #RRGGBBAA, #RGB, #RGBA).
 * - rgb() and rgba() CSS strings.
 * - CSS Color Names ('white', 'red', 'aliceblue') natively via THREE.Color.
 * @param value - The color representation to parse.
 * @returns An object containing the parsed THREE.Color and opacity float (0 to 1).
 */
function parseColorWithAlpha(value) {
    const result = { color: new THREE.Color(0xffffff), opacity: 1.0 };
    if (value === undefined)
        return result;
    if (typeof value === 'string') {
        // 1. Match rgb() or rgba() formats (e.g., rgba(255, 0, 0, 0.5)).
        const rgbaMatch = value.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
        if (rgbaMatch) {
            result.color.setRGB(parseInt(rgbaMatch[1]) / 255, parseInt(rgbaMatch[2]) / 255, parseInt(rgbaMatch[3]) / 255);
            if (rgbaMatch[4] !== undefined) {
                result.opacity = parseFloat(rgbaMatch[4]);
            }
            return result;
        }
        // 2. Match Hex formats with alpha (#RRGGBBAA or #RGBA).
        if (value.startsWith('#') && (value.length === 9 || value.length === 5)) {
            const hex = value.slice(1);
            const isShort = hex.length === 4;
            const maxVal = isShort ? 15 : 255;
            const colorHex = '#' + hex.slice(0, hex.length - (isShort ? 1 : 2));
            const alphaHex = hex.slice(hex.length - (isShort ? 1 : 2));
            result.color.set(colorHex);
            result.opacity = parseInt(alphaHex, 16) / maxVal;
            return result;
        }
    }
    // 3. Fallback: Parse standard 3/6-digit Hex, CSS names, or numbers.
    result.color.set(value);
    return result;
}

export { parseColorWithAlpha };
