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
export declare function parseColorWithAlpha(value: THREE.ColorRepresentation | undefined): {
    color: THREE.Color;
    opacity: number;
};
